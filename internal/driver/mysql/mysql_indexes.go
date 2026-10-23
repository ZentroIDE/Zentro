// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/models"
)

func (d *MySQLDriver) ReadIndexes(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]models.MCPIndexInfo, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE, INDEX_COMMENT
		FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY INDEX_NAME, SEQ_IN_INDEX
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("mysql: list indexes: %w", err)
	}
	defer rows.Close()

	order := []string{}
	byName := map[string]*models.MCPIndexInfo{}
	for rows.Next() {
		var name, col, method string
		var comment sql.NullString
		var nonUnique, seq int
		if err := rows.Scan(&name, &nonUnique, &seq, &col, &method, &comment); err != nil {
			return nil, err
		}
		item, ok := byName[name]
		if !ok {
			item = &models.MCPIndexInfo{
				Table: table, Name: name, Unique: nonUnique == 0,
				Primary: name == "PRIMARY", Method: method, Valid: true, Scans: -1,
			}
			byName[name] = item
			order = append(order, name)
		}
		item.Columns = append(item.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	scans, scanErr := mysqlIndexScans(ctx, sqlDB, schema, table)
	out := make([]models.MCPIndexInfo, 0, len(order))
	for _, name := range order {
		item := *byName[name]
		if scanErr == nil {
			if n, ok := scans[name]; ok {
				item.Scans = n
			} else {
				item.Scans = 0
			}
		}
		out = append(out, item)
	}
	return out, nil
}

func mysqlIndexScans(ctx context.Context, sqlDB *sql.DB, schema, table string) (map[string]int64, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT INDEX_NAME, COUNT_STAR
		FROM performance_schema.table_io_waits_summary_by_index_usage
		WHERE OBJECT_SCHEMA = ? AND OBJECT_NAME = ?
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var name sql.NullString
		var n int64
		if err := rows.Scan(&name, &n); err != nil {
			return nil, err
		}
		key := "PRIMARY"
		if name.Valid && name.String != "" {
			key = name.String
		}
		out[key] = n
	}
	return out, rows.Err()
}
