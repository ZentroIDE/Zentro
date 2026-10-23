// SPDX-License-Identifier: GPL-3.0-only

package driver

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// MaxBindParams is how many bound parameters one probe statement may carry.
// It stays under SQL Server's limit of 2100, the tightest of the four dialects.
const MaxBindParams = 900

// BindMarker renders the n-th (1-based) bound-parameter placeholder in a
// dialect: $1 for Postgres, @p1 for SQL Server, ? for MySQL and SQLite.
type BindMarker func(n int) string

// BuildReferencingRowsQuery builds `SELECT 1 FROM child WHERE <match>` for the
// given key tuples and the bound arguments that go with it. A single column
// becomes `col IN (...)`; several columns are spelled out with AND/OR because
// row-value IN is not portable (SQL Server has none).
func BuildReferencingRowsQuery(dialect QueryDialect, marker BindMarker, schema, table string, columns []string, keys [][]string) (string, []any, error) {
	if strings.TrimSpace(table) == "" {
		return "", nil, fmt.Errorf("table is required")
	}
	if len(columns) == 0 {
		return "", nil, fmt.Errorf("at least one column is required")
	}
	if len(keys) == 0 {
		return "", nil, fmt.Errorf("at least one key is required")
	}
	if len(keys)*len(columns) > MaxBindParams {
		return "", nil, fmt.Errorf("too many keys for one statement: %d parameters (limit %d)", len(keys)*len(columns), MaxBindParams)
	}

	quotedColumns := make([]string, len(columns))
	for i, column := range columns {
		if strings.TrimSpace(column) == "" {
			return "", nil, fmt.Errorf("column %d has no name", i+1)
		}
		quotedColumns[i] = dialect.QuoteIdentifier(column)
	}

	child := dialect.QuoteIdentifier(table)
	if strings.TrimSpace(schema) != "" {
		child = dialect.QuoteIdentifier(schema) + "." + child
	}

	args := make([]any, 0, len(keys)*len(columns))
	next := func(value string) string {
		args = append(args, value)
		return marker(len(args))
	}

	var where string
	if len(columns) == 1 {
		markers := make([]string, len(keys))
		for i, key := range keys {
			if len(key) != 1 {
				return "", nil, fmt.Errorf("key %d has %d values, expected 1", i+1, len(key))
			}
			markers[i] = next(key[0])
		}
		where = quotedColumns[0] + " IN (" + strings.Join(markers, ", ") + ")"
	} else {
		groups := make([]string, len(keys))
		for i, key := range keys {
			if len(key) != len(columns) {
				return "", nil, fmt.Errorf("key %d has %d values, expected %d", i+1, len(key), len(columns))
			}
			parts := make([]string, len(columns))
			for j := range columns {
				parts[j] = quotedColumns[j] + " = " + next(key[j])
			}
			groups[i] = "(" + strings.Join(parts, " AND ") + ")"
		}
		where = strings.Join(groups, " OR ")
	}

	return "SELECT 1 FROM " + child + " WHERE " + where, args, nil
}

// CountReferencingRowsWith is the dialect-independent body of every driver's
// CountReferencingRows: it asks for one row more than limit so it can say
// whether the count was cut off.
func CountReferencingRowsWith(ctx context.Context, db *sql.DB, dialect QueryDialect, marker BindMarker, schema, table string, columns []string, keys [][]string, limit int) (int64, bool, error) {
	if limit < 1 {
		limit = 1
	}
	query, args, err := BuildReferencingRowsQuery(dialect, marker, schema, table, columns, keys)
	if err != nil {
		return 0, false, err
	}

	rows, err := db.QueryContext(ctx, dialect.InjectPageClause(query, limit+1, 0), args...)
	if err != nil {
		return 0, false, err
	}
	defer rows.Close()

	// Counted here rather than trusted to the LIMIT: a dialect that could not
	// inject its page clause still must not read an unbounded result.
	var count int64
	for rows.Next() {
		count++
		if count > int64(limit) {
			return int64(limit), true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return 0, false, err
	}
	return count, false, nil
}
