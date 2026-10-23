// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/utils"
)

func isExecutorReady(executor sqlExecutor) bool {
	switch exec := executor.(type) {
	case nil:
		return false
	case *sql.DB:
		return exec != nil
	case *sql.Tx:
		return exec != nil
	default:
		return true
	}
}

type sqlExecutor interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type queryStatement struct {
	SourceTabID      string
	TabID            string
	Text             string
	Index            int
	Count            int
	SkipEditableMeta bool
}

type QueryService struct {
	ctx                      context.Context
	logger                   *slog.Logger
	getPrefs                 func() utils.Preferences
	getDB                    func() *sql.DB
	getExecutor              func() sqlExecutor
	getDriver                func() string
	getCurrentSchema         func() string
	getCurrentEnvironmentKey func() string
	onQueryExecution         func(QueryExecutionAuditEvent)
	onBeforeStatement        func(queryStatement) (QueryAuditMeta, error)
	onRoutineDDL             func(statement string)
	emitter                  EventEmitter

	// pool resolves a Pinned Environment's own connection (see ADR-0001,
	// connection_pool.go) for Table/Catalog tab calls — additive alongside
	// getDB/getExecutor/getDriver above, which remain the ambient path used
	// by Query tabs and are never touched by the pinned methods in
	// query_pinned.go.
	pool *ConnectionPool

	sessions   map[string]*QuerySession
	sessionsMu sync.Mutex

	// jobs, getJobProfileName, and getJobDatabase are optional — wired via
	// SetJobService/SetJobConnectionInfo from app.go so query executions
	// show up as Activity-panel jobs. Tests that construct QueryService
	// directly leave jobs nil, and every call site below already guards on
	// that, so job tracking is silently skipped rather than required.
	jobs              *JobService
	getJobProfileName func() string
	getJobDatabase    func() string

	activeQueries   map[string]string
	activeQueriesMu sync.RWMutex

	cancelledTabs   map[string]struct{}
	cancelledTabsMu sync.RWMutex

	pendingAuditMeta   map[string]QueryAuditMeta
	pendingAuditMetaMu sync.RWMutex
}

func NewQueryService(
	ctx context.Context, logger *slog.Logger, getPrefs func() utils.Preferences,
	getDB func() *sql.DB, getExecutor func() sqlExecutor, getDriver func() string,
	getCurrentSchema func() string, getCurrentEnvironmentKey func() string,
	pool *ConnectionPool,
	emitter EventEmitter,
) *QueryService {
	return &QueryService{
		ctx:                      ctx,
		logger:                   logger,
		getPrefs:                 getPrefs,
		getDB:                    getDB,
		getExecutor:              getExecutor,
		getDriver:                getDriver,
		getCurrentSchema:         getCurrentSchema,
		getCurrentEnvironmentKey: getCurrentEnvironmentKey,
		pool:                     pool,
		emitter:                  emitter,
		sessions:                 make(map[string]*QuerySession),
		activeQueries:            make(map[string]string),
		cancelledTabs:            make(map[string]struct{}),
		pendingAuditMeta:         make(map[string]QueryAuditMeta),
	}
}

func (s *QueryService) currentSchema() string {
	if s.getCurrentSchema == nil {
		return ""
	}
	return strings.TrimSpace(s.getCurrentSchema())
}

// sessionDialect resolves the active driver's QueryDialect port, or nil when
// the driver is unknown/unregistered.
func (s *QueryService) sessionDialect() driverport.QueryDialect {
	drv, ok := core.Get(strings.ToLower(strings.TrimSpace(s.getDriver())))
	if !ok {
		return nil
	}
	return drv
}

// messageCapturer resolves the active driver's optional MessageCapturer
// port, or nil when the driver doesn't implement it (every driver but MSSQL,
// today).
func (s *QueryService) messageCapturer() driverport.MessageCapturer {
	drv, ok := core.Get(strings.ToLower(strings.TrimSpace(s.getDriver())))
	if !ok {
		return nil
	}
	capturer, ok := drv.(driverport.MessageCapturer)
	if !ok {
		return nil
	}
	return capturer
}

// backendCanceller resolves the active driver's optional BackendCanceller
// port (server-side cancel/kill — see driver.go), or nil for a driver that
// doesn't implement it (SQLite has no server to signal).
func (s *QueryService) backendCanceller() driverport.BackendCanceller {
	drv, ok := core.Get(strings.ToLower(strings.TrimSpace(s.getDriver())))
	if !ok {
		return nil
	}
	canceller, ok := drv.(driverport.BackendCanceller)
	if !ok {
		return nil
	}
	return canceller
}

