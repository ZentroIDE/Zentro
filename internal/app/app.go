// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"log/slog"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"zentro/internal/constant"
	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/license"
	pluginext "zentro/internal/extensions/plugin"
	"zentro/internal/extensions/querystat"
	"zentro/internal/models"
	"zentro/internal/netmeter"
	"zentro/internal/sshtunnel"
	"zentro/internal/utils"
)

// QuerySession tracks one active query execution per tab.
type QuerySession struct {
	TabID      string
	CancelFunc context.CancelFunc
	StartedAt  time.Time
	// JobID correlates this session with its Activity-panel Job (see
	// job_service.go). Empty when JobService isn't wired (e.g. tests that
	// construct QueryService directly without calling SetJobService).
	JobID string
	// BackendID is the server-side session identifier (Postgres backend
	// pid, MySQL connection id, SQL Server @@SPID) of whichever pinned
	// connection the session's current statement is running on — see
	// captureBackendID in query_batch.go. Guarded by QueryService's
	// sessionsMu, empty when the driver has no BackendCanceller (SQLite)
	// or before the first statement has captured it.
	BackendID string
}

// App is the single Wails-bound struct. Every method exposed to the
// frontend lives on this type (or on app_*_facade.go files that embed it
// via thin wrappers). Business logic lives in *_service.go files; facades
// should only delegate. Adding a new FE-callable method:
//  1. Add the method to App (usually in the relevant app_*_facade.go).
//  2. Implement logic in the matching <domain>_service.go.
//  3. Run `wails dev` once to regenerate frontend/wailsjs/.
//
// See ARCHITECTURE.md and docs/EXTENDING.md for the full recipe.
type App struct {
	ctx                   context.Context
	logger                *slog.Logger
	db                    *sql.DB
	profile               *models.ConnectionProfile
	project               *models.Project
	currentEnvironmentKey models.EnvironmentKey
	launchProjectID       string // set from --project=<id> on process start; consumed once by GetLaunchProjectID
	prefs                 utils.Preferences

	// connPool holds pinned Table/Catalog tab connections, additive
	// alongside db/profile above (see connection_pool.go, ADR-0001).
	connPool *ConnectionPool

	forceQuit bool
	emitter   EventEmitter

	svc               Services
	meter             byteCounter        // database traffic counter behind the status-bar stats; nil = none
	sshTunnels        *sshtunnel.Manager // opens SSH terminals on a connection's tunnel server; nil = none
	licenseSyncCancel context.CancelFunc
	licenseSyncDone   chan struct{}
	eval              *EntitlementEvaluator
	writeGuardsOnce   sync.Once
	writeGuards       []WriteGuard // see write_guard.go; built on first use
	writePreviewMu    sync.Mutex
	writePreviews     map[string]*WritePreviewSession
}

// AppOption customises NewApp.
type AppOption func(*App)

// WithTrafficMeter lets the status-bar stats report database traffic. Without
// it (or with nil) upload/download read as zero.
func WithTrafficMeter(m *netmeter.Meter) AppOption {
	return func(a *App) {
		if m != nil { // a typed-nil *Meter inside the interface would panic
			a.meter = m
		}
	}
}

// WithSSHTunnels lets the Terminal tab open shells on a connection's SSH
// server over the same shared SSH connection the database tunnel uses.
func WithSSHTunnels(m *sshtunnel.Manager) AppOption {
	return func(a *App) { a.sshTunnels = m }
}

// loadConnectionByID finds a saved connection (secrets hydrated) by its ID.
func loadConnectionByID(id string) (*models.ConnectionProfile, error) {
	profiles, err := utils.LoadConnections()
	if err != nil {
		return nil, err
	}
	for _, p := range profiles {
		if p != nil && p.ID == id {
			return p, nil
		}
	}
	return nil, nil
}

