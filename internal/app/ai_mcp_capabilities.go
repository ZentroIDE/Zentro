// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"

	"zentro/internal/constant"
)

// mcpToolDeniedByDriver implements spec section 9 "Chưa" cells.
func mcpToolDeniedByDriver(tool, driver string) (message, hint string, denied bool) {
	switch tool {
	case "check_migration_safety":
		if driver == constant.DriverSQLite || driver == constant.DriverSQLServer {
			return fmt.Sprintf("check_migration_safety does not support the %s driver", driver),
				"Use this tool on Postgres, or on MySQL for ALGORITHM/LOCK rules.", true
		}
	case "generate_migration":
		if driver == constant.DriverSQLite {
			return "generate_migration does not support the sqlite driver",
				"Diff schemas in Zentro or generate the script on Postgres or MySQL.", true
		}
	case "preview_rollback":
		if driver == constant.DriverSQLite {
			return "preview_rollback does not support the sqlite driver",
				"Create the restore point on Postgres or MySQL to preview a rollback.", true
		}
	}
	return "", "", false
}

func mcpDriverWarnings(tool, driver string) []string {
	if driver == constant.DriverPostgres || driver == "" {
		return nil
	}
	switch tool {
	case "validate_sql":
		if driver == constant.DriverSQLServer {
			return []string{"SQL Server validate_sql is token-level only: it does not ask the database about unknown tables or columns."}
		}
	case "explain_plan":
		if driver == constant.DriverSQLite {
			return []string{"SQLite EXPLAIN QUERY PLAN has no cost or estimated rows; TotalCost and EstRows stay 0."}
		}
		if driver == constant.DriverSQLServer {
			return []string{"SQL Server explain_plan uses SHOWPLAN_XML; the statement is not executed."}
		}
	case "get_table_stats":
		return []string{fmt.Sprintf("Column statistics on %s are limited: null fraction and n_distinct are not filled unless the engine stores them.", driver)}
	case "list_indexes":
		if driver == constant.DriverSQLite {
			return []string{"SQLite does not record index scans; unused is not checked."}
		}
	case "find_dependencies":
		if driver == constant.DriverSQLite || driver == constant.DriverMySQL {
			return []string{fmt.Sprintf("find_dependencies on %s covers foreign keys, views, and triggers; routines are not walked.", driver)}
		}
	case "run_readonly_query":
		if driver == constant.DriverSQLServer {
			return []string{"SQL Server has no read-only transaction; prefer a login that can only read."}
		}
	case "dry_run":
		if driver == constant.DriverMySQL {
			return []string{"MySQL dry_run refuses DDL because DDL commits implicitly."}
		}
	case "diff_schema":
		return []string{fmt.Sprintf("diff_schema is fully supported on Postgres; on %s some object kinds may be missing from both sides.", driver)}
	case "check_migration_safety":
		if driver == constant.DriverMySQL {
			return []string{"MySQL migration safety adds ALGORITHM/LOCK hints; Postgres-specific rules (CONCURRENTLY, NOT VALID) may not apply."}
		}
	case "generate_migration":
		return []string{fmt.Sprintf("generate_migration on %s covers tables, columns, indexes, and constraints; some diffs stay in warnings.", driver)}
	case "preview_rollback":
		return []string{fmt.Sprintf("preview_rollback on %s compares against Zentro's local restore-point catalog, not a live database snapshot; a schema change made outside Zentro may not show up.", driver)}
	}
	return nil
}
