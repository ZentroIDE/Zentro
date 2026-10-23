// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MSSQLDriver) RunReadOnly(ctx context.Context, sqlDB *sql.DB, q models.MCPReadOnlyQuery) (models.MCPReadOnlyResult, error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("mssql: readonly: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, driver.TimeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	tx, err := conn.BeginTx(runCtx, nil)
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("mssql: readonly: begin: %w", err)
	}
	defer tx.Rollback()

	if q.LockTimeout > 0 {
		_, _ = tx.ExecContext(runCtx, fmt.Sprintf("SET LOCK_TIMEOUT %d", q.LockTimeout.Milliseconds()))
	}

	rows, err := tx.QueryContext(runCtx, q.SQL, q.Params...)
	if err != nil {
		return models.MCPReadOnlyResult{}, mapMSSQLTimeout(err)
	}
	defer rows.Close()
	out, err := driver.ScanReadOnlyRows(rows, q.MaxRows)
	if err != nil {
		return out, mapMSSQLTimeout(err)
	}
	out.Warnings = append(out.Warnings, "SQL Server has no read-only transaction; this query ran in a normal transaction that was rolled back. Prefer a login that can only read.")
	return out, nil
}

func mapMSSQLTimeout(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return driver.ErrStatementTimeout
	}
	return err
}
