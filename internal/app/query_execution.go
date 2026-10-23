// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"

	"zentro/internal/constant"
	dbpkg "zentro/internal/db"
	"zentro/internal/utils"
)

var routineDDLPattern = regexp.MustCompile(`(?is)\b(create|alter|drop)\s+(or\s+replace\s+)?(function|procedure)\b`)

const preferredResultFetchBatchSize = 100

// streamSelect runs statement's SELECT and streams results as chunk events.
// driver/db identify the connection actually being queried — the ambient
// caller (query_batch.go) passes s.getDriver()/s.getDB(); the pinned caller
// (query_pinned.go) passes a Pinned Environment's own pooled connection
// (ADR-0001) so the two never cross-wire.
func (s *QueryService) streamSelect(ctx context.Context, driver string, db *sql.DB, executor sqlExecutor, statement queryStatement, offset int, start time.Time) error {
	prefs := s.getPrefs()
	hasExplicitPagination := dbpkg.HasPaginationClause(statement.Text)
	fetchLimit := preferredResultFetchBatchSize
	checkLimit := fetchLimit + 1
	normalized := dbpkg.InjectPageClause(driver, statement.Text, checkLimit, offset)

	if normalized == statement.Text && offset > 0 {
		s.emitDoneWithMore(statement, 0, time.Since(start), true, false, nil)
		return nil
	}

	// Server messages (PRINT/RAISERROR) aren't captured for SELECT
	// statements in v1 — see execNonSelect, which is where the feature's
	// actual target (PRINT-heavy admin scripts) lands. Wiring message
	// capture into this row-streaming loop would mean interleaving it with
	// sqlexp's MsgNext/MsgNextResultSet state machine, which is more
	// invasive than the value justifies for this path right now.
	rows, err := executor.QueryContext(ctx, normalized)
	if err != nil {
		wrappedErr := fmt.Errorf("query: %w", err)
		s.emitDoneWithMore(statement, 0, time.Since(start), true, false, wrappedErr)
		return wrappedErr
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	colCount := len(cols)
	dbTypes := databaseTypeNames(rows)

	var tableName string
	var pks []string
	if offset == 0 && !statement.SkipEditableMeta {
		parsedSchema, table := dbpkg.ExtractTableFromQuery(statement.Text)
		if table != "" {
			tableName = table
			if db == nil {
				s.logger.Warn("skipping primary key lookup because active db is nil", "tab", statement.TabID, "table", table)
			} else {
				trySchemas := []string{parsedSchema}
				if parsedSchema == "" {
					trySchemas = []string{}
					if currentSchema := s.currentSchema(); currentSchema != "" {
						trySchemas = append(trySchemas, currentSchema)
					}
					if d, ok := getDriver(driver); ok {
						defaultSchema := d.DefaultSchema()
						hasDefault := false
						for _, schema := range trySchemas {
							if strings.EqualFold(schema, defaultSchema) {
								hasDefault = true
								break
							}
						}
						if !hasDefault {
							trySchemas = append(trySchemas, defaultSchema)
						}
					} else {
						trySchemas = append(trySchemas, "")
					}
				} else {
					trySchemas = []string{parsedSchema}
				}
				for _, sch := range trySchemas {
					keys, err := dbpkg.FetchTablePrimaryKeys(db, driver, sch, table)
					if err == nil && len(keys) > 0 {
						pks = keys
						s.logger.Info("pk fetch ok", "table", table, "schema", sch, "pks", keys)
						break
					}
					s.logger.Warn("pk fetch failed", "table", table, "schema", sch, "err", err)
				}
			}
		}
	}

	chunkSize := prefs.ChunkSize
	if chunkSize == 0 {
		chunkSize = 500
	}

	seq := 0
	buf := make([][]string, 0, chunkSize)
	sentCols := false
	totalRowsFetched := 0
	hasMore := false

	for rows.Next() {
		if ctx.Err() != nil || s.isCancelled(statement.SourceTabID) {
			break
		}
		row := scanRowAsStrings(rows, colCount, dbTypes)
		totalRowsFetched++
		if !hasExplicitPagination && totalRowsFetched > fetchLimit {
			hasMore = true
			break
		}
		buf = append(buf, row)

		if len(buf) == chunkSize {
			var chunkCols []string
			if !sentCols {
				chunkCols = cols
				sentCols = true
				EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(statement, chunkCols, buf, seq, tableName, pks))
			} else {
				EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(statement, chunkCols, buf, seq, "", nil))
			}
			buf = nil
			seq++
		}
	}

	if len(buf) > 0 || !sentCols {
		var chunkCols []string
		if !sentCols {
			chunkCols = cols
			EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(statement, chunkCols, buf, seq, tableName, pks))
		} else {
			EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(statement, chunkCols, buf, seq, "", nil))
		}
	}

	if hasMore {
		totalRowsFetched = fetchLimit
	}

	totalRows := int64(seq*chunkSize + len(buf))
	duration := time.Since(start)
	if s.isCancelled(statement.SourceTabID) || ctx.Err() == context.Canceled {
		err = context.Canceled
	}
	if rows.Err() != nil && err == nil {
		err = rows.Err()
	}
	if offset == 0 {
		s.trackQueryExecution(statement, totalRows, duration, true, err)
	}
	if err == context.Canceled {
		s.emitDoneWithMore(statement, int64(totalRowsFetched), duration, true, hasMore, fmt.Errorf("query cancelled"))
		return err
	}
	s.emitDoneWithMore(statement, int64(totalRowsFetched), duration, true, hasMore, err)
	s.logger.Debug("query profile", "stage", "stream-select", "tab", statement.TabID, "rows", totalRowsFetched, "duration_ms", duration.Milliseconds())
	if err == nil && hasMore && offset == 0 && !hasExplicitPagination {
		go s.countQueryRows(statement)
	}
	return err
}

