// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"errors"
	"testing"

	"zentro/internal/core"
	"zentro/internal/driver"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

func TestCreateDatabase_NilProfile(t *testing.T) {
	svc := newLifecycleTestServiceForTest(&connState{})
	if err := svc.CreateDatabase(nil, "newdb"); err == nil {
		t.Fatalf("expected error for nil profile")
	}
}

func TestCreateDatabase_EmptyName(t *testing.T) {
	svc := newLifecycleTestServiceForTest(&connState{})
	prof := &models.ConnectionProfile{Name: "p1", Driver: "sqlite"}
	if err := svc.CreateDatabase(prof, "   "); err == nil {
		t.Fatalf("expected error for empty database name")
	}
}

func TestCreateDatabase_SQLiteUnsupported(t *testing.T) {
	svc := newLifecycleTestServiceForTest(&connState{})
	prof := &models.ConnectionProfile{Name: "p1", Driver: "sqlite"}
	err := svc.CreateDatabase(prof, "newdb")
	if !errors.Is(err, driver.ErrCreateDatabaseUnsupported) {
		t.Fatalf("expected ErrCreateDatabaseUnsupported, got %v", err)
	}
}

func TestCreateDatabase_BootstrapOpenFails(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-createdb-open-fail", openErr: errors.New("boom")}
	core.Register(fake)

	svc := newLifecycleTestServiceForTest(&connState{})
	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name}
	if err := svc.CreateDatabase(prof, "newdb"); err == nil {
		t.Fatalf("expected error when bootstrap connection fails to open")
	}
}

func TestCreateDatabase_Success(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-createdb-ok", openDB: setupTestDB(t)}
	core.Register(fake)

	svc := newLifecycleTestServiceForTest(&connState{})
	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name}
	if err := svc.CreateDatabase(prof, "newdb"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotCreateDatabaseName != "newdb" {
		t.Fatalf("expected driver.CreateDatabase to be called with %q, got %q", "newdb", fake.gotCreateDatabaseName)
	}
}

func TestLoadDatabasesForConnectionProfile_NilProfile(t *testing.T) {
	svc := newLifecycleTestServiceForTest(&connState{})
	if _, err := svc.LoadDatabasesForConnectionProfile(nil); err == nil {
		t.Fatalf("expected error for nil profile")
	}
}

func TestLoadDatabasesForConnectionProfile_OpensTemporaryConnection(t *testing.T) {
	fake := &fakeConnDriver{
		SQLiteDriver:         sqlite.New(),
		name:                 "fake-loaddbs-temp",
		openDB:               setupTestDB(t),
		fetchDatabasesResult: []*models.DatabaseInfo{{Name: "other"}},
	}
	core.Register(fake)

	svc := newLifecycleTestServiceForTest(&connState{})
	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name, DBName: "main"}

	names, err := svc.LoadDatabasesForConnectionProfile(prof)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(names) != 2 || names[0] != "main" || names[1] != "other" {
		t.Fatalf("unexpected database names: %v", names)
	}
}

func TestLoadDatabasesForConnectionProfile_ReusesActiveConnection(t *testing.T) {
	fake := &fakeConnDriver{
		SQLiteDriver:         sqlite.New(),
		name:                 "fake-loaddbs-active",
		fetchDatabasesResult: []*models.DatabaseInfo{{Name: "other"}},
	}
	core.Register(fake)

	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name, DBName: "main"}
	state := &connState{db: setupTestDB(t), prof: prof}
	svc := newLifecycleTestServiceForTest(state)

	names, err := svc.LoadDatabasesForConnectionProfile(prof)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(names) != 2 || names[0] != "main" || names[1] != "other" {
		t.Fatalf("unexpected database names: %v", names)
	}
}

func TestLoadDatabasesForProfile_NotFound(t *testing.T) {
	svc := newLifecycleTestServiceForTest(&connState{})
	if _, err := svc.LoadDatabasesForProfile("definitely-does-not-exist-zentro-test-profile"); err == nil {
		t.Fatalf("expected error for unknown profile name")
	}
}
