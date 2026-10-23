// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/constant"
)

func TestMCPToolDeniedByDriverMatchesSpecSection9(t *testing.T) {
	_, _, denied := mcpToolDeniedByDriver("check_migration_safety", constant.DriverSQLite)
	if !denied {
		t.Fatal("sqlite check_migration_safety should be unsupported")
	}
	_, _, denied = mcpToolDeniedByDriver("check_migration_safety", constant.DriverSQLServer)
	if !denied {
		t.Fatal("sqlserver check_migration_safety should be unsupported")
	}
	_, _, denied = mcpToolDeniedByDriver("check_migration_safety", constant.DriverMySQL)
	if denied {
		t.Fatal("mysql check_migration_safety should run")
	}
	_, _, denied = mcpToolDeniedByDriver("generate_migration", constant.DriverSQLite)
	if !denied {
		t.Fatal("sqlite generate_migration should be unsupported")
	}
	_, _, denied = mcpToolDeniedByDriver("preview_rollback", constant.DriverSQLite)
	if !denied {
		t.Fatal("sqlite preview_rollback should be unsupported")
	}
}

func TestMCPDriverWarningsCoversPreviewRollbackPartialSupport(t *testing.T) {
	if w := mcpDriverWarnings("preview_rollback", constant.DriverMySQL); len(w) == 0 {
		t.Fatal("mysql preview_rollback is a spec 9 \"Một phần\" cell and must warn what it does not check")
	}
	if w := mcpDriverWarnings("preview_rollback", constant.DriverSQLServer); len(w) == 0 {
		t.Fatal("sqlserver preview_rollback is a spec 9 \"Một phần\" cell and must warn what it does not check")
	}
	if w := mcpDriverWarnings("preview_rollback", constant.DriverPostgres); len(w) != 0 {
		t.Fatalf("postgres preview_rollback is fully supported and should not warn: %v", w)
	}
}