func (s *QueryService) countQueryRows(statement queryStatement) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	executor := s.getExecutor()
	if !isExecutorReady(executor) {
		return
	}
	queryExecutor, releaseExecutor, prepErr := s.prepareExecutor(ctx, executor)
	if prepErr != nil {
		return
	}
	defer releaseExecutor()

	trimmed := strings.TrimRight(strings.TrimSpace(statement.Text), ";")
	countQuery := "SELECT COUNT(*) FROM (" + trimmed + ") AS _zentro_count"

	row := queryExecutor.QueryRowContext(ctx, countQuery)
	var count int64
	if err := row.Scan(&count); err != nil {
		s.logger.Debug("count query failed", "tab", statement.TabID, "err", err)
		return
	}
	s.emitter.Emit(s.ctx, constant.EventQueryCount, QueryCountEvent{
		TabID: statement.TabID,
		Count: count,
	})
}

// CopyActiveQuery lets a result that the frontend keeps under a new tab id
// (an edited result set moved aside so a fresh run can take its slot) carry on
// paging and exporting: those look the statement up by tab id. It copies
// rather than moves, because the original id is reused by the next run. It
// reports whether there was a statement to copy.
func (s *QueryService) CopyActiveQuery(fromTabID, toTabID string) bool {
	if fromTabID == "" || toTabID == "" || fromTabID == toTabID {
		return false
	}
	s.activeQueriesMu.Lock()
	defer s.activeQueriesMu.Unlock()
	query, ok := s.activeQueries[fromTabID]
	if !ok || query == "" {
		return false
	}
	s.activeQueries[toTabID] = query
	return true
}

func (s *QueryService) FetchMoreRows(tabID string, offset int) {
	s.activeQueriesMu.Lock()
	query, ok := s.activeQueries[tabID]
	s.activeQueriesMu.Unlock()

	if !ok || query == "" {
		s.emitDone(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, fmt.Errorf("no active query found for pagination"))
		return
	}
	if dbpkg.HasPaginationClause(query) {
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, nil)
		return
	}

	driver := s.getDriver()
	executor := s.getExecutor()
	prefs := s.getPrefs()
	limit := preferredResultFetchBatchSize
	checkLimit := limit + 1
	paginatedQuery := dbpkg.InjectPageClause(driver, query, checkLimit, offset)

	if paginatedQuery == query && offset > 0 {
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, nil)
		return
	}
	sourceID := sourceTabID(tabID)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.QueryTimeout)*time.Second)
		defer cancel()

		if !isExecutorReady(executor) {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, fmt.Errorf("no active connection"))
			return
		}

		start := time.Now()
		queryExecutor, releaseExecutor, prepErr := s.prepareExecutor(ctx, executor)
		if prepErr != nil {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, time.Since(start), true, false, fmt.Errorf("fetch more: prepare query context failed: %w", prepErr))
			return
		}
		defer releaseExecutor()

		rows, err := queryExecutor.QueryContext(ctx, paginatedQuery)
		if err != nil {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, time.Since(start), true, false, fmt.Errorf("fetch more: query failed: %w", err))
			return
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, time.Since(start), true, false, fmt.Errorf("fetch more: columns error: %w", err))
			return
		}
		dbTypes := databaseTypeNames(rows)

		var chunk [][]string
		seq := 0
		rowCount := 0
		hasMore := false

		for rows.Next() {
			if ctx.Err() != nil || s.isCancelled(sourceID) {
				break
			}
			row := scanRowAsStrings(rows, len(cols), dbTypes)
			rowCount++
			if rowCount > limit {
				hasMore = true
				break
			}
			chunk = append(chunk, row)

			if len(chunk) >= 500 {
				EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, cols, chunk, seq, "", nil))
				chunk = nil
				seq++
			}
		}

		if len(chunk) > 0 {
			EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, cols, chunk, seq, "", nil))
		}

		duration := time.Since(start)

		if hasMore {
			rowCount = limit
		}

		if s.isCancelled(sourceID) || ctx.Err() == context.Canceled {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, int64(rowCount), duration, true, hasMore, fmt.Errorf("query cancelled"))
			return
		}
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, int64(rowCount), duration, true, hasMore, nil)
	}()
}

