// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// RunReadOnly implements driver.ReadOnlyRunner for SQLite: a dedicated
// connection, query_only, a read-only transaction, then ROLLBACK.
func (d *SQLiteDriver) RunReadOnly(ctx context.Context, sqlDB *sql.DB, q models.MCPReadOnlyQuery) (models.MCPReadOnlyResult, error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("sqlite: readonly: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, timeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	if _, err := conn.ExecContext(runCtx, "PRAGMA query_only = ON"); err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("sqlite: readonly: query_only: %w", err)
	}

	tx, err := conn.BeginTx(runCtx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("sqlite: readonly: begin: %w", err)
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(runCtx, q.SQL, q.Params...)
	if err != nil {
		return models.MCPReadOnlyResult{}, mapSQLiteTimeout(err)
	}
	defer rows.Close()
	out, err := driver.ScanReadOnlyRows(rows, q.MaxRows)
	if err != nil {
		return out, mapSQLiteTimeout(err)
	}
	return out, nil
}

func timeoutOr(d, fallback time.Duration) time.Duration {
	if d <= 0 {
		return fallback
	}
	return d
}

func mapSQLiteTimeout(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return driver.ErrStatementTimeout
	}
	return err
}
