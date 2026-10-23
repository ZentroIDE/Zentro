// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"zentro/internal/db"
	"zentro/internal/driver"
	"zentro/internal/models"
)

// RunDry implements driver.DryRunner: BEGIN, SET LOCAL timeouts, run each
// statement, SET CONSTRAINTS ALL IMMEDIATE, always ROLLBACK.
func (d *PostgresDriver) RunDry(ctx context.Context, sqlDB *sql.DB, q models.MCPDryRunQuery) (out models.MCPDryRunResult, err error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("postgres: dry_run: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, timeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	tx, err := conn.BeginTx(runCtx, nil)
	if err != nil {
		return models.MCPDryRunResult{}, fmt.Errorf("postgres: dry_run: begin: %w", err)
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

	if err := applyLocalTimeouts(runCtx, tx, q.Timeout, q.LockTimeout, q.IdleTimeout); err != nil {
		return out, err
	}
	if q.Schema != "" {
		if _, err := tx.ExecContext(runCtx, "SET LOCAL search_path TO "+quotePostgresIdentifier(q.Schema)); err != nil {
			return out, fmt.Errorf("postgres: dry_run: search_path: %w", err)
		}
	}

	failed := false
	for i, stmt := range q.Statements {
		item := models.MCPDryRunStatement{N: i + 1, Kind: dryKind(stmt), Status: "skipped"}
		if failed {
			out.Statements = append(out.Statements, item)
			continue
		}
		start := time.Now()
		res, execErr := tx.ExecContext(runCtx, stmt)
		item.ElapsedMs = time.Since(start).Milliseconds()
		if execErr != nil {
			if mapped := mapTimeout(execErr); errors.Is(mapped, driver.ErrStatementTimeout) {
				return out, mapped
			}
			item.Status = "error"
			fillPgExecError(&item, execErr)
			failed = true
			out.Statements = append(out.Statements, item)
			continue
		}
		item.Status = "ok"
		if res != nil {
			item.RowsAffected, _ = res.RowsAffected()
		}
		if item.Kind == "insert" {
			out.Caveats = appendUnique(out.Caveats, "sequence_advanced")
		}
		out.Statements = append(out.Statements, item)
	}

	if _, err := tx.ExecContext(runCtx, "SET CONSTRAINTS ALL IMMEDIATE"); err != nil {
		item := models.MCPDryRunStatement{N: len(out.Statements) + 1, Kind: "constraints", Status: "error"}
		fillPgExecError(&item, err)
		out.Statements = append(out.Statements, item)
	}

	out.LocksHeld = readLocks(runCtx, tx)

	return out, nil
}

func dryKind(stmt string) string {
	tokens, err := db.Tokenize("postgres", stmt)
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

func fillPgExecError(item *models.MCPDryRunStatement, err error) {
	item.Message = err.Error()
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		item.SQLState = pgErr.Code
		item.Constraint = pgErr.ConstraintName
		item.Message = pgErr.Message
	}
}

func readLocks(ctx context.Context, tx *sql.Tx) []models.MCPLockHeld {
	rows, err := tx.QueryContext(ctx, `
		SELECT coalesce(c.relname, ''), l.mode
		FROM pg_locks l
		LEFT JOIN pg_class c ON c.oid = l.relation
		WHERE l.pid = pg_backend_pid() AND l.granted AND l.relation IS NOT NULL
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []models.MCPLockHeld
	for rows.Next() {
		var lock models.MCPLockHeld
		if rows.Scan(&lock.Relation, &lock.Mode) == nil {
			out = append(out, lock)
		}
	}
	return out
}

func appendUnique(list []string, value string) []string {
	for _, item := range list {
		if item == value {
			return list
		}
	}
	return append(list, value)
}
