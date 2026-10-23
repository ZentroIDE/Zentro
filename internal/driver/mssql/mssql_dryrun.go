// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"zentro/internal/db"
	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MSSQLDriver) RunDry(ctx context.Context, sqlDB *sql.DB, q models.MCPDryRunQuery) (out models.MCPDryRunResult, err error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("mssql: dry_run: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, driver.TimeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	tx, err := conn.BeginTx(runCtx, nil)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("mssql: dry_run: begin: %w", err)
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

	if q.LockTimeout > 0 {
		_, _ = tx.ExecContext(runCtx, fmt.Sprintf("SET LOCK_TIMEOUT %d", q.LockTimeout.Milliseconds()))
	}

	failed := false
	for i, stmt := range q.Statements {
		item := models.MCPDryRunStatement{N: i + 1, Kind: mssqlDryKind(stmt), Status: "skipped"}
		if failed {
			out.Statements = append(out.Statements, item)
			continue
		}
		start := time.Now()
		res, execErr := tx.ExecContext(runCtx, stmt)
		item.ElapsedMs = time.Since(start).Milliseconds()
		if execErr != nil {
			if mapped := mapMSSQLTimeout(execErr); errors.Is(mapped, driver.ErrStatementTimeout) {
				return out, mapped
			}
			item.Status = "error"
			item.Message = execErr.Error()
			failed = true
			out.Statements = append(out.Statements, item)
			continue
		}
		item.Status = "ok"
		if res != nil {
			item.RowsAffected, _ = res.RowsAffected()
		}
		out.Statements = append(out.Statements, item)
	}
	out.Caveats = append(out.Caveats, "some DDL (CREATE DATABASE) cannot run inside a transaction")
	return out, nil
}

func mssqlDryKind(stmt string) string {
	tokens, err := db.Tokenize("sqlserver", stmt)
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
