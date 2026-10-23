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

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"zentro/internal/constant"
	dbpkg "zentro/internal/db"
	"zentro/internal/models"
	"zentro/internal/utils"
)

type ConnectionService struct {
	ctx              context.Context
	logger           *slog.Logger
	getPrefs         func() utils.Preferences
	getDB            func() *sql.DB
	getProfile       func() *models.ConnectionProfile
	rollbackActiveTx func() error
	setDB            func(*sql.DB, *models.ConnectionProfile)
	emitter          EventEmitter
	// initSession is called after a successful connection if set.
	// Drivers that implement SessionInitializer use this hook.
	initSession func(ctx context.Context, db *sql.DB, driverName string) error
	// setWindowTitle defaults to runtime.WindowSetTitle. The real Wails
	// runtime requires a context bound to the app's lifecycle hooks and
	// calls log.Fatalf (os.Exit) otherwise, so tests override this with a
	// no-op.
	setWindowTitle func(ctx context.Context, title string)

	// schemaFetchesMu guards schemaFetchesInFlight, which tracks in-progress
	// FetchDatabaseSchema calls keyed by "profileName:dbName" so overlapping FE
	// triggers for the same target join the existing fetch instead of racing
	// a second goroutine (and a second live query) against it.
	schemaFetchesMu       sync.Mutex
	schemaFetchesInFlight map[string]bool
}

// SetSessionInitHook wires a post-connect initializer. Must be called before
// any Connect call. The provided function should call SessionInitializer.InitSession
// for drivers that implement it, and return nil otherwise.
func (s *ConnectionService) SetSessionInitHook(fn func(ctx context.Context, db *sql.DB, driverName string) error) {
	s.initSession = fn
}

func NewConnectionService(
	ctx context.Context, logger *slog.Logger, getPrefs func() utils.Preferences,
	getDB func() *sql.DB, getProfile func() *models.ConnectionProfile,
	rollbackActiveTx func() error,
	setDB func(*sql.DB, *models.ConnectionProfile),
	emitter EventEmitter,
) *ConnectionService {
	return &ConnectionService{
		ctx:                   ctx,
		logger:                logger,
		getPrefs:              getPrefs,
		getDB:                 getDB,
		getProfile:            getProfile,
		rollbackActiveTx:      rollbackActiveTx,
		setDB:                 setDB,
		emitter:               emitter,
		setWindowTitle:        runtime.WindowSetTitle,
		schemaFetchesInFlight: make(map[string]bool),
	}
}

// Ensure context is up-to-date
func (s *ConnectionService) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *ConnectionService) LoadConnections() ([]*models.ConnectionProfile, error) {
	return utils.LoadConnections()
}

func (s *ConnectionService) logDBStats(scope string, db *sql.DB, prof *models.ConnectionProfile) {
	if db == nil {
		return
	}
	stats := db.Stats()
	profileName := ""
	dbName := ""
	if prof != nil {
		profileName = prof.Name
		dbName = prof.DBName
	}
	s.logger.Debug("db pool stats",
		"scope", scope,
		"profile", profileName,
		"db", dbName,
		"open", stats.OpenConnections,
		"in_use", stats.InUse,
		"idle", stats.Idle,
	)
}

