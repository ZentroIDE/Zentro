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

// fakeConstraintDriver embeds a real sqlite driver so it satisfies the full
// driver.DatabaseDriver interface via promoted methods, overriding only
// Name and the ConstraintEditor methods under test.
type fakeConstraintDriver struct {
	*sqlite.SQLiteDriver
	name string

	checkConstraints []models.CheckConstraintInfo
	checkErr         error
	uniqueConstraint []models.UniqueConstraintInfo
	uniqueErr        error
	primaryKey       *models.PrimaryKeyInfo
	pkErr            error

	gotSchema, gotTable, gotName, gotExpression string
	gotColumns                                  []string
}

func (f *fakeConstraintDriver) Name() string { return f.name }

func (f *fakeConstraintDriver) FetchCheckConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.CheckConstraintInfo, error) {
	f.gotSchema, f.gotTable = schema, table
	return f.checkConstraints, f.checkErr
}

func (f *fakeConstraintDriver) CreateCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name, expression string) error {
	f.gotSchema, f.gotTable, f.gotName, f.gotExpression = schema, table, name, expression
	return f.checkErr
}

func (f *fakeConstraintDriver) DropCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	f.gotSchema, f.gotTable, f.gotName = schema, table, name
	return f.checkErr
}

func (f *fakeConstraintDriver) FetchUniqueConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.UniqueConstraintInfo, error) {
	return f.uniqueConstraint, f.uniqueErr
}

func (f *fakeConstraintDriver) CreateUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	f.gotSchema, f.gotTable, f.gotName, f.gotColumns = schema, table, name, columns
	return f.uniqueErr
}

func (f *fakeConstraintDriver) DropUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	return f.uniqueErr
}

func (f *fakeConstraintDriver) FetchPrimaryKey(ctx context.Context, db *sql.DB, schema, table string) (*models.PrimaryKeyInfo, error) {
	return f.primaryKey, f.pkErr
}

func (f *fakeConstraintDriver) AddPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	f.gotSchema, f.gotTable, f.gotName, f.gotColumns = schema, table, name, columns
	return f.pkErr
}

func (f *fakeConstraintDriver) DropPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string) error {
	return f.pkErr
}

func TestGetCheckConstraintsWithConnection_DelegatesToDriver(t *testing.T) {
	want := []models.CheckConstraintInfo{{Name: "chk_age", Expression: "age > 0"}}
	fake := &fakeConstraintDriver{SQLiteDriver: sqlite.New(), name: "fake-check", checkConstraints: want}
	core.Register(fake)

	got, err := GetCheckConstraintsWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if fake.gotSchema != "public" || fake.gotTable != "users" {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestCreateCheckConstraintWithConnection_PropagatesAdapterError(t *testing.T) {
	wantErr := errors.New("boom")
	fake := &fakeConstraintDriver{SQLiteDriver: sqlite.New(), name: "fake-check-err", checkErr: wantErr}
	core.Register(fake)

	err := CreateCheckConstraintWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users", "chk_age", "age > 0")
	if !errors.Is(err, wantErr) {
		t.Fatalf("got %v, want %v", err, wantErr)
	}
	if fake.gotName != "chk_age" || fake.gotExpression != "age > 0" {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestCreateUniqueConstraintWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeConstraintDriver{SQLiteDriver: sqlite.New(), name: "fake-unique"}
	core.Register(fake)

	err := CreateUniqueConstraintWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users", "uq_email", []string{"email"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotName != "uq_email" || !reflect.DeepEqual(fake.gotColumns, []string{"email"}) {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestGetPrimaryKeyWithConnection_DelegatesToDriver(t *testing.T) {
	want := &models.PrimaryKeyInfo{Name: "pk_users", Columns: []string{"id"}}
	fake := &fakeConstraintDriver{SQLiteDriver: sqlite.New(), name: "fake-pk", primaryKey: want}
	core.Register(fake)

	got, err := GetPrimaryKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestAddPrimaryKeyWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeConstraintDriver{SQLiteDriver: sqlite.New(), name: "fake-add-pk"}
	core.Register(fake)

	err := AddPrimaryKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "users", "pk_users", []string{"id"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.gotName != "pk_users" || !reflect.DeepEqual(fake.gotColumns, []string{"id"}) {
		t.Fatalf("adapter called with unexpected args: %+v", fake)
	}
}

func TestConstraintWithConnection_UnknownDriver(t *testing.T) {
	if _, err := GetCheckConstraintsWithConnection(&models.ConnectionProfile{Driver: "no-such-driver"}, setupTestDB(t), "public", "users"); err == nil {
		t.Fatalf("expected error for unknown driver")
	}
}

func TestConstraintWithConnection_NoActiveConnection(t *testing.T) {
	if _, err := GetPrimaryKeyWithConnection(nil, nil, "public", "users"); err == nil {
		t.Fatalf("expected error for no active connection")
	}
}