// cancelBackendForSession best-effort asks the server to stop whatever the
// session's current statement is running (force=false), in addition to the
// ctx cancellation CancelQuery already does — a driver that doesn't honor
// ctx cancellation mid-statement (or hasn't reached its next check point
// yet) still gets told to stop at the server. Runs with its own short
// timeout, independent of the session's own (now-cancelled) context. A
// failure here is logged, never surfaced to the caller: CancelQuery must
// not block or error just because the server-side nudge failed.
func (s *QueryService) cancelBackendForSession(session *QuerySession, force bool) {
	canceller := s.backendCanceller()
	if canceller == nil {
		return
	}
	s.sessionsMu.Lock()
	backendID := session.BackendID
	s.sessionsMu.Unlock()
	if backendID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := canceller.CancelBackend(ctx, s.getDB(), backendID, force); err != nil {
		s.logger.Warn("cancel backend failed", "backendID", backendID, "force", force, "err", err)
	}
}

// sessionSchema returns the dialect and schema when the active driver keeps
// session-level schema context that must be applied before execution.
func (s *QueryService) sessionSchema() (driverport.QueryDialect, string, bool) {
	dialect := s.sessionDialect()
	if dialect == nil || !dialect.SupportsSessionSchema() {
		return nil, "", false
	}
	schema := s.currentSchema()
	if schema == "" {
		return nil, "", false
	}
	return dialect, schema, true
}

func (s *QueryService) applySessionContext(ctx context.Context, executor sqlExecutor) error {
	dialect, schema, ok := s.sessionSchema()
	if !ok {
		return nil
	}
	if err := dialect.ApplySchemaContext(ctx, executor, schema); err != nil {
		return fmt.Errorf("apply schema context: %w", err)
	}
	return nil
}

// prepareExecutor pins a dedicated *sql.Conn out of the pool when the
// active driver either keeps session-level schema context (Postgres
// search_path) or implements BackendCanceller — the latter needs a fixed
// connection to read a stable backend id from (see captureBackendID in
// query_batch.go), not whichever connection the pool happens to hand back
// next. A driver needing neither (MySQL, MSSQL, SQLite — none of them
// support session schema, and SQLite has no BackendCanceller) uses the
// ambient executor directly.
//
// Note for a SELECT: streamSelect's own primary-key lookup (for inline
// editing) runs against the ambient *sql.DB separately from whatever this
// returns, so a pinned statement briefly needs two pool connections, not
// one. Real connection pools have headroom for that; a pool capped at a
// single connection (e.g. a test harness) would serialize the two and
// could stall the lookup until the pinned connection is released.
func (s *QueryService) prepareExecutor(ctx context.Context, executor sqlExecutor) (sqlExecutor, func(), error) {
	dialect, schema, hasSchema := s.sessionSchema()
	needsPin := hasSchema || s.backendCanceller() != nil
	if !needsPin {
		return executor, func() {}, nil
	}

	dbExecutor, ok := executor.(*sql.DB)
	if !ok {
		// executor is already a single connection (an open transaction's
		// *sql.Tx) — nothing to pin. Session schema still needs applying
		// on it directly in that case.
		if hasSchema {
			if err := s.applySessionContext(ctx, executor); err != nil {
				return nil, nil, err
			}
		}
		return executor, func() {}, nil
	}

	conn, err := dbExecutor.Conn(ctx)
	if err != nil {
		return nil, nil, err
	}
	if hasSchema {
		if err := dialect.ApplySchemaContext(ctx, conn, schema); err != nil {
			_ = conn.Close()
			return nil, nil, fmt.Errorf("apply schema context: %w", err)
		}
	}
	return conn, func() {
		if hasSchema {
			resetCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = dialect.ResetSchemaContext(resetCtx, conn)
		}
		_ = conn.Close()
	}, nil
}

func (s *QueryService) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *QueryService) SetQueryExecutionHook(hook func(QueryExecutionAuditEvent)) {
	s.onQueryExecution = hook
}

func (s *QueryService) SetBeforeStatementHook(hook func(queryStatement) (QueryAuditMeta, error)) {
	s.onBeforeStatement = hook
}

func (s *QueryService) SetRoutineDDLHook(hook func(statement string)) {
	s.onRoutineDDL = hook
}

// SetJobService wires the shared JobService so query executions register as
// Activity-panel jobs (see job_service.go). Optional — tests that construct
// QueryService directly don't call this, and job tracking is skipped
// entirely when nil.
func (s *QueryService) SetJobService(jobs *JobService) {
	s.jobs = jobs
}

// SetJobConnectionInfo wires getters for the active connection's display
// name and current database, shown on query Jobs in the Activity panel.
// Optional; jobs show no connection/database when unset.
func (s *QueryService) SetJobConnectionInfo(getProfileName, getDatabase func() string) {
	s.getJobProfileName = getProfileName
	s.getJobDatabase = getDatabase
}

func (s *QueryService) jobProfileName() string {
	if s.getJobProfileName == nil {
		return ""
	}
	return s.getJobProfileName()
}

func (s *QueryService) jobDatabase() string {
	if s.getJobDatabase == nil {
		return ""
	}
	return s.getJobDatabase()
}

