// SPDX-License-Identifier: GPL-3.0-only

package driver

import (
	"database/sql"
	"errors"
	"time"

	"zentro/internal/models"
)

// TimeoutOr returns d when it is positive, otherwise fallback.
func TimeoutOr(d, fallback time.Duration) time.Duration {
	if d <= 0 {
		return fallback
	}
	return d
}

// ErrStatementTimeout is returned when a read-only or dry-run statement hit
// the statement timeout (context deadline or the database's own timeout).
var ErrStatementTimeout = errors.New("statement timed out")

// ErrRollbackUnconfirmed is returned when ROLLBACK itself failed. The caller
// must close the connection and answer INTERNAL.
var ErrRollbackUnconfirmed = errors.New("rollback could not be confirmed")

// ScanReadOnlyRows copies at most maxRows rows and sets Truncated when a
// further row exists (the caller asked the database for maxRows+1).
func ScanReadOnlyRows(rows *sql.Rows, maxRows int) (models.MCPReadOnlyResult, error) {
	if maxRows < 1 {
		maxRows = 1
	}
	names, err := rows.Columns()
	if err != nil {
		return models.MCPReadOnlyResult{}, err
	}
	types := make([]models.MCPReadOnlyColumn, len(names))
	colTypes, _ := rows.ColumnTypes()
	for i, name := range names {
		types[i] = models.MCPReadOnlyColumn{Name: name}
		if i < len(colTypes) && colTypes[i] != nil {
			types[i].Type = colTypes[i].DatabaseTypeName()
		}
	}
	out := models.MCPReadOnlyResult{Columns: types, Rows: [][]any{}}
	for rows.Next() {
		vals := make([]any, len(names))
		ptrs := make([]any, len(names))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return out, err
		}
		if len(out.Rows) >= maxRows {
			out.Truncated = true
			break
		}
		copied := make([]any, len(vals))
		copy(copied, vals)
		out.Rows = append(out.Rows, copied)
	}
	return out, rows.Err()
}
