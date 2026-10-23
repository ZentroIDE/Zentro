// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"

	"zentro/internal/models"
)

// Connections live in a single global pool (config.json > connections,
// via internal/utils) — a shared gateway into a server, referenced by
// ID from every project that uses it. A project no longer embeds connection
// credentials — each environment references a pool connection by ID
// (ProjectEnvironment.ConnectionRef) plus a bound database
// (ProjectEnvironment.LastDatabase). Every method here delegates straight to
// the pool-backed ConnectionService.

func (a *App) LoadConnections() ([]*models.ConnectionProfile, error) {
	profiles, err := a.svc.Conn.LoadConnections()
	if err != nil {
		return nil, err
	}
	if a.svc.Security != nil {
		return a.svc.Security.SanitizeProfiles(profiles), nil
	}
	return profiles, nil
}

func (a *App) LoadDatabasesForProfile(id string) ([]string, error) {
	return a.svc.Conn.LoadDatabasesForProfile(id)
}

func (a *App) LoadDatabasesForConnection(profile models.ConnectionProfile) ([]string, error) {
	return a.svc.Conn.LoadDatabasesForConnectionProfile(&profile)
}

func (a *App) CreateDatabase(profile models.ConnectionProfile, dbName string) error {
	return a.svc.Conn.CreateDatabase(&profile, dbName)
}

func (a *App) SaveConnection(p models.ConnectionProfile) error {
	return a.svc.Conn.SaveConnection(p)
}

func (a *App) DeleteConnection(id string) error {
	if strings.TrimSpace(id) == "" {
		return nil
	}
	return a.svc.Conn.DeleteConnection(id)
}

// ListConnectionUsage reports which projects/environments reference the
// given pool connection — backs the "used by N environments" hint shown
// before deleting or editing a connection in Settings.
func (a *App) ListConnectionUsage(id string) ([]ConnectionUsageRef, error) {
	return a.svc.Conn.ListConnectionUsage(id)
}

func (a *App) TestConnection(p models.ConnectionProfile) error { return a.svc.Conn.TestConnection(p) }

// PickSQLiteFile opens the OS-native file picker for choosing a SQLite
// database file, resolving to "" if the user cancels.
func (a *App) PickSQLiteFile() (string, error) {
	return a.openSQLiteFileDialog("Select SQLite database file")
}

func (a *App) Connect(name string) error {
	return a.svc.Conn.Connect(name)
}

// ConnectProjectEnvironment resolves the pool connection referenced by the
// given environment (ConnectionRef + LastDatabase) and connects to it.
//
// Every failure here surfaces verbatim in a toast, so each one names what is
// actually missing instead of a bare sql sentinel.
func (a *App) ConnectProjectEnvironment(envKey string) error {
	if a.project == nil {
		return fmt.Errorf("no project is open")
	}
	targetKey := models.EnvironmentKey(envKey)
	if targetKey == "" {
		targetKey = a.project.DefaultEnvironmentKey
	}

	for i := range a.project.Environments {
		env := &a.project.Environments[i]
		if env.Key != targetKey {
			continue
		}
		ref := strings.TrimSpace(env.ConnectionRef)
		if ref == "" {
			return fmt.Errorf("environment %q is not bound to a connection yet", targetKey)
		}
		db := strings.TrimSpace(env.LastDatabase)
		if db == "" {
			return fmt.Errorf("environment %q has a connection but no database selected — bind one from the project's environment matrix", targetKey)
		}
		profile, err := a.resolveConnectionProfileByID(ref)
		if err != nil {
			return err
		}
		profile.DBName = db
		if err := a.svc.Conn.ConnectWithProfile(profile); err != nil {
			return err
		}
		a.currentEnvironmentKey = targetKey
		return nil
	}
	return fmt.Errorf("environment %q is not part of this project", targetKey)
}

func (a *App) Reconnect() error                   { return a.svc.Conn.Reconnect() }
func (a *App) SwitchDatabase(dbName string) error { return a.svc.Conn.SwitchDatabase(dbName) }
func (a *App) Disconnect()                        { a.svc.Conn.Disconnect() }

func (a *App) GetConnectionStatus() (ConnectionRuntimeState, error) {
	return a.svc.Conn.GetConnectionStatus()
}

func (a *App) FetchDatabaseSchema(profileName, dbName string) error {
	var resolvedProf *models.ConnectionProfile
	if profileName != "" {
		if prof, err := a.resolveConnectionProfileByID(profileName); err == nil {
			resolvedProf = prof
		} else {
			a.logger.Warn("resolveConnectionProfileByID failed, falling back", "profile", profileName, "err", err)
		}
	}
	return a.svc.Conn.FetchDatabaseSchema(profileName, dbName, resolvedProf)
}

// FetchTableColumns and its five siblings below take connectionID+dbName so
// a Table/Catalog tab's own Pinned Environment (ADR-0001) is used when set —
// resolved via resolvePinnedConnection (resolve_pinned_connection.go),
// falling back to the ambient connection when connectionID is empty (e.g.
// callers not yet updated to pass a tab's pinned identity). dbName must be
// the tab's actual pinned database — resolvePinnedConnection uses it
// verbatim rather than the resolved connection's own (optional,
// bootstrap-only) DBName.

func (a *App) FetchTableColumns(connectionID, dbName, schema, table string) ([]*models.ColumnDef, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return a.svc.Conn.FetchTableColumns(profile, db, schema, table)
}

func (a *App) AlterTableColumn(connectionID, dbName, schema, table string, old, updated models.ColumnDef) error {
	if err := a.ensureWritable("alter table column"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return a.svc.Conn.AlterTableColumn(profile, db, schema, table, old, updated)
}

func (a *App) ReorderTableColumns(connectionID, dbName, schema, table string, newOrder []string) error {
	if err := a.ensureWritable("reorder table columns"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return a.svc.Conn.ReorderTableColumns(profile, db, schema, table, newOrder)
}

func (a *App) AddTableColumn(connectionID, dbName, schema, table string, col models.ColumnDef) error {
	if err := a.ensureWritable("add table column"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return a.svc.Conn.AddTableColumn(profile, db, schema, table, col)
}

func (a *App) DropTableColumn(connectionID, dbName, schema, table, column string) error {
	if err := a.ensureWritable("drop table column"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return a.svc.Conn.DropTableColumn(profile, db, schema, table, column)
}

// CountReferencingRows checks the data, not just the schema: how many rows of
// each child table actually reference the given parent keys.
func (a *App) CountReferencingRows(connectionID, dbName string, probes []models.ReferencingRowsProbe) ([]models.ReferencingRowsResult, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return a.svc.Conn.CountReferencingRows(profile, db, probes)
}

func (a *App) FetchTableRelationships(connectionID, dbName, schema, table string) ([]models.TableRelationship, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return a.svc.Conn.FetchTableRelationships(profile, db, schema, table)
}