func NewApp(opts ...AppOption) *App {
	a := &App{
		emitter:       NewWailsEventEmitter(),
		writePreviews: make(map[string]*WritePreviewSession),
		connPool:      NewConnectionPool(defaultMaxPooledConnections),
	}
	for _, opt := range opts {
		opt(a)
	}

	a.svc.Audit = NewSQLAuditLogService(
		func() *models.ConnectionProfile { return a.profile },
		func() *models.Project { return a.project },
		func() string { return string(a.currentProjectEnvironmentKey()) },
		func() string {
			if a.profile != nil {
				return a.profile.Driver
			}
			return ""
		},
		nil, // logger set in Startup
	)
	a.svc.Tx = NewTransactionService(
		context.Background(),
		nil,
		func() *sql.DB { return a.db },
		func() utils.Preferences { return a.prefs },
		func() string {
			if a.profile != nil {
				return a.profile.Driver
			}
			return ""
		},
		a.emitter,
	)

	a.svc.Conn = NewConnectionService(
		context.Background(), nil, func() utils.Preferences { return a.prefs },
		func() *sql.DB { return a.db },
		func() *models.ConnectionProfile { return a.profile },
		func() error { return a.svc.Tx.RollbackActive() },
		func(db *sql.DB, p *models.ConnectionProfile) {
			a.db = db
			a.profile = p
		},
		a.emitter,
	)

	// Register a SessionInitializer hook: after connect, call InitSession on
	// drivers that implement it (e.g. SQLite PRAGMA setup, DuckDB extensions).
	a.svc.Conn.SetSessionInitHook(func(ctx context.Context, db *sql.DB, driverName string) error {
		drv, ok := core.Get(driverName)
		if !ok {
			return nil
		}
		if si, ok := drv.(driverport.SessionInitializer); ok {
			return si.InitSession(ctx, db)
		}
		return nil
	})

	a.svc.Jobs = NewJobService(a.emitter)

	var openSSHShell func(context.Context, sshtunnel.Config, int, int) (terminalProcess, error)
	if a.sshTunnels != nil {
		tunnels := a.sshTunnels
		openSSHShell = func(ctx context.Context, cfg sshtunnel.Config, cols, rows int) (terminalProcess, error) {
			shell, err := tunnels.OpenShell(ctx, cfg, cols, rows)
			if err != nil {
				return nil, err // not `return shell, err`: a nil *Shell in the interface would not be nil
			}
			return shell, nil
		}
	}
	a.svc.Terminal = NewTerminalService(a.emitter, loadConnectionByID, openSSHShell)

	a.svc.Stats = NewStatsService(
		a.emitter,
		func() *sql.DB { return a.db },
		func() *models.ConnectionProfile { return a.profile },
		a.meter,
	)

	a.svc.Query = NewQueryService(
		context.Background(), nil, func() utils.Preferences { return a.prefs },
		func() *sql.DB { return a.db },
		func() sqlExecutor { return a.svc.Tx.GetExecutor() },
		func() string {
			if a.profile != nil {
				return a.profile.Driver
			}
			return ""
		},
		func() string { return a.currentProjectSchema() },
		func() string { return string(a.currentProjectEnvironmentKey()) },
		a.connPool,
		a.emitter,
	)
	a.svc.Query.SetJobService(a.svc.Jobs)
	a.svc.Query.SetJobConnectionInfo(
		func() string {
			if a.profile != nil {
				return a.profile.Name
			}
			return ""
		},
		func() string {
			if a.profile != nil {
				return a.profile.DBName
			}
			return ""
		},
	)

	a.svc.Policy = NewEnvironmentPolicyService(
		func() utils.Preferences { return a.prefs },
		func(p utils.Preferences) error {
			a.prefs = p
			return utils.SavePreferences(p)
		},
	)

	a.svc.Feedback = NewFeedbackService(
		func() utils.Preferences { return a.prefs },
		func(p utils.Preferences) error {
			a.prefs = p
			return utils.SavePreferences(p)
		},
		func() string {
			return a.svc.License.Plan().InstallationID
		},
	)

	a.svc.Scripts = NewScriptService(nil)
	a.svc.Templates = NewTemplateService()
	a.svc.Bookmarks = NewBookmarkService()
	a.svc.ImageColumns = NewImageColumnService()
	a.svc.Formatter = NewQueryFormatterService(func() utils.SQLFormatPrefs { return a.prefs.SQLFormat })
	a.svc.Update = NewUpdateService("", utils.Channel)
	a.svc.Projects = NewProjectService(nil)
	a.svc.ProjectLock = NewProjectLockService(nil)
	a.svc.SC = NewSourceControlService()
	a.svc.SCAuto = NewSourceControlAutomationService(a.svc.SC, func(project *models.Project) error {
		if project == nil {
			return nil
		}
		return utils.UpsertProject(project)
	})
	a.svc.PluginReg = pluginext.NewInMemoryRegistry()
	// Local entitlements until a build that sells plans wires its license service
	// in (edition.go); a tree without one keeps these.
	a.svc.License = license.NewLocalEntitlements()
	a.svc.AI = NewAIService(
		nil,
		func() *sql.DB { return a.db },
		func() *models.ConnectionProfile { return a.profile },
		func() *models.Project { return a.project },
		func() string { return a.currentProjectSchema() },
		func() string { return string(a.currentProjectEnvironmentKey()) },
		func() bool { return a.eval != nil && a.eval.CanUse(license.FeatureQueryAdvancedAIAssist) },
		nil, // airgap: set by a build that has the plan for it
		func(projectID, connectionName string) ([]assistantScript, error) {
			items, err := a.svc.Scripts.GetScripts(projectID, connectionName)
			if err != nil {
				return nil, err
			}
			out := make([]assistantScript, 0, len(items))
			for _, item := range items {
				content, contentErr := a.svc.Scripts.GetScriptContent(projectID, connectionName, item.ID)
				if contentErr != nil {
					content = ""
				}
				out = append(out, assistantScript{Name: item.Name, Content: content})
			}
			return out, nil
		},
		func() {
			if a.svc.License != nil {
				_ = a.svc.License.RecordFeatureUsage(license.FeatureQueryAdvancedAIAssist)
			}
		},
	)
	a.svc.AI.emitter = a.emitter
	a.svc.AI.canUse = func(id license.FeatureID) bool { return a.eval != nil && a.eval.CanUse(id) }
	a.svc.AI.source = a.newAIContextSource()
	a.svc.AI.viewMode = func() bool { return a.prefs.ViewMode }
	a.svc.AI.mcp.auditLog = a.svc.Audit
	a.eval = NewEntitlementEvaluator(
		NewLicenseChecker(func() license.Entitlements { return a.svc.License }),
	)

	qstat := querystat.New()
	a.svc.Audit.AddExecutionObserver(func(ev QueryExecutionAuditEvent) {
		profile := ""
		driver := ""
		if a.profile != nil {
			profile = a.profile.Name
			driver = a.profile.Driver
		}
		qstat.Observe(querystat.ExecutionEvent{
			Profile:       profile,
			Driver:        driver,
			IsSelect:      ev.IsSelect,
			DurationMs:    ev.DurationMs,
			RowCount:      ev.RowCount,
			IsError:       ev.Error != "",
			RiskLevel:     ev.RiskLevel,
			StatementText: ev.StatementText,
		})
	})
	a.svc.RegisterExtension(qstat)

	a.runWiringHooks()
	return a
}