// SaveConnection upserts a profile into the global pool.
//
// A save that still wants its password remembered but carries no password
// never drops the one already stored: the incoming profile may simply not
// have been hydrated (LoadConnections only fills Password in from the keyring
// for SavePassword profiles, and importers strip credentials by design), and
// silently forgetting the secret there is what left project environments
// authenticating with an empty password. Clearing a stored password is an
// explicit act — untick "Save password" (the form submits the field it
// prefilled alongside the cleared flag) or delete the connection.
func (s *ConnectionService) SaveConnection(p models.ConnectionProfile) error {
	if p.SavePassword && !p.EncryptPassword {
		p.EncryptPassword = true
	}
	// No ID means this is a brand-new connection (the create form never has
	// one to send) — assign it now so the upsert below, and the ID this
	// profile is filed under everywhere else (ProjectEnvironment.ConnectionRef,
	// the keyring secret), are stable from the very first save.
	if strings.TrimSpace(p.ID) == "" {
		p.ID = uuid.NewString()
	}
	profiles, err := utils.LoadConnections()
	if err != nil {
		return err
	}
	found := false
	for i, existing := range profiles {
		if existing == nil || existing.ID != p.ID {
			continue
		}
		if p.SavePassword && strings.TrimSpace(p.Password) == "" {
			p.Password = existing.Password
		}
		if p.SavePassword && p.SSHPassword == "" {
			p.SSHPassword = existing.SSHPassword
		}
		if p.SavePassword && p.SSHPassphrase == "" {
			p.SSHPassphrase = existing.SSHPassphrase
		}
		profiles[i] = &p
		found = true
		break
	}
	if !found {
		profiles = append(profiles, &p)
	}
	s.logger.Info("saving connection",
		"id", p.ID,
		"profile", p.Name,
		"save_password", p.SavePassword,
		"has_password", strings.TrimSpace(p.Password) != "",
	)
	if err := utils.SaveConnections(profiles); err != nil {
		return err
	}
	if s.emitter != nil {
		s.emitter.Emit(s.ctx, constant.EventConnectionUpdated, ConnectionUpdatedEvent{Profile: &p})
	}
	return nil
}

// DeleteConnection removes the pool profile identified by id.
func (s *ConnectionService) DeleteConnection(id string) error {
	s.logger.Info("deleting connection", "id", id)
	return utils.DeleteConnectionByID(id)
}

func (s *ConnectionService) TestConnection(p models.ConnectionProfile) error {
	s.logger.Info("testing connection", "profile", p.Name)
	return dbpkg.TestConnection(&p)
}

func (s *ConnectionService) Connect(name string) error {
	profiles, err := utils.LoadConnections()
	if err != nil {
		return err
	}
	var prof *models.ConnectionProfile
	for _, p := range profiles {
		if p.Name == name {
			prof = p
			break
		}
	}
	if prof == nil {
		return fmt.Errorf("connection %q not found", name)
	}

	return s.ConnectWithProfile(prof)
}

func (s *ConnectionService) Reconnect() error {
	prof := s.getProfile()
	if prof == nil {
		return fmt.Errorf("no active connection to reconnect")
	}
	s.logger.Info("reconnecting", "profile", prof.Name, "db", prof.DBName)
	return s.ConnectWithProfile(prof)
}

// swapConnection tears down whatever connection is currently active and
// opens a new one for prof, emitting Connecting/Connected/Error events along
// the way. Shared by ConnectWithProfile and SwitchDatabase, which differ
// only in how prof is resolved and what runs after a successful connect
// (onConnected, if non-nil, runs while the connect-timeout context is still
// live — e.g. ConnectWithProfile's session-init hook).
func (s *ConnectionService) swapConnection(prof *models.ConnectionProfile, successLogScope string, onConnected func(ctx context.Context, db *sql.DB)) (*sql.DB, error) {
	if s.rollbackActiveTx != nil {
		_ = s.rollbackActiveTx()
	}
	if previousDB := s.getDB(); previousDB != nil {
		_ = previousDB.Close()
	}

	// Set active profile immediately with nil DB. If connection fails,
	// it acts as the "errored" active profile.
	s.setDB(nil, prof)

	EmitVersionedEvent(s.emitter, s.ctx, constant.EventConnectionChanged, constant.EventConnectionChangedV2, ConnectionChangedEvent{
		Profile: prof,
		Status:  constant.StatusConnecting,
	})

	db, err := dbpkg.OpenConnection(prof)
	if err != nil {
		s.logger.Error("open connection failed", "profile", prof.Name, "err", err)
		fErr := dbpkg.FriendlyError(prof.Driver, err)
		EmitVersionedEvent(s.emitter, s.ctx, constant.EventConnectionChanged, constant.EventConnectionChangedV2, ConnectionChangedEvent{
			Profile: prof,
			Status:  constant.StatusError,
		})
		return nil, fErr
	}

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.ConnectTimeout)*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		s.logger.Error("ping failed", "profile", prof.Name, "err", err)
		fErr := dbpkg.FriendlyError(prof.Driver, err)
		EmitVersionedEvent(s.emitter, s.ctx, constant.EventConnectionChanged, constant.EventConnectionChangedV2, ConnectionChangedEvent{
			Profile: prof,
			Status:  constant.StatusError,
		})
		return nil, fErr
	}

	// Connection successful, update store
	s.setDB(db, prof)
	s.logDBStats(successLogScope, db, prof)

	if onConnected != nil {
		onConnected(ctx, db)
	}

	EmitVersionedEvent(s.emitter, s.ctx, constant.EventConnectionChanged, constant.EventConnectionChangedV2, ConnectionChangedEvent{
		Profile: prof,
		Status:  constant.StatusConnected,
	})
	return db, nil
}

