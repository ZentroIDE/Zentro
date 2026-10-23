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

// fakeIndexDriver embeds a real sqlite driver so it satisfies the full
// driver.DatabaseDriver interface via promoted methods, overriding only
// Name and the IndexEditor methods under test.
type fakeIndexDriver struct {
	*sqlite.SQLiteDriver
	name string

	createErr  error
	dropErr    error
	indexes    []models.IndexInfo
	fetchErr   error
	gotSchema  string
	gotTable   string
	gotIndex   string
	gotColumns []string
	gotUnique  bool
}

func (f *fakeIndexDriver) Name() string { return f.name }

func (f *fakeIndexDriver) CreateIndex(ctx context.Context, db *sql.DB, schema, table, indexName string, columns []string, unique bool) error {
	f.gotSchema, f.gotTable, f.gotIndex, f.gotColumns, f.gotUnique = schema, table, indexName, columns, unique
	return f.createErr
}

func (f *fakeIndexDriver) DropIndex(ctx context.Context, db *sql.DB, schema, table, indexName string) error {
	f.gotSchema, f.gotTable, f.gotIndex = schema, table, indexName
	return f.dropErr
}

func (f *fakeIndexDriver) FetchIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.IndexInfo, error) {
	f.gotSchema, f.gotTable = schema, table
	return f.indexes, f.fetchErr
}

func TestCreateIndexWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeIndexDriver{SQLiteDriver: sqlite.New(), name: "fake-create-index"}
	core.Register(fake)

	err := CreateIndexWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users", "idx_email", []string{"email"}, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotSchema != "public" || fake.gotTable != "users" || fake.gotIndex != "idx_email" || !fake.gotUnique {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
	if !reflect.DeepEqual(fake.gotColumns, []string{"email"}) {
		t.Fatalf("got columns %v", fake.gotColumns)
	}
}

func TestCreateIndexWithConnection_PropagatesAdapterError(t *testing.T) {
	wantErr := errors.New("boom")
	fake := &fakeIndexDriver{SQLiteDriver: sqlite.New(), name: "fake-create-index-err", createErr: wantErr}
	core.Register(fake)

	err := CreateIndexWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users", "idx_email", []string{"email"}, false)
	if !errors.Is(err, wantErr) {
		t.Fatalf("got %v, want %v", err, wantErr)
	}
}

func TestDropIndexWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeIndexDriver{SQLiteDriver: sqlite.New(), name: "fake-drop-index"}
	core.Register(fake)

	err := DropIndexWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users", "idx_email")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotSchema != "public" || fake.gotTable != "users" || fake.gotIndex != "idx_email" {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestGetIndexesWithConnection_DelegatesToDriver(t *testing.T) {
	want := []models.IndexInfo{{Name: "idx_email", Table: "users", Columns: []string{"email"}, Unique: true}}
	fake := &fakeIndexDriver{SQLiteDriver: sqlite.New(), name: "fake-get-indexes", indexes: want}
	core.Register(fake)

	got, err := GetIndexesWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestIndexWithConnection_NoActiveConnection(t *testing.T) {
	if _, err := GetIndexesWithConnection(nil, nil, "public", "users"); err == nil {
		t.Fatalf("expected error for no active connection")
	}
}

func TestIndexWithConnection_UnknownDriver(t *testing.T) {
	if err := CreateIndexWithConnection(&models.ConnectionProfile{Driver: "no-such-driver"}, setupTestDB(t), "public", "users", "idx", nil, false); err == nil {
		t.Fatalf("expected error for unknown driver")
	}
}
