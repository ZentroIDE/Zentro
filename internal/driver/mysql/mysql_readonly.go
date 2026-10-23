// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MySQLDriver) RunReadOnly(ctx context.Context, sqlDB *sql.DB, q models.MCPReadOnlyQuery) (models.MCPReadOnlyResult, error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("mysql: readonly: conn: %w", err)
	}
	defer conn.Close()

	runCtx, cancel := context.WithTimeout(ctx, driver.TimeoutOr(q.Timeout, 15*time.Second))
	defer cancel()

	tx, err := conn.BeginTx(runCtx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return models.MCPReadOnlyResult{}, fmt.Errorf("mysql: readonly: begin: %w", err)
	}
	defer tx.Rollback()

	if q.Schema != "" {
		if _, err := tx.ExecContext(runCtx, "USE "+d.QuoteIdentifier(q.Schema)); err != nil {
			return models.MCPReadOnlyResult{}, fmt.Errorf("mysql: readonly: use: %w", err)
		}
	}
	if q.LockTimeout > 0 {
		ms := int(q.LockTimeout.Milliseconds())
		if ms < 1 {
			ms = 1
		}
		_, _ = tx.ExecContext(runCtx, fmt.Sprintf("SET SESSION innodb_lock_wait_timeout = %d", ms/1000+1))
	}

	rows, err := tx.QueryContext(runCtx, q.SQL, q.Params...)
	if err != nil {
		return models.MCPReadOnlyResult{}, mapMySQLTimeout(err)
	}
	defer rows.Close()
	out, err := driver.ScanReadOnlyRows(rows, q.MaxRows)
	if err != nil {
		return out, mapMySQLTimeout(err)
	}
	return out, nil
}

func mapMySQLTimeout(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return driver.ErrStatementTimeout
	}
	return err
}
