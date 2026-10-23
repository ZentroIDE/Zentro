// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"testing"

	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
	"zentro/internal/utils"
)

// seedPoolConnection points utils' config dir at a temp folder and writes a
// single pooled connection, so resolveConnectionProfileByID can find it (by
// ID when set, falling back to Name otherwise — see its doc comment).
func seedPoolConnection(t *testing.T, profiles ...*models.ConnectionProfile) {
	t.Helper()
	temp := t.TempDir()
	t.Setenv("APPDATA", temp)
	t.Setenv("XDG_CONFIG_HOME", temp)
	t.Setenv("HOME", temp)
	if err := utils.SaveConnections(profiles); err != nil {
		t.Fatalf("seed pool connection: %v", err)
	}
}

func TestResolvePinnedConnection_EmptyConnectionID_UsesAmbient(t *testing.T) {
	ambientDB := setupTestDB(t)
	ambientProfile := &models.ConnectionProfile{Name: "ambient", Driver: "sqlite"}
	a := &App{db: ambientDB, profile: ambientProfile}

	profile, db, release, err := a.resolvePinnedConnection("", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer release()

	if profile != ambientProfile || db != ambientDB {
		t.Fatalf("expected empty connectionID to resolve to the ambient connection, got profile=%v db=%v", profile, db)
	}
}

// TestResolvePinnedConnection_NamedProfile_NeverReturnsAmbient is the
// regression test for the bug this file exists to fix: a schema-editor call
// scoped to a Table/Catalog tab's Pinned Environment (ADR-0001) must never
// silently fall back to whatever's currently the ambient active connection,
// even when the two happen to use the same driver.
func TestResolvePinnedConnection_NamedProfile_NeverReturnsAmbient(t *testing.T) {
	pinnedFake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-resolve-pinned", openDB: setupTestDB(t)}
	core.Register(pinnedFake)

	seedPoolConnection(t, &models.ConnectionProfile{Name: "staging", Driver: pinnedFake.name, DBName: "db1"})

	ambientDB := setupTestDB(t)
	ambientProfile := &models.ConnectionProfile{Name: "ambient", Driver: "sqlite"}
	a := &App{
		db:      ambientDB,
		profile: ambientProfile,
	}

	profile, db, release, err := a.resolvePinnedConnection("staging", "db1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer release()

	if db == ambientDB {
		t.Fatalf("expected a named profile to resolve to its own connection, got the ambient one")
	}
	if db != pinnedFake.openDB {
		t.Fatalf("expected the resolved connection to come from the named profile's driver")
	}
	if profile.Name != "staging" || profile.Driver != pinnedFake.name {
		t.Fatalf("unexpected resolved profile: %+v", profile)
	}
	if profile.DBName != "db1" {
		t.Fatalf("expected resolved profile's DBName to be the requested dbName, got %q", profile.DBName)
	}
}

// TestResolvePinnedConnection_UsesRequestedDatabase_NotProfileDefault is the
// regression test for the actual root-cause bug: two tabs pinned to the same
// pool connection but different databases must each resolve to their own
// database, not the profile's own (optional, bootstrap-only) DBName.
func TestResolvePinnedConnection_UsesRequestedDatabase_NotProfileDefault(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-resolve-dbname", openDB: setupTestDB(t)}
	core.Register(fake)

	// The pool profile's own DBName ("postgres") must never leak into a
	// pinned resolution that asked for a different database.
	seedPoolConnection(t, &models.ConnectionProfile{Name: "shared", Driver: fake.name, DBName: "postgres"})

	a := &App{}

	profile, _, release, err := a.resolvePinnedConnection("shared", "goc_sua_prod")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer release()

	if profile.DBName != "goc_sua_prod" {
		t.Fatalf("resolved profile.DBName = %q, want the requested database %q (not the pool profile's own %q)",
			profile.DBName, "goc_sua_prod", "postgres")
	}
}

func TestResolvePinnedConnection_PrefersPooledOverTempOpen(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-resolve-pooled", openDB: setupTestDB(t)}
	core.Register(fake)

	pool := NewConnectionPool(8)
	pooledDB, err := pool.Pin(context.Background(), "staging", "db1", func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "staging", Driver: fake.name, DBName: "db1"}, nil
	})
	if err != nil {
		t.Fatalf("Pin: unexpected error: %v", err)
	}

	seedPoolConnection(t, &models.ConnectionProfile{Name: "staging", Driver: fake.name, DBName: "db1"})

	a := &App{
		connPool: pool,
	}

	_, db, release, err := a.resolvePinnedConnection("staging", "db1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if db != pooledDB {
		t.Fatalf("expected resolvePinnedConnection to reuse the pooled connection instead of opening a temp one")
	}

	// The pooled path's release must be a no-op — closing it here would leave
	// a still-referenced pooled connection broken for whichever tab pinned it.
	release()
	if err := db.Ping(); err != nil {
		t.Fatalf("expected pooled connection to remain open after release(), got %v", err)
	}
	pool.Unpin("staging", "db1")
}
