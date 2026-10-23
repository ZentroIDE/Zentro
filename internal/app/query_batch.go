// SPDX-License-Identifier: GPL-3.0-only

package app

// Batch execution pipeline for ExecuteQuery/ExplainQuery. Pattern: Pipeline —
// executeQueryWithOptions is a thin orchestrator over ordered, individually
// testable stages: validate → begin session → run batch → run statement.
// Event ordering and cancellation semantics are pinned by query_service_test.go.

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"zentro/internal/constant"
	dbpkg "zentro/internal/db"
	"zentro/internal/utils"
)

// queryJobTitleMaxLen bounds the display title stored on a query Job — long
// enough to be recognizable in the Activity panel's job list, short enough
// that it never wraps the row.
const queryJobTitleMaxLen = 140

// queryJobTitle collapses a query's whitespace and truncates it for display
// as a Job's title. The full statement text is never sent anywhere outside
// the app (see the Jev guardrails); this only feeds the app's own UI.
func queryJobTitle(query string) string {
	collapsed := strings.Join(strings.Fields(query), " ")
	if collapsed == "" {
		return "Query"
	}
	r := []rune(collapsed)
	if len(r) > queryJobTitleMaxLen {
		return string(r[:queryJobTitleMaxLen]) + "…"
	}
	return collapsed
}

// progressEmitInterval throttles started/done progress events for scripts
// with many fast statements (bulk INSERT dumps): emitting a pair per
// statement floods the Wails IPC channel faster than the frontend can drain
// it, queueing the terminal "done" event behind thousands of stale progress
// events. Only the first, last, erroring, and periodically-sampled statements
// emit progress over IPC; every statement still runs and is audit-tracked via
// trackQueryExecution, which has no IPC cost.
const progressEmitInterval = 100 * time.Millisecond

// queryBatch carries one ExecuteQuery invocation through the pipeline stages.
type queryBatch struct {
	tabID            string
	query            string
	statements       []string
	skipEditableMeta bool

	// session and jobHandle are set right after beginQuerySession returns
	// (nil until then, and jobHandle stays nil for the lifetime of the
	// batch when JobService isn't wired). runBatchStatement uses them to
	// record each statement's backend id — see captureBackendID.
	session   *QuerySession
	jobHandle *JobHandle

	// Row counts aggregated across every statement actually executed, so the
	// transaction-summary UI doesn't need a results[] entry for statements the
	// progress-emit throttle skips.
	insertedRows int64
	updatedRows  int64
	deletedRows  int64

	lastProgressEmit time.Time
}

// statementCount reports the batch size as emitted in events — a batch with
// no executable statements still announces itself as one statement.
func (b *queryBatch) statementCount() int {
	if len(b.statements) == 0 {
		return 1
	}
	return len(b.statements)
}

// shouldEmitProgress decides whether statement index emits started/done
// progress events, advancing the throttle window when it does.
func (b *queryBatch) shouldEmitProgress(index int, isSelect bool) bool {
	isFirst := index == 0
	isLast := index == len(b.statements)-1
	if isSelect || isFirst || isLast || time.Since(b.lastProgressEmit) >= progressEmitInterval {
		b.lastProgressEmit = time.Now()
		return true
	}
	return false
}

// recordWrite aggregates a non-select statement's affected rows into the
// batch summary counters.
func (b *queryBatch) recordWrite(statementText string, affected int64) {
	switch dbpkg.ClassifyStatementOperation(statementText) {
	case dbpkg.WriteOperationInsert:
		b.insertedRows += affected
	case dbpkg.WriteOperationUpdate:
		b.updatedRows += affected
	case dbpkg.WriteOperationDelete:
		b.deletedRows += affected
	}
}

func (s *QueryService) executeQueryWithOptions(tabID, query string, skipEditableMeta bool) {
	s.clearCancelled(tabID)

	batch := &queryBatch{
		tabID:            tabID,
		query:            query,
		statements:       dbpkg.SplitStatementsForDriver(s.getDriver(), query),
		skipEditableMeta: skipEditableMeta,
	}

	if err := s.validateBatch(batch); err != nil {
		s.rejectBatch(batch, err)
		return
	}

	ctx, session, cancel, jobHandle := s.beginQuerySession(tabID, queryJobTitle(batch.query), s.jobProfileName(), s.jobDatabase())
	batch.session = session
	batch.jobHandle = jobHandle
	go func() {
		var batchErr error
		defer func() { s.endQuerySession(tabID, session, cancel, jobHandle, batchErr) }()
		batchErr = s.runBatch(ctx, batch)
	}()
}

