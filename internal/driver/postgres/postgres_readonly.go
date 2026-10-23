// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// RunReadOnly implements driver.ReadOnlyRunner: a dedicated connection,
// BEGIN READ ONLY, three SET LOCAL timeouts, then always ROLLBACK.
func (d *PostgresDriver) RunReadOnly(ctx context.Context, sqlDB *sql.DB, q models.MCPReadOnlyQuery) (models.MCPReadOnlyResult, error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("postgres: readonly: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, timeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	tx, err := conn.BeginTx(runCtx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("postgres: readonly: begin: %w", err)
	}
	defer tx.Rollback()

	if err := applyLocalTimeouts(runCtx, tx, q.Timeout, q.LockTimeout, q.IdleTimeout); err != nil {
		return models.MCPReadOnlyResult{}, err
	}
	if q.Schema != "" {
		if _, err := tx.ExecContext(runCtx, "SET LOCAL search_path TO "+quotePostgresIdentifier(q.Schema)); err != nil {
			return models.MCPReadOnlyResult{}, fmt.Errorf("postgres: readonly: search_path: %w", err)
		}
	}

	rows, err := tx.QueryContext(runCtx, q.SQL, q.Params...)
	if err != nil {
		return models.MCPReadOnlyResult{}, mapTimeout(err)
	}
	defer rows.Close()

	out, err := driver.ScanReadOnlyRows(rows, q.MaxRows)
	if err != nil {
		return out, mapTimeout(err)
	}
	out.Warnings = append(out.Warnings, extensionWarnings(runCtx, tx)...)
	return out, nil
}

func applyLocalTimeouts(ctx context.Context, tx *sql.Tx, statement, lock, idle time.Duration) error {
	if _, err := tx.ExecContext(ctx, "SET LOCAL statement_timeout = "+pgDuration(statement, 15*time.Second)); err != nil {
		return fmt.Errorf("postgres: set statement_timeout: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "SET LOCAL lock_timeout = "+pgDuration(lock, time.Second)); err != nil {
		return fmt.Errorf("postgres: set lock_timeout: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "SET LOCAL idle_in_transaction_session_timeout = "+pgDuration(idle, statement)); err != nil {
		return fmt.Errorf("postgres: set idle_in_transaction_session_timeout: %w", err)
	}
	return nil
}

func pgDuration(d, fallback time.Duration) string {
	if d <= 0 {
		d = fallback
	}
	if d < time.Millisecond {
		d = time.Millisecond
	}
	return fmt.Sprintf("'%dms'", d.Milliseconds())
}

func timeoutOr(d, fallback time.Duration) time.Duration {
	if d <= 0 {
		return fallback
	}
	return d
}

func mapTimeout(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return driver.ErrStatementTimeout
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == "57014" || pgErr.Code == "55P03") {
		return driver.ErrStatementTimeout
	}
	return err
}

func extensionWarnings(ctx context.Context, tx *sql.Tx) []string {
	rows, err := tx.QueryContext(ctx, `SELECT extname FROM pg_extension WHERE extname IN ('dblink','postgres_fdw','file_fdw')`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			names = append(names, name)
		}
	}
	if len(names) == 0 {
		return nil
	}
	return []string{"this database has " + strings.Join(names, ", ") + "; a function there can write outside this transaction. Consider turning off reading data for this connection."}
}
