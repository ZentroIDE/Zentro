// SPDX-License-Identifier: GPL-3.0-only

package mysql

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

func (d *MySQLDriver) RunDry(ctx context.Context, sqlDB *sql.DB, q models.MCPDryRunQuery) (out models.MCPDryRunResult, err error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("mysql: dry_run: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, driver.TimeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	tx, err := conn.BeginTx(runCtx, nil)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("mysql: dry_run: begin: %w", err)
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

	if q.Schema != "" {
		if _, useErr := tx.ExecContext(runCtx, "USE "+d.QuoteIdentifier(q.Schema)); useErr != nil {
			return out, fmt.Errorf("mysql: dry_run: use: %w", useErr)
		}
	}

	failed := false
	for i, stmt := range q.Statements {
		item := models.MCPDryRunStatement{N: i + 1, Kind: mysqlDryKind(stmt), Status: "skipped"}
		if failed {
			out.Statements = append(out.Statements, item)
			continue
		}
		if item.Kind == "ddl" {
			item.Status = "error"
			item.Message = "MySQL DDL cannot be dry-run: it commits implicitly and would not roll back."
			failed = true
			out.Caveats = append(out.Caveats, "ddl_implicit_commit")
			out.Statements = append(out.Statements, item)
			continue
		}
		start := time.Now()
		res, execErr := tx.ExecContext(runCtx, stmt)
		item.ElapsedMs = time.Since(start).Milliseconds()
		if execErr != nil {
			if mapped := mapMySQLTimeout(execErr); errors.Is(mapped, driver.ErrStatementTimeout) {
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
	out.Caveats = append(out.Caveats, "innodb_dml_only")
	return out, nil
}

func mysqlDryKind(stmt string) string {
	tokens, err := db.Tokenize("mysql", stmt)
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