// validateBatch gates a batch before any session is opened: it must contain
// executable SQL, respect view mode, and pass strict write safety.
func (s *QueryService) validateBatch(b *queryBatch) error {
	if len(b.statements) == 0 {
		return fmt.Errorf("no executable SQL statement found")
	}
	if s.getPrefs().ViewMode && dbpkg.BatchHasMutatingStatements(b.statements) {
		return fmt.Errorf("view mode is enabled: write statements are blocked")
	}
	// Risk analysis always runs at plain-semicolon granularity, independent
	// of how MSSQL groups statements for execution (SplitStatementsForDriver
	// may combine several into one round trip to preserve batch-scoped
	// variables — see executor.go) — a combined statement must not blind
	// AnalyzeStatementRisk's per-statement UPDATE/DELETE-without-WHERE check
	// to whichever risky statement isn't first in the group.
	return s.validateStrictWriteSafety(b.tabID, dbpkg.SplitStatements(b.query), "")
}

// rejectBatch reports a validation failure as a started+done event pair so
// the frontend resolves its running state.
func (s *QueryService) rejectBatch(b *queryBatch, err error) {
	EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryStarted, constant.EventQueryStartedV2, QueryStartedEvent{
		TabID:          b.tabID,
		SourceTabID:    b.tabID,
		Query:          b.query,
		StatementText:  b.query,
		StatementIndex: 0,
		StatementCount: b.statementCount(),
	})
	s.emitDoneWithMore(queryStatement{
		SourceTabID:      b.tabID,
		TabID:            b.tabID,
		Text:             b.query,
		Index:            0,
		Count:            b.statementCount(),
		SkipEditableMeta: b.skipEditableMeta,
	}, 0, 0, false, false, err)
}

// beginQuerySession cancels any session already running on the tab and opens
// a new timeout-bounded one, backed by a Job (when JobService is wired) so
// it shows up in the Activity panel and can be soft-cancelled from there —
// JobService.Cancel cancels the Job's own context, which is the parent of
// the timeout context returned here, so either one stopping propagates into
// ctx the same way the existing CancelQuery path already relies on.
// jobTitle/jobProfile/jobDatabase are display-only (Job.Title/ProfileName/
// Database) — callers on different execution paths (ambient ExecuteQuery
// vs. a Table/Catalog tab's Pinned Environment in query_pinned.go) resolve
// them differently.
func (s *QueryService) beginQuerySession(tabID, jobTitle, jobProfile, jobDatabase string) (context.Context, *QuerySession, context.CancelFunc, *JobHandle) {
	timeout := time.Duration(s.getPrefs().QueryTimeout) * time.Second

	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	if old, ok := s.sessions[tabID]; ok {
		old.CancelFunc()
		delete(s.sessions, tabID)
	}

	// session is created before the Job so SetKillFunc's closure can
	// capture this pointer and read session.BackendID lazily at call
	// time — always whatever the currently running statement's backend
	// id is, without needing to re-register between statements.
	session := &QuerySession{TabID: tabID}

	parent := context.Context(context.Background())
	var jobHandle *JobHandle
	// Internal queries (schema-cache refresh, etc. — anything carrying a
	// "/* zentro: */"/"-- zentro:" marker, see utils.IsInternalSQL) never
	// show up as jobs: they already run every schema refresh and would
	// otherwise flood the Activity panel with rows no user action produced.
	if s.jobs != nil && !utils.IsInternalSQL(jobTitle) {
		parent, jobHandle = s.jobs.Start(context.Background(), JobSpec{
			Kind:         JobKindQuery,
			Title:        jobTitle,
			ProfileName:  jobProfile,
			Database:     jobDatabase,
			TabID:        tabID,
			Capabilities: JobCapabilities{Cancel: true},
		})
		if canceller := s.backendCanceller(); canceller != nil {
			jobHandle.SetKillFunc(func(ctx context.Context) error {
				s.sessionsMu.Lock()
				backendID := session.BackendID
				s.sessionsMu.Unlock()
				if backendID == "" {
					return fmt.Errorf("backend id not yet known")
				}
				return canceller.CancelBackend(ctx, s.getDB(), backendID, true)
			})
		}
	}

	ctx, cancel := context.WithTimeout(parent, timeout)
	session.CancelFunc = cancel
	session.StartedAt = time.Now()
	if jobHandle != nil {
		session.JobID = jobHandle.ID()
	}
	s.sessions[tabID] = session
	return ctx, session, cancel, jobHandle
}