func (s *QueryService) FetchRowRange(tabID string, offset int, count int) {
	s.activeQueriesMu.Lock()
	query, ok := s.activeQueries[tabID]
	s.activeQueriesMu.Unlock()

	emitEmpty := func(errMsg string) {
		s.emitter.Emit(s.ctx, constant.EventQueryRange, QueryRangeEvent{
			TabID:  tabID,
			Offset: offset,
			Rows:   [][]string{},
			Error:  errMsg,
		})
	}

	if !ok || query == "" || dbpkg.HasPaginationClause(query) {
		emitEmpty("")
		return
	}

	driver := s.getDriver()
	prefs := s.getPrefs()
	paginatedQuery := dbpkg.InjectPageClause(driver, query, count, offset)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.QueryTimeout)*time.Second)
		defer cancel()

		executor := s.getExecutor()
		if !isExecutorReady(executor) {
			emitEmpty("no active connection")
			return
		}

		queryExecutor, releaseExecutor, prepErr := s.prepareExecutor(ctx, executor)
		if prepErr != nil {
			emitEmpty(prepErr.Error())
			return
		}
		defer releaseExecutor()

		rows, err := queryExecutor.QueryContext(ctx, paginatedQuery)
		if err != nil {
			emitEmpty(err.Error())
			return
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			emitEmpty(err.Error())
			return
		}
		dbTypes := databaseTypeNames(rows)

		var rowData [][]string
		for rows.Next() {
			rowData = append(rowData, scanRowAsStrings(rows, len(cols), dbTypes))
		}
		if rowData == nil {
			rowData = [][]string{}
		}

		s.emitter.Emit(s.ctx, constant.EventQueryRange, QueryRangeEvent{
			TabID:  tabID,
			Offset: offset,
			Rows:   rowData,
		})
	}()
}

// emitProgress controls whether the success path emits a done event over IPC.
// Errors always emit regardless, since they're rare and must always surface.
// Returns the affected row count so callers can accumulate transaction totals
// even for statements whose progress event was throttled.
func (s *QueryService) execNonSelect(ctx context.Context, executor sqlExecutor, statement queryStatement, start time.Time, emitProgress bool) (int64, error) {
	affected, err := s.execNonSelectRaw(ctx, executor, statement)
	dur := time.Since(start)
	if err != nil {
		wrappedErr := fmt.Errorf("exec: %w", err)
		s.trackQueryExecution(statement, 0, dur, false, wrappedErr)
		s.emitDone(statement, 0, dur, false, wrappedErr)
		return 0, wrappedErr
	}
	s.trackQueryExecution(statement, affected, dur, false, nil)
	if s.onRoutineDDL != nil && routineDDLPattern.MatchString(statement.Text) {
		s.onRoutineDDL(statement.Text)
	}
	if emitProgress {
		s.emitDone(statement, affected, dur, false, nil)
	}
	return affected, nil
}

// execNonSelectRaw runs the statement and returns its rows-affected count,
// branching on whether the active driver can report server-side messages
// (PRINT/RAISERROR — MSSQL only today, via the optional MessageCapturer
// port). Drivers without that port take the plain ExecContext path,
// unchanged from before this feature existed.
func (s *QueryService) execNonSelectRaw(ctx context.Context, executor sqlExecutor, statement queryStatement) (int64, error) {
	capturer := s.messageCapturer()
	if capturer == nil {
		res, err := executor.ExecContext(ctx, statement.Text)
		if err != nil {
			return 0, err
		}
		return res.RowsAffected()
	}

	// MSSQL: run via QueryContext (not ExecContext) with an extra arg the
	// driver recognizes to start reporting messages, then drive its
	// message stream to get both the captured PRINT/RAISERROR text and the
	// final rows-affected count. drain calls Message(ctx) on this same
	// goroutine, strictly after QueryContext has already returned — see
	// message_capture.go's doc comment for why that ordering (rather than
	// draining concurrently from a separately-started goroutine) is the
	// difference between this being race-free and not.
	msgArgs, drain := capturer.PrepareMessageCapture(func(text string) {
		s.emitter.Emit(s.ctx, constant.EventQueryMessage, QueryMessageEvent{
			SourceTabID: statement.SourceTabID,
			TabID:       statement.TabID,
			Text:        text,
		})
	})
	rows, err := executor.QueryContext(ctx, statement.Text, msgArgs...)
	if err != nil {
		return 0, err
	}
	return drain(ctx, rows)
}

