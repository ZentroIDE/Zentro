// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// ReadIndexes implements driver.IndexReader for Postgres (spec section 3,
// list_indexes). It returns raw facts only -- no issue detection, no
// severity: a port answers what Postgres' catalog says, and the app-layer
// tool (T2.4) decides what is worth flagging on top of that.
func (d *PostgresDriver) ReadIndexes(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]models.MCPIndexInfo, error) {
	var statsSince sql.NullTime
	if err := sqlDB.QueryRowContext(ctx, `SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()`).Scan(&statsSince); err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("postgres: list indexes: stats_reset: %w", err)
	}

	rows, err := sqlDB.QueryContext(ctx, `
		SELECT
			c.relname AS table_name,
			i.relname AS index_name,
			ix.indisunique,
			ix.indisprimary,
			am.amname,
			coalesce(pg_get_expr(ix.indpred, ix.indrelid), ''),
			pg_relation_size(i.oid),
			coalesce(s.idx_scan, 0),
			ix.indisvalid,
			array_to_string(array(
				SELECT a.attname
				FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
				JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
				ORDER BY k.ord
			), ',') AS columns
		FROM pg_index ix
		JOIN pg_class c ON c.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_am am ON am.oid = i.relam
		LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
		WHERE n.nspname = $1 AND c.relname = $2
		ORDER BY i.relname
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("postgres: list indexes: %w", err)
	}
	defer rows.Close()

	var result []models.MCPIndexInfo
	for rows.Next() {
		var idx models.MCPIndexInfo
		var columns string
		if err := rows.Scan(
			&idx.Table, &idx.Name, &idx.Unique, &idx.Primary, &idx.Method,
			&idx.Predicate, &idx.SizeBytes, &idx.Scans, &idx.Valid, &columns,
		); err != nil {
			return nil, fmt.Errorf("postgres: list indexes: %w", err)
		}
		if columns != "" {
			idx.Columns = strings.Split(columns, ",")
		}
		if statsSince.Valid {
			t := statsSince.Time
			idx.StatsSince = &t
		}
		result = append(result, idx)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: list indexes: %w", err)
	}
	return result, nil
}