// endQuerySession releases a session opened by beginQuerySession, leaving a
// newer session on the same tab untouched, and finishes the session's Job
// (if any) with the batch's terminal outcome.
func (s *QueryService) endQuerySession(tabID string, session *QuerySession, cancel context.CancelFunc, jobHandle *JobHandle, batchErr error) {
	s.ClearPendingAuditMeta(tabID)
	s.sessionsMu.Lock()
	cancel()
	if s.sessions[tabID] == session {
		delete(s.sessions, tabID)
	}
	s.sessionsMu.Unlock()
	if jobHandle != nil {
		jobHandle.Finish(batchErr)
	}
}

// runBatch executes every statement in order, stopping at the first failure
// or cancellation. The returned error only feeds the batch's Job status
// (nil on success, ctx.Err() on cancellation/timeout, or the failing
// statement's error) — the frontend's own running/error state is driven
// entirely by the started/chunk/done events emitted along the way,
// unchanged by this return value.
func (s *QueryService) runBatch(ctx context.Context, b *queryBatch) error {
	executor := s.getExecutor()
	if !isExecutorReady(executor) {
		err := fmt.Errorf("no active connection")
		s.emitDoneWithMore(queryStatement{
			SourceTabID:      b.tabID,
			TabID:            b.tabID,
			Text:             b.query,
			Index:            0,
			Count:            len(b.statements),
			SkipEditableMeta: b.skipEditableMeta,
		}, 0, 0, true, false, err)
		return err
	}

	for index := range b.statements {
		if ctx.Err() != nil {
			// A prior statement may have completed cleanly and not been the
			// script's last one, in which case no onQueryDone so far resolves
			// the frontend's running state. Emit a synthetic terminal done
			// event so the tab never gets stuck showing "running".
			s.emitBatchSummary(b)
			s.emitTerminalCancelDone(b, ctx.Err())
			return ctx.Err()
		}
		stop, err := s.runBatchStatement(ctx, executor, b, index)
		if stop {
			return err
		}
	}
	return nil
}

