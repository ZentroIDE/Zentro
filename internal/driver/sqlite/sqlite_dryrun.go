// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"zentro/internal/db"
	"zentro/internal/driver"
	"zentro/internal/models"
)

// RunDry implements driver.DryRunner for SQLite. There is no SET CONSTRAINTS
// or pg_locks; foreign keys are enforced when the connection has them on.
func (d *SQLiteDriver) RunDry(ctx context.Context, sqlDB *sql.DB, q models.MCPDryRunQuery) (out models.MCPDryRunResult, err error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("sqlite: dry_run: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, timeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	if _, err := conn.ExecContext(runCtx, "PRAGMA foreign_keys = ON"); err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("sqlite: dry_run: foreign_keys: %w", err)
	}

	tx, err := conn.BeginTx(runCtx, nil)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("sqlite: dry_run: begin: %w", err)
	}
	out.Statements = make([]models.MCPDryRunStatement, 0, len(q.Statements))
	defer func() {
		if rbErr := tx.Rollback(); rbErr != nil && !errors.Is(rbErr, sql.ErrTxDone) {
			_ = conn.Close()
			out.RolledBack = false
			out.RollbackFailed = true
			if err == nil {
				err = driver.ErrRollbackUnconfirmed
			}
		} else {
			out.RolledBack = true
		}
	}()

	failed := false
	for i, stmt := range q.Statements {
		item := models.MCPDryRunStatement{N: i + 1, Kind: sqliteDryKind(stmt), Status: "skipped"}
		if failed {
			out.Statements = append(out.Statements, item)
			continue
		}
		start := time.Now()
		res, execErr := tx.ExecContext(runCtx, stmt)
		item.ElapsedMs = time.Since(start).Milliseconds()
		if execErr != nil {
			if mapped := mapSQLiteTimeout(execErr); errors.Is(mapped, driver.ErrStatementTimeout) {
				return out, mapped
			}
			item.Status = "error"
			item.Message = execErr.Error()
			if strings.Contains(strings.ToLower(item.Message), "constraint") {
				item.Constraint = "constraint"
			}
			failed = true
			out.Statements = append(out.Statements, item)
			continue
		}
		item.Status = "ok"
		if res != nil {
			item.RowsAffected, _ = res.RowsAffected()
		}
		if item.Kind == "insert" {
			out.Caveats = append(out.Caveats, "sequence_advanced")
		}
		out.Statements = append(out.Statements, item)
	}
	return out, nil
}

func sqliteDryKind(stmt string) string {
	tokens, err := db.Tokenize("sqlite", stmt)
	if err != nil {
		return "other"
	}
	switch db.FirstKeyword(tokens) {
	case "insert":
		return "insert"
	case "update":
		return "update"
	case "delete":
		return "delete"
	case "create", "alter", "drop", "truncate":
		return "ddl"
	default:
		return "other"
	}
}
