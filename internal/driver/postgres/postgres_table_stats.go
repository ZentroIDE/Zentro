// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/models"
)

// ReadTableStats implements driver.TableStatsReader for Postgres (spec
// section 3, get_table_stats). Every value comes from Postgres' own catalog
// and statistics views -- pg_class, pg_stat_user_tables, pg_statistic -- and
// nothing here ever runs a COUNT(*) or reads a sample value: get_table_stats
// must never return pg_stats.most_common_vals or histogram_bounds, since
// those are real row data, not metadata.
func (d *PostgresDriver) ReadTableStats(ctx context.Context, sqlDB *sql.DB, schema, table string, withColumns bool) (models.MCPTableStats, error) {
	var stats models.MCPTableStats

	err := sqlDB.QueryRowContext(ctx, `
		SELECT
			CASE WHEN c.reltuples < 0 OR (s.last_analyze IS NULL AND s.last_autoanalyze IS NULL)
				THEN NULL ELSE c.reltuples::bigint END,
			pg_relation_size(c.oid),
			coalesce(pg_indexes_size(c.oid), 0),
			coalesce((SELECT pg_total_relation_size(reltoastrelid) FROM pg_class WHERE oid = c.reltoastrelid), 0),
			pg_total_relation_size(c.oid),
			s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze,
			coalesce(s.n_dead_tup, 0), coalesce(s.seq_scan, 0), coalesce(s.idx_scan, 0),
			c.relkind = 'p',
			(SELECT count(*) FROM pg_inherits WHERE inhparent = c.oid)
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
		WHERE n.nspname = $1 AND c.relname = $2
	`, schema, table).Scan(
		&stats.EstRows,
		&stats.TableBytes,
		&stats.IndexBytes,
		&stats.ToastBytes,
		&stats.TotalBytes,
		&stats.LastVacuum, &stats.LastAutovacuum, &stats.LastAnalyze, &stats.LastAutoanalyze,
		&stats.EstDeadTuples, &stats.SeqScans, &stats.IdxScans,
		&stats.Partitioned,
		&stats.PartitionCount,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return models.MCPTableStats{}, fmt.Errorf("postgres: table stats: %q.%q not found", schema, table)
		}
		return models.MCPTableStats{}, fmt.Errorf("postgres: table stats: %w", err)
	}

	if err := sqlDB.QueryRowContext(ctx, `SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()`).Scan(&stats.StatsSince); err != nil && err != sql.ErrNoRows {
		return models.MCPTableStats{}, fmt.Errorf("postgres: table stats: stats_reset: %w", err)
	}

	if withColumns {
		cols, err := readTableStatsColumns(ctx, sqlDB, schema, table)
		if err != nil {
			return models.MCPTableStats{}, err
		}
		stats.Columns = cols
	}

	return stats, nil
}

// readTableStatsColumns reads only null_frac, n_distinct and avg_width from
// pg_stats -- never most_common_vals or histogram_bounds, which hold actual
// row values rather than metadata.
func readTableStatsColumns(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]models.MCPTableStatsColumn, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT attname, null_frac, n_distinct, avg_width
		FROM pg_stats
		WHERE schemaname = $1 AND tablename = $2
		ORDER BY attname
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("postgres: table stats: columns: %w", err)
	}
	defer rows.Close()

	var cols []models.MCPTableStatsColumn
	for rows.Next() {
		var c models.MCPTableStatsColumn
		if err := rows.Scan(&c.Name, &c.NullFraction, &c.NDistinct, &c.AvgWidth); err != nil {
			return nil, fmt.Errorf("postgres: table stats: columns: %w", err)
		}
		cols = append(cols, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: table stats: columns: %w", err)
	}
	return cols, nil
}