// runBatchStatement executes one statement of the batch. It returns
// (true, err) when the batch must stop — err is ctx.Err() for a
// cancellation/timeout or the statement's own execution error for a real
// failure — and (false, nil) to continue to the next statement.
func (s *QueryService) runBatchStatement(ctx context.Context, executor sqlExecutor, b *queryBatch, index int) (bool, error) {
	statement := queryStatement{
		SourceTabID:      b.tabID,
		TabID:            resultTabID(b.tabID, index),
		Text:             b.statements[index],
		Index:            index,
		Count:            len(b.statements),
		SkipEditableMeta: b.skipEditableMeta,
	}

	// A statement combined by SplitStatementsForDriver to preserve MSSQL
	// batch-scoped state (see executor.go) contains more than one internal
	// semicolon-terminated statement — streamSelect's pagination injection
	// assumes exactly one top-level SELECT, so such a combined statement
	// always takes the non-SELECT exec path, even if it happens to start
	// with SELECT.
	isSelectStmt := len(dbpkg.SplitStatements(statement.Text)) <= 1 && dbpkg.IsSelectQuery(statement.Text)
	emitProgress := b.shouldEmitProgress(index, isSelectStmt)
	if emitProgress {
		EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryStarted, constant.EventQueryStartedV2, QueryStartedEvent{
			TabID:          statement.TabID,
			SourceTabID:    statement.SourceTabID,
			Query:          statement.Text,
			StatementText:  statement.Text,
			StatementIndex: statement.Index,
			StatementCount: statement.Count,
		})
	}

	s.logger.Info("executing query statement", "tab", statement.TabID, "sourceTab", b.tabID, "statementIndex", index)

	if s.onBeforeStatement != nil {
		meta, hookErr := s.onBeforeStatement(statement)
		if hookErr != nil {
			s.emitDoneWithMore(statement, 0, 0, isSelectStmt, false, hookErr)
			return true, hookErr
		}
		if hasAuditMeta(meta) {
			s.SetPendingAuditMeta(statement.SourceTabID, mergeQueryAuditMeta(s.getPendingAuditMeta(statement.SourceTabID), meta))
		}
	}

	s.activeQueriesMu.Lock()
	if isSelectStmt {
		s.activeQueries[statement.TabID] = statement.Text
	} else {
		delete(s.activeQueries, statement.TabID)
	}
	s.activeQueriesMu.Unlock()

	start := time.Now()
	statementExecutor, releaseExecutor, prepErr := s.prepareExecutor(ctx, executor)
	if prepErr != nil {
		wrapped := fmt.Errorf("prepare query context: %w", prepErr)
		s.emitBatchSummary(b)
		s.emitDoneWithMore(statement, 0, time.Since(start), isSelectStmt, false, wrapped)
		return true, wrapped
	}
	if conn, ok := statementExecutor.(*sql.Conn); ok {
		s.captureBackendID(ctx, conn, b)
	}

	var err error
	var affected int64
	if isSelectStmt {
		err = s.streamSelect(ctx, s.getDriver(), s.getDB(), statementExecutor, statement, 0, start)
	} else {
		affected, err = s.execNonSelect(ctx, statementExecutor, statement, start, emitProgress)
	}
	releaseExecutor()
	if err == nil && !isSelectStmt {
		b.recordWrite(statement.Text, affected)
	}
	if err != nil {
		// The statement's own error path (execNonSelect/streamSelect) already
		// emitted a done event carrying this error, which resolves the
		// frontend's running state via Boolean(payload.error) regardless of
		// statement index.
		s.emitBatchSummary(b)
		return true, err
	}
	if ctx.Err() != nil {
		// The statement completed successfully right as cancellation landed,
		// so its own emitDone call carried no error — nothing above resolves
		// the frontend's running state. This is the common case (cancel
		// racing a fast, already-finishing statement), not just the gap
		// between two statements handled by runBatch's loop-top check.
		s.emitBatchSummary(b)
		s.emitTerminalCancelDone(b, ctx.Err())
		return true, ctx.Err()
	}
	if index == len(b.statements)-1 {
		s.emitBatchSummary(b)
	}
	return false, nil
}

// emitBatchSummary publishes aggregated write counts for multi-statement
// batches; single statements carry their counts on their own done event.
func (s *QueryService) emitBatchSummary(b *queryBatch) {
	if len(b.statements) <= 1 {
		return
	}
	s.emitter.Emit(s.ctx, constant.EventQueryTransactionSummary, QueryTransactionSummaryEvent{
		SourceTabID:    b.tabID,
		InsertedRows:   b.insertedRows,
		UpdatedRows:    b.updatedRows,
		DeletedRows:    b.deletedRows,
		StatementCount: len(b.statements),
		Query:          b.query,
	})
}

// emitTerminalCancelDone resolves the frontend's running state after a
// cancellation with a synthetic done event addressed at the last statement.
func (s *QueryService) emitTerminalCancelDone(b *queryBatch, err error) {
	s.emitDoneWithMore(queryStatement{
		SourceTabID: b.tabID,
		TabID:       resultTabID(b.tabID, len(b.statements)-1),
		Text:        "",
		Index:       len(b.statements) - 1,
		Count:       len(b.statements),
	}, 0, 0, false, false, err)
}

// captureBackendID records the server-side identifier of the pinned
// connection a statement is about to run on (see prepareExecutor), so
// Cancel/Kill can target the right backend for whatever is currently
// running. Best-effort: a failure here only means Force kill won't be
// available for this statement — it never blocks execution.
func (s *QueryService) captureBackendID(ctx context.Context, conn *sql.Conn, b *queryBatch) {
	canceller := s.backendCanceller()
	if canceller == nil {
		return
	}
	id, err := canceller.BackendID(ctx, conn)
	if err != nil {
		s.logger.Warn("read backend id failed", "err", err)
		return
	}
	if b.session != nil {
		s.sessionsMu.Lock()
		b.session.BackendID = id
		s.sessionsMu.Unlock()
	}
	if b.jobHandle != nil {
		b.jobHandle.SetBackendID(id)
	}
}
