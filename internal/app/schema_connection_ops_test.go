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

// fakeTableDriver embeds a real sqlite driver so it satisfies the full
// driver.DatabaseDriver interface via promoted methods, overriding only
// Name and the TableEditor methods under test.
type fakeTableDriver struct {
	*sqlite.SQLiteDriver
	name string

	tableDDL    string
	tableDDLErr error
	createErr   error
	dropErr     error
	truncateErr error

	gotSchema, gotTable, gotObjectType string
	gotCascade, gotRestartIdentity     bool
	gotColumns                         []models.ColumnDef
}

func (f *fakeTableDriver) Name() string { return f.name }

func (f *fakeTableDriver) FetchTableDDL(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	f.gotSchema, f.gotTable = schema, table
	return f.tableDDL, f.tableDDLErr
}

func (f *fakeTableDriver) CreateTable(ctx context.Context, db *sql.DB, schema, table string, columns []models.ColumnDef) error {
	f.gotSchema, f.gotTable, f.gotColumns = schema, table, columns
	return f.createErr
}

func (f *fakeTableDriver) DropObject(ctx context.Context, db *sql.DB, schema, objectName, objectType string, cascade bool) error {
	f.gotSchema, f.gotTable, f.gotObjectType, f.gotCascade = schema, objectName, objectType, cascade
	return f.dropErr
}

func (f *fakeTableDriver) TruncateTable(ctx context.Context, db *sql.DB, schema, table string, cascade, restartIdentity bool) error {
	f.gotSchema, f.gotTable, f.gotCascade, f.gotRestartIdentity = schema, table, cascade, restartIdentity
	return f.truncateErr
}

func TestGetTableDDLWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeTableDriver{SQLiteDriver: sqlite.New(), name: "fake-table-ddl", tableDDL: "CREATE TABLE ..."}
	core.Register(fake)

	got, err := GetTableDDLWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "CREATE TABLE ..." {
		t.Fatalf("got %q", got)
	}
}

func TestCreateTableWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeTableDriver{SQLiteDriver: sqlite.New(), name: "fake-table-create"}
	core.Register(fake)

	cols := []models.ColumnDef{{Name: "id", DataType: "integer"}}
	if err := CreateTableWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", cols); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(fake.gotColumns, cols) {
		t.Fatalf("gotColumns = %+v", fake.gotColumns)
	}
}

func TestDropObjectAdvancedWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeTableDriver{SQLiteDriver: sqlite.New(), name: "fake-table-drop"}
	core.Register(fake)

	if err := DropObjectAdvancedWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", "TABLE", true); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotObjectType != "TABLE" || !fake.gotCascade {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestDropObjectWithConnection_DefaultsCascadeFalse(t *testing.T) {
	fake := &fakeTableDriver{SQLiteDriver: sqlite.New(), name: "fake-table-drop-default"}
	core.Register(fake)

	if err := DropObjectWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", "TABLE"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotCascade {
		t.Fatalf("expected cascade=false by default")
	}
}

func TestTruncateTableWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeTableDriver{SQLiteDriver: sqlite.New(), name: "fake-table-truncate"}
	core.Register(fake)

	if err := TruncateTableWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", true, true); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !fake.gotCascade || !fake.gotRestartIdentity {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestTruncateTableWithConnection_PropagatesAdapterError(t *testing.T) {
	wantErr := errors.New("truncate not supported")
	fake := &fakeTableDriver{SQLiteDriver: sqlite.New(), name: "fake-table-truncate-err", truncateErr: wantErr}
	core.Register(fake)

	err := TruncateTableWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", false, false)
	if !errors.Is(err, wantErr) {
		t.Fatalf("got %v, want %v", err, wantErr)
	}
}

func TestTableWithConnection_UnknownDriver(t *testing.T) {
	if _, err := GetTableDDLWithConnection(&models.ConnectionProfile{Driver: "no-such-driver"}, setupTestDB(t), "public", "orders"); err == nil {
		t.Fatalf("expected error for unknown driver")
	}
}

func TestTableWithConnection_NoActiveConnection(t *testing.T) {
	if _, err := GetTableDDLWithConnection(nil, nil, "public", "orders"); err == nil {
		t.Fatalf("expected error for no active connection")
	}
}