func (s *QueryService) CancelQuery(tabID string) {
	sourceID := sourceTabID(tabID)
	s.markCancelled(sourceID)

	s.sessionsMu.Lock()
	session, ok := s.sessions[sourceID]
	if ok {
		s.logger.Info("cancelling query", "tab", tabID)
		session.CancelFunc()
		delete(s.sessions, sourceID)
	}
	s.sessionsMu.Unlock()
	if !ok {
		return
	}

	// Also flip the Activity-panel Job to "cancelling" so it matches what
	// cancelling from the panel itself would show — the actual terminal
	// status is set by endQuerySession's jobHandle.Finish once the
	// goroutine above notices ctx.Err().
	if session.JobID != "" && s.jobs != nil {
		_ = s.jobs.Cancel(session.JobID)
	}
	// Nudge the server too, in case the driver doesn't honor ctx
	// cancellation mid-statement (or hasn't reached a check point yet) —
	// cancelBackendForSession locks sessionsMu itself, so this must run
	// after the section above has already released it.
	s.cancelBackendForSession(session, false)
}

func (s *QueryService) ExecuteUpdateSync(sourceTabID string, query string) (int64, error) {
	if s.getPrefs().ViewMode {
		return 0, fmt.Errorf("view mode is enabled: write statements are blocked")
	}
	if err := s.validateStrictWriteSafety(sourceTabID, []string{query}, ""); err != nil {
		return 0, err
	}
	if strings.TrimSpace(sourceTabID) != "" {
		defer s.ClearPendingAuditMeta(sourceTabID)
	}

	executor := s.getExecutor()
	if !isExecutorReady(executor) {
		return 0, fmt.Errorf("no active connection")
	}
	queryExecutor, releaseExecutor, prepErr := s.prepareExecutor(s.ctx, executor)
	if prepErr != nil {
		return 0, fmt.Errorf("prepare query context failed: %w", prepErr)
	}
	defer releaseExecutor()

	start := time.Now()
	res, execErr := queryExecutor.ExecContext(s.ctx, query)
	duration := time.Since(start)

	var rowsAffected int64
	if execErr == nil {
		rowsAffected, _ = res.RowsAffected()
	}
	s.trackQueryExecution(
		queryStatement{SourceTabID: sourceTabID, TabID: sourceTabID, Text: query, Index: 0, Count: 1},
		rowsAffected, duration, false, execErr,
	)

	if execErr != nil {
		return 0, execErr
	}
	return rowsAffected, nil
}

// validateStrictWriteSafety enforces strict-environment write guards.
// envKeyOverride, when non-empty, evaluates safety against that specific
// environment instead of the ambient ContextService.getCurrentEnvironmentKey
// — used by the pinned write path (query_pinned.go) so a Table tab pinned to
// Production is always gated as Production, even while the Active
// Environment shown on the Toolbar (ADR-0001) is something else.
func (s *QueryService) validateStrictWriteSafety(sourceTabID string, statements []string, envKeyOverride string) error {
	if !s.isStrictWriteSafetyEnvironment(envKeyOverride) {
		return nil
	}
	if s.canBypassStrictWriteSafety(sourceTabID) {
		return nil
	}
	for _, statement := range statements {
		risk := dbpkg.AnalyzeStatementRisk(statement)
		if risk.UpdateNoWhere {
			return fmt.Errorf("write safety policy: UPDATE without WHERE requires strong confirmation in strict environment")
		}
		if risk.DeleteNoWhere {
			return fmt.Errorf("write safety policy: DELETE without WHERE requires strong confirmation in strict environment")
		}
	}
	return nil
}

func (s *QueryService) canBypassStrictWriteSafety(sourceTabID string) bool {
	if strings.TrimSpace(sourceTabID) == "" {
		return false
	}
	return hasAuditMeta(s.getPendingAuditMeta(sourceTabID))
}

// isStrictWriteSafetyEnvironment resolves whether writes must go through
// strict-environment guards. envKeyOverride, when non-empty, wins over the
// ambient getCurrentEnvironmentKey closure — see validateStrictWriteSafety.
func (s *QueryService) isStrictWriteSafetyEnvironment(envKeyOverride string) bool {
	envKey := strings.TrimSpace(envKeyOverride)
	if envKey == "" {
		if s.getCurrentEnvironmentKey == nil {
			return false
		}
		envKey = s.getCurrentEnvironmentKey()
	}
	prefs := utils.Preferences{}
	if s.getPrefs != nil {
		prefs = s.getPrefs()
	}
	return resolveSafetyLevel(prefs, envKey) == SafetyLevelStrict
}
