// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"log/slog"

	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

// fakeConnDriver embeds a real sqlite driver so it satisfies the full
// driver.DatabaseDriver interface via promoted methods, overriding only
// Name and the connection-lifecycle/catalog methods under test.
type fakeConnDriver struct {
	*sqlite.SQLiteDriver
	name string

	openDB  *sql.DB
	openErr error

	createDatabaseErr     error
	gotCreateDatabaseName string

	fetchDatabasesResult []*models.DatabaseInfo
	fetchDatabasesErr    error
}

func (f *fakeConnDriver) Name() string { return f.name }

func (f *fakeConnDriver) Open(p *models.ConnectionProfile) (*sql.DB, error) {
	if f.openErr != nil {
		return nil, f.openErr
	}
	return f.openDB, nil
}

func (f *fakeConnDriver) CreateDatabase(ctx context.Context, db *sql.DB, name string) error {
	f.gotCreateDatabaseName = name
	return f.createDatabaseErr
}

// MaintenanceDBName overrides the embedded sqlite driver's unsupported error
// so CreateDatabase tests can exercise the bootstrap-connection path.
func (f *fakeConnDriver) MaintenanceDBName() (string, error) { return "", nil }

func (f *fakeConnDriver) FetchDatabases(ctx context.Context, db *sql.DB, currentDB string, showAllSchemas bool, logger *slog.Logger) ([]*models.DatabaseInfo, error) {
	return f.fetchDatabasesResult, f.fetchDatabasesErr
}