func (s *ConnectionService) ConnectWithProfile(prof *models.ConnectionProfile) error {
	s.logger.Info("connecting",
		"profile", prof.Name,
		"driver", prof.Driver,
		"host", prof.Host,
		"port", prof.Port,
		"db_name", prof.DBName,
		"ssl_mode", prof.SSLMode,
	)

	db, err := s.swapConnection(prof, "connect_success", func(ctx context.Context, db *sql.DB) {
		// Run driver-specific post-connect initialization if registered.
		if s.initSession != nil {
			if err := s.initSession(ctx, db, prof.Driver); err != nil && s.logger != nil {
				s.logger.Warn("session initializer failed", "driver", prof.Driver, "err", err)
			}
		}
	})
	if err != nil {
		return err
	}

	s.logger.Info("connected and emitted connection changed event",
		"profile", prof.Name,
		"driver", prof.Driver,
		"db_name", prof.DBName,
	)
	s.setWindowTitle(s.ctx, fmt.Sprintf("Zentro — %s (%s)", prof.Name, prof.Driver))

	go s.fetchDatabaseList(db, prof)
	return nil
}

func (s *ConnectionService) SwitchDatabase(dbName string) error {
	prof := s.getProfile()
	if prof == nil {
		return fmt.Errorf("no active connection")
	}
	if prof.DBName == dbName {
		return nil
	}

	s.logger.Info("switching database", "from", prof.DBName, "to", dbName)

	clone := *prof
	clone.DBName = dbName

	db, err := s.swapConnection(&clone, "switch_database_success", nil)
	if err != nil {
		return err
	}

	s.logger.Info("switched database ok")
	go s.fetchDatabaseList(db, &clone)
	return nil
}

func (s *ConnectionService) Disconnect() {
	if s.rollbackActiveTx != nil {
		_ = s.rollbackActiveTx()
	}
	db := s.getDB()
	if db != nil {
		_ = db.Close()
	}
	s.setDB(nil, nil)
	EmitVersionedEvent(s.emitter, s.ctx, constant.EventConnectionChanged, constant.EventConnectionChangedV2, ConnectionChangedEvent{
		Status: constant.StatusDisconnected,
	})
	s.setWindowTitle(s.ctx, "Zentro")
	s.logger.Info("disconnected")
}

func (s *ConnectionService) GetConnectionStatus() (ConnectionRuntimeState, error) {
	prof := s.getProfile()
	db := s.getDB()
	status := constant.StatusDisconnected
	if db != nil {
		status = constant.StatusConnected
	}
	return ConnectionRuntimeState{
		Profile: prof,
		Status:  status,
	}, nil
}
