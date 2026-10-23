// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"errors"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver"
)

// These tests pin the app-layer contract of the QueryDialect/Connector port
// methods that replaced driver-name branching in internal/app (issue #52).
// Drivers are registered by TestMain in main_test.go.

func TestMaintenanceDBNamePerDriver(t *testing.T) {
	cases := []struct {
		driverName string
		wantDB     string
		wantErr    error
	}{
		{constant.DriverPostgres, "postgres", nil},
		{constant.DriverSQLServer, "master", nil},
		{constant.DriverMySQL, "", nil},
		{constant.DriverSQLite, "", driver.ErrCreateDatabaseUnsupported},
	}

	for _, tc := range cases {
		t.Run(tc.driverName, func(t *testing.T) {
			drv, ok := core.Get(tc.driverName)
			if !ok {
				t.Fatalf("driver %q is not registered", tc.driverName)
			}
			got, err := drv.MaintenanceDBName()
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("MaintenanceDBName error = %v, want %v", err, tc.wantErr)
			}
			if got != tc.wantDB {
				t.Fatalf("MaintenanceDBName = %q, want %q", got, tc.wantDB)
			}
		})
	}
}

func TestSupportsSessionSchemaPerDriver(t *testing.T) {
	cases := []struct {
		driverName string
		want       bool
	}{
		{constant.DriverPostgres, true},
		{constant.DriverSQLServer, false},
		{constant.DriverMySQL, false},
		{constant.DriverSQLite, false},
	}

	for _, tc := range cases {
		t.Run(tc.driverName, func(t *testing.T) {
			drv, ok := core.Get(tc.driverName)
			if !ok {
				t.Fatalf("driver %q is not registered", tc.driverName)
			}
			if got := drv.SupportsSessionSchema(); got != tc.want {
				t.Fatalf("SupportsSessionSchema = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPostgresSchemaContextApplyAndReset(t *testing.T) {
	drv, ok := core.Get(constant.DriverPostgres)
	if !ok {
		t.Fatal("postgres driver is not registered")
	}

	executor := &recordingExecutor{}
	if err := drv.ApplySchemaContext(context.Background(), executor, "inv"); err != nil {
		t.Fatalf("ApplySchemaContext: %v", err)
	}
	if err := drv.ResetSchemaContext(context.Background(), executor); err != nil {
		t.Fatalf("ResetSchemaContext: %v", err)
	}

	if len(executor.execStatements) != 2 {
		t.Fatalf("expected 2 statements, got %d: %v", len(executor.execStatements), executor.execStatements)
	}
	if executor.execStatements[0] != `SET search_path TO "inv", "public"` {
		t.Fatalf("unexpected apply statement: %q", executor.execStatements[0])
	}
	if executor.execStatements[1] != "RESET search_path" {
		t.Fatalf("unexpected reset statement: %q", executor.execStatements[1])
	}
}

// TestApplySessionContextSkipsUnregisteredDriver guards the registry-miss
// path: an unknown driver must be a no-op, not an error or a panic.
func TestApplySessionContextSkipsUnregisteredDriver(t *testing.T) {
	executor := &recordingExecutor{}
	svc := &QueryService{
		getDriver:        func() string { return "not-a-real-driver" },
		getCurrentSchema: func() string { return "inv" },
	}
	if err := svc.applySessionContext(context.Background(), executor); err != nil {
		t.Fatalf("expected nil error for unregistered driver, got %v", err)
	}
	if len(executor.execStatements) != 0 {
		t.Fatalf("expected no statements, got %v", executor.execStatements)
	}
}