// Startup runs once when the Wails window is created. It wires the runtime
// context into services, initializes the global log file and slog logger,
// loads user preferences, and registers query audit/preflight hooks.
// Called by Wails — do not call directly.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	globalLogPath, _ := filepath.Abs("zentro.log")
	a.svc.AppLog = NewAppLogFile(globalLogPath)
	a.logger = utils.NewLogger(a.svc.AppLog)
	a.svc.Audit.logger = a.logger

	a.svc.Conn.ctx = ctx
	a.svc.Conn.logger = a.logger
	a.svc.Query.ctx = ctx
	a.svc.Query.logger = a.logger
	a.svc.Jobs.SetContext(ctx)
	a.svc.Jobs.SetLogger(a.logger)
	a.svc.Stats.SetContext(ctx)
	a.svc.Terminal.SetContext(ctx)
	a.svc.Tx.ctx = ctx
	a.svc.Tx.logger = a.logger
	a.svc.Scripts.logger = a.logger
	a.svc.AI.logger = a.logger
	go a.svc.AI.AutoStartMCP()
	a.svc.Projects.logger = a.logger
	a.svc.ProjectLock.SetLogger(a.logger)
	if a.svc.SCAuto != nil {
		a.svc.SCAuto.SetLogger(a.logger)
	}

	prefs, err := utils.LoadPreferences()
	if err != nil {
		a.logger.Warn("load preferences failed", "err", err)
	}
	a.prefs = prefs
	if prefs.MaxPooledConnections > 0 {
		a.connPool.SetMaxSize(prefs.MaxPooledConnections)
	}
	if err := utils.MigratePooledConnections(); err != nil {
		a.logger.Warn("connection pool migration failed", "err", err)
	}
	if err := utils.MigrateConnectionIDs(); err != nil {
		a.logger.Warn("connection id migration failed", "err", err)
	}
	if err := utils.MigrateEnvironmentDatabases(); err != nil {
		a.logger.Warn("environment database migration failed", "err", err)
	}
	a.svc.Feedback.RecordLaunch()
	a.svc.Query.SetQueryExecutionHook(a.svc.Audit.AppendAudit)
	a.svc.Audit.AddExecutionObserver(func(_ QueryExecutionAuditEvent) {
		a.emitter.Emit(a.ctx, constant.EventAuditUpdated, nil)
	})
	if a.launchProjectID != "" {
		a.logger.Info("launched with --project flag", "projectID", a.launchProjectID)
	}
	a.svc.Query.SetBeforeStatementHook(a.beforeQueryStatement)
	a.runStartupHooks()
	a.logger.Info("zentro starting", "version", Version)
}