func (s *QueryService) trackQueryExecution(statement queryStatement, rowCount int64, duration time.Duration, isSelect bool, err error) {
	if s.onQueryExecution == nil {
		return
	}
	meta := s.getPendingAuditMeta(statement.SourceTabID)

	event := QueryExecutionAuditEvent{
		SourceTabID:          statement.SourceTabID,
		TabID:                statement.TabID,
		StatementText:        statement.Text,
		StatementIndex:       statement.Index,
		StatementCount:       statement.Count,
		RowCount:             rowCount,
		DurationMs:           duration.Milliseconds(),
		IsSelect:             isSelect,
		Reason:               meta.Reason,
		RiskLevel:            meta.RiskLevel,
		PreviewRowCount:      meta.PreviewRowCount,
		UsedProtectionLayers: append([]string(nil), meta.UsedProtectionLayers...),
		SnapshotRef:          meta.SnapshotRef,
	}
	if err != nil {
		event.Error = err.Error()
	}
	s.onQueryExecution(event)
}

func (s *QueryService) Shutdown() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	for _, session := range s.sessions {
		if session.CancelFunc != nil {
			session.CancelFunc()
		}
	}
	s.sessions = make(map[string]*QuerySession)
	s.cancelledTabsMu.Lock()
	s.cancelledTabs = make(map[string]struct{})
	s.cancelledTabsMu.Unlock()
	s.pendingAuditMetaMu.Lock()
	s.pendingAuditMeta = make(map[string]QueryAuditMeta)
	s.pendingAuditMetaMu.Unlock()
}

func (s *QueryService) SetPendingAuditMeta(tabID string, meta QueryAuditMeta) {
	s.pendingAuditMetaMu.Lock()
	defer s.pendingAuditMetaMu.Unlock()
	s.pendingAuditMeta[tabID] = meta
}

func (s *QueryService) ClearPendingAuditMeta(tabID string) {
	s.pendingAuditMetaMu.Lock()
	defer s.pendingAuditMetaMu.Unlock()
	delete(s.pendingAuditMeta, tabID)
}

func (s *QueryService) getPendingAuditMeta(tabID string) QueryAuditMeta {
	s.pendingAuditMetaMu.RLock()
	defer s.pendingAuditMetaMu.RUnlock()
	return s.pendingAuditMeta[tabID]
}

func mergeQueryAuditMeta(base QueryAuditMeta, overlay QueryAuditMeta) QueryAuditMeta {
	if strings.TrimSpace(overlay.Reason) != "" {
		base.Reason = strings.TrimSpace(overlay.Reason)
	}
	if strings.TrimSpace(overlay.RiskLevel) != "" {
		base.RiskLevel = strings.TrimSpace(overlay.RiskLevel)
	}
	if overlay.PreviewRowCount > 0 {
		base.PreviewRowCount = overlay.PreviewRowCount
	}
	if strings.TrimSpace(overlay.SnapshotRef) != "" {
		base.SnapshotRef = strings.TrimSpace(overlay.SnapshotRef)
	}
	if len(overlay.UsedProtectionLayers) > 0 {
		seen := make(map[string]struct{}, len(base.UsedProtectionLayers))
		for _, item := range base.UsedProtectionLayers {
			seen[item] = struct{}{}
		}
		for _, item := range overlay.UsedProtectionLayers {
			if _, ok := seen[item]; ok {
				continue
			}
			base.UsedProtectionLayers = append(base.UsedProtectionLayers, item)
			seen[item] = struct{}{}
		}
	}
	return base
}

func hasAuditMeta(meta QueryAuditMeta) bool {
	return strings.TrimSpace(meta.Reason) != "" ||
		strings.TrimSpace(meta.RiskLevel) != "" ||
		meta.PreviewRowCount > 0 ||
		strings.TrimSpace(meta.SnapshotRef) != "" ||
		len(meta.UsedProtectionLayers) > 0
}

func (s *QueryService) ExecuteQuery(tabID, query string) {
	s.executeQueryWithOptions(tabID, query, false)
}

func (s *QueryService) ExplainQuery(tabID, query string, analyze bool) error {
	driver := s.getDriver()
	explainSQL, err := buildExplainQuery(driver, query, analyze)
	if err != nil {
		return err
	}

	s.executeQueryWithOptions(tabID, explainSQL, true)
	return nil
}

func (s *QueryService) markCancelled(tabID string) {
	s.cancelledTabsMu.Lock()
	defer s.cancelledTabsMu.Unlock()
	s.cancelledTabs[tabID] = struct{}{}
}

func (s *QueryService) clearCancelled(tabID string) {
	s.cancelledTabsMu.Lock()
	defer s.cancelledTabsMu.Unlock()
	delete(s.cancelledTabs, tabID)
}

func (s *QueryService) isCancelled(tabID string) bool {
	s.cancelledTabsMu.RLock()
	defer s.cancelledTabsMu.RUnlock()
	_, ok := s.cancelledTabs[tabID]
	return ok
}
