// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"zentro/internal/core"
	"zentro/internal/driver"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

// fakeForeignKeyDriver embeds a real sqlite driver so it satisfies the full
// driver.DatabaseDriver interface via promoted methods, overriding only
// Name and the ForeignKeyEditor methods under test.
type fakeForeignKeyDriver struct {
	*sqlite.SQLiteDriver
	name string

	foreignKeys []models.ForeignKeyInfo
	fetchErr    error
	createErr   error
	dropErr     error

	createCalls []string // constraint names passed to CreateForeignKey, in call order
	dropCalls   []string // constraint names passed to DropForeignKey, in call order
}

func (f *fakeForeignKeyDriver) Name() string { return f.name }

// SupportsForeignKeys overrides the embedded SQLiteDriver's false — tests in
// this file exercise a driver that supports FK management (postgres/mysql/
// mssql-shaped), not sqlite's unsupported path.
func (f *fakeForeignKeyDriver) SupportsForeignKeys() bool { return true }

func (f *fakeForeignKeyDriver) FetchForeignKeys(ctx context.Context, db *sql.DB, schema, table string) ([]models.ForeignKeyInfo, error) {
	return f.foreignKeys, f.fetchErr
}

func (f *fakeForeignKeyDriver) CreateForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table string, fk models.ForeignKeyInfo) error {
	f.createCalls = append(f.createCalls, fk.Name)
	return f.createErr
}

func (f *fakeForeignKeyDriver) DropForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table, constraintName string) error {
	f.dropCalls = append(f.dropCalls, constraintName)
	return f.dropErr
}

func validFK(name string) models.ForeignKeyInfo {
	return models.ForeignKeyInfo{
		Name:       name,
		Columns:    []string{"customer_id"},
		RefSchema:  "public",
		RefTable:   "customers",
		RefColumns: []string{"id"},
	}
}

func TestGetForeignKeysWithConnection_DelegatesToDriver(t *testing.T) {
	want := []models.ForeignKeyInfo{validFK("fk_orders_customer")}
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-get", foreignKeys: want}
	core.Register(fake)

	got, err := GetForeignKeysWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestCreateForeignKeyWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-create"}
	core.Register(fake)

	fk := validFK("fk_orders_customer")
	if err := CreateForeignKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", fk); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(fake.createCalls, []string{"fk_orders_customer"}) {
		t.Fatalf("createCalls = %v", fake.createCalls)
	}
}

func TestCreateForeignKeyWithConnection_RejectsInvalidFK(t *testing.T) {
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-invalid"}
	core.Register(fake)

	err := CreateForeignKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", models.ForeignKeyInfo{})
	if err == nil {
		t.Fatalf("expected validation error for empty FK")
	}
	if len(fake.createCalls) != 0 {
		t.Fatalf("adapter should not be called when validation fails, got %v", fake.createCalls)
	}
}

func TestUpdateForeignKeyWithConnection_DropsThenCreatesInOneTransaction(t *testing.T) {
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-update"}
	core.Register(fake)

	newFK := validFK("fk_orders_customer_v2")
	err := UpdateForeignKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", "fk_orders_customer", newFK)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(fake.dropCalls, []string{"fk_orders_customer"}) {
		t.Fatalf("dropCalls = %v", fake.dropCalls)
	}
	if !reflect.DeepEqual(fake.createCalls, []string{"fk_orders_customer_v2"}) {
		t.Fatalf("createCalls = %v", fake.createCalls)
	}
}

func TestUpdateForeignKeyWithConnection_CreatePhaseErrorPropagates(t *testing.T) {
	wantErr := errors.New("create failed")
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-update-err", createErr: wantErr}
	core.Register(fake)

	err := UpdateForeignKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", "fk_orders_customer", validFK("fk_orders_customer_v2"))
	if !errors.Is(err, wantErr) {
		t.Fatalf("got %v, want wrapped %v", err, wantErr)
	}
	// Drop phase must still have run before the create phase failed.
	if len(fake.dropCalls) != 1 {
		t.Fatalf("expected drop phase to run before create failure, dropCalls = %v", fake.dropCalls)
	}
}

func TestUpdateForeignKeyWithConnection_RequiresOriginalName(t *testing.T) {
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-update-noname"}
	core.Register(fake)

	err := UpdateForeignKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", "", validFK("fk_orders_customer_v2"))
	if err == nil {
		t.Fatalf("expected error for missing original name")
	}
	if len(fake.dropCalls) != 0 || len(fake.createCalls) != 0 {
		t.Fatalf("adapter should not be called when validation fails")
	}
}

func TestDropForeignKeyWithConnection_DelegatesToDriver(t *testing.T) {
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New(), name: "fake-fk-drop"}
	core.Register(fake)

	if err := DropForeignKeyWithConnection(&models.ConnectionProfile{Driver: fake.name}, setupTestDB(t), "public", "orders", "fk_orders_customer"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(fake.dropCalls, []string{"fk_orders_customer"}) {
		t.Fatalf("dropCalls = %v", fake.dropCalls)
	}
}

func TestUpdateForeignKeyWithConnection_UnsupportedDriverNeverOpensTransaction(t *testing.T) {
	fake := &fakeForeignKeyDriver{SQLiteDriver: sqlite.New()}
	core.Register(&unsupportedForeignKeyDriver{fakeForeignKeyDriver: fake})

	err := UpdateForeignKeyWithConnection(&models.ConnectionProfile{Driver: "fake-fk-unsupported-driver"}, setupTestDB(t), "public", "orders", "fk_orders_customer", validFK("fk_orders_customer_v2"))
	if err == nil {
		t.Fatalf("expected error for unsupported driver")
	}
	if len(fake.dropCalls) != 0 || len(fake.createCalls) != 0 {
		t.Fatalf("adapter should not be called when the driver doesn't support foreign keys: %+v", fake)
	}
}

// unsupportedForeignKeyDriver overrides SupportsForeignKeys back to false
// (fakeForeignKeyDriver's default override is true) to test the guard path.
type unsupportedForeignKeyDriver struct {
	*fakeForeignKeyDriver
}

func (f *unsupportedForeignKeyDriver) Name() string              { return "fake-fk-unsupported-driver" }
func (f *unsupportedForeignKeyDriver) SupportsForeignKeys() bool { return false }

func TestForeignKeyWithConnection_UnknownDriver(t *testing.T) {
	if _, err := GetForeignKeysWithConnection(&models.ConnectionProfile{Driver: "no-such-driver"}, setupTestDB(t), "public", "orders"); err == nil {
		t.Fatalf("expected error for unknown driver")
	}
}

func TestForeignKeyWithConnection_NoActiveConnection(t *testing.T) {
	if _, err := GetForeignKeysWithConnection(nil, nil, "public", "orders"); err == nil {
		t.Fatalf("expected error for no active connection")
	}
}