// OnBeforeClose is invoked by Wails when the window is about to close.
// It emits constant.EventAppBeforeClose so the frontend can persist
// unsaved state (tabs, drafts) before ForceQuit/Shutdown tear down resources.
// Returning true cancels the close so the FE can decide when to actually quit.
func (a *App) OnBeforeClose(ctx context.Context) bool {
	if a.forceQuit {
		return false
	}
	a.emitter.Emit(ctx, constant.EventAppBeforeClose, nil)
	return true
}

// ForceQuit is the FE-facing exit path. After the FE has finished its
// pre-close work (autosave, prompts) it calls ForceQuit, which bypasses
// the OnBeforeClose guard, runs Shutdown, then asks Wails to quit.
func (a *App) ForceQuit() {
	a.forceQuit = true
	a.Shutdown()
	runtime.Quit(a.ctx)
}

// Shutdown tears down owned resources: optional autosave commit on exit,
// query executor cancellation, active transaction rollback, db connection
// close, git tracking close, and log file flush. Idempotent-ish — safe to
// call from both OnBeforeClose path and ForceQuit path.
func (a *App) Shutdown() {
	a.logger.Info("zentro shutting down")
	a.runShutdownHooks()
	if a.svc.AI != nil {
		a.svc.AI.StopMCPServer()
	}
	project := a.project
	if a.svc.SC != nil && project != nil && project.AutoCommitOnExit {
		done := make(chan error, 1)
		go func() {
			_, _, err := a.svc.SC.CommitAllIfDirty(project.StoragePath, "zentro.sc.auto: autosave flush")
			done <- err
		}()
		select {
		case err := <-done:
			if err != nil {
				a.logger.Warn("source control auto commit on close failed", "err", err, "repo_path", project.StoragePath)
			}
		case <-time.After(3 * time.Second):
			a.logger.Warn("source control auto commit on close timed out", "repo_path", project.StoragePath)
		}
	}

	if a.svc.Stats != nil {
		a.svc.Stats.Shutdown()
	}
	if a.svc.Terminal != nil {
		a.svc.Terminal.Shutdown()
	}
	a.svc.Query.Shutdown()
	a.svc.Jobs.Shutdown()
	a.closeAllWritePreviews()
	_ = a.svc.Tx.RollbackActive()
	if a.db != nil {
		_ = a.db.Close()
		a.db = nil
	}
	if a.connPool != nil {
		a.connPool.CloseAll()
	}
	if a.svc.ProjectLock != nil {
		a.svc.ProjectLock.ReleaseAll()
	}
	a.profile = nil
	a.project = nil
	a.currentEnvironmentKey = ""
	a.logger.Info("zentro shutdown complete")
	if a.svc.AppLog != nil {
		a.svc.AppLog.Close()
	}
}
