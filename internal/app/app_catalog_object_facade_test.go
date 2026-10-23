// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

// fakeCatalogDriver embeds a real sqlite driver so it satisfies the full
// driver.DatabaseDriver interface via promoted methods, while overriding
// only CatalogObjectDetails and Name to control test behavior.
type fakeCatalogDriver struct {
	*sqlite.SQLiteDriver
	name    string
	details models.CatalogObjectDetails
	err     error

	gotSchema, gotObjectKind, gotName, gotTableName string
}

func (f *fakeCatalogDriver) Name() string { return f.name }

func (f *fakeCatalogDriver) CatalogObjectDetails(ctx context.Context, db *sql.DB, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error) {
	f.gotSchema, f.gotObjectKind, f.gotName, f.gotTableName = schema, objectKind, name, tableName
	return f.details, f.err
}

// Every call below passes "" for connectionID, resolving to the ambient
// a.db/a.profile set up on each App literal — see
// resolve_pinned_connection_test.go for the pinned-connection cases.
func TestGetCatalogObjectDetails_DelegatesToRegisteredDriver(t *testing.T) {
	fake := &fakeCatalogDriver{
		SQLiteDriver: sqlite.New(),
		name:         "faketestdriver-delegate",
		details: models.CatalogObjectDetails{
			ObjectKind: "indexes",
			Name:       "idx_users_email",
			Schema:     "public",
			DDL:        "CREATE INDEX idx_users_email ON users (email);",
		},
	}
	core.Register(fake)

	a := &App{
		db:      setupTestDB(t),
		profile: &models.ConnectionProfile{Driver: fake.name},
	}

	got, err := a.GetCatalogObjectDetails("", "", "public", "indexes", "idx_users_email", "users")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, fake.details) {
		t.Fatalf("got %+v, want %+v", got, fake.details)
	}
	if fake.gotSchema != "public" || fake.gotObjectKind != "indexes" || fake.gotName != "idx_users_email" || fake.gotTableName != "users" {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestGetCatalogObjectDetails_PropagatesAdapterError(t *testing.T) {
	wantErr := errors.New("boom")
	fake := &fakeCatalogDriver{
		SQLiteDriver: sqlite.New(),
		name:         "faketestdriver-error",
		err:          wantErr,
	}
	core.Register(fake)

	a := &App{
		db:      setupTestDB(t),
		profile: &models.ConnectionProfile{Driver: fake.name},
	}

	_, err := a.GetCatalogObjectDetails("", "", "public", "indexes", "idx", "users")
	if !errors.Is(err, wantErr) {
		t.Fatalf("got err %v, want %v", err, wantErr)
	}
}

func TestGetCatalogObjectDetails_UnknownDriver(t *testing.T) {
	a := &App{
		db:      setupTestDB(t),
		profile: &models.ConnectionProfile{Driver: "no-such-driver"},
	}

	_, err := a.GetCatalogObjectDetails("", "", "public", "indexes", "idx", "users")
	if err == nil {
		t.Fatalf("expected error for unknown driver, got nil")
	}
}

func TestGetCatalogObjectDetails_NoActiveConnection(t *testing.T) {
	a := &App{}

	_, err := a.GetCatalogObjectDetails("", "", "public", "indexes", "idx", "users")
	if err == nil {
		t.Fatalf("expected error for no active connection, got nil")
	}
}
