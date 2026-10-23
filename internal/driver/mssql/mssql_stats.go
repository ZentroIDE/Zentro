// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MSSQLDriver) ReadTableStats(ctx context.Context, sqlDB *sql.DB, schema, table string, withColumns bool) (models.MCPTableStats, error) {
	var stats models.MCPTableStats
	var rows, usedPages sql.NullInt64
	err := sqlDB.QueryRowContext(ctx, `
		SELECT SUM(p.row_count), SUM(p.used_page_count)
		FROM sys.dm_db_partition_stats p
		INNER JOIN sys.tables t ON t.object_id = p.object_id
		INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
		WHERE s.name = @p1 AND t.name = @p2 AND p.index_id IN (0, 1)
	`, sql.Named("p1", schema), sql.Named("p2", table)).Scan(&rows, &usedPages)
	if err == sql.ErrNoRows || (err == nil && !rows.Valid && !usedPages.Valid) {
		var n int
		countErr := sqlDB.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM sys.tables t
			INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
			WHERE s.name = @p1 AND t.name = @p2
		`, sql.Named("p1", schema), sql.Named("p2", table)).Scan(&n)
		if countErr != nil {
			return models.MCPTableStats{}, fmt.Errorf("mssql: table stats: %w", countErr)
		}
		if n == 0 {
			return models.MCPTableStats{}, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
		}
	} else if err != nil {
		return models.MCPTableStats{}, fmt.Errorf("mssql: table stats: %w", err)
	}
	if rows.Valid {
		n := rows.Int64
		stats.EstRows = &n
	}
	if usedPages.Valid {
		stats.TableBytes = usedPages.Int64 * 8 * 1024
		stats.TotalBytes = stats.TableBytes
	}
	if withColumns {
		colRows, colErr := sqlDB.QueryContext(ctx, `
			SELECT c.name FROM sys.columns c
			INNER JOIN sys.tables t ON t.object_id = c.object_id
			INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
			WHERE s.name = @p1 AND t.name = @p2
			ORDER BY c.column_id
		`, sql.Named("p1", schema), sql.Named("p2", table))
		if colErr != nil {
			return models.MCPTableStats{}, colErr
		}
		defer colRows.Close()
		for colRows.Next() {
			var name string
			if err := colRows.Scan(&name); err != nil {
				return models.MCPTableStats{}, err
			}
			stats.Columns = append(stats.Columns, models.MCPTableStatsColumn{Name: name})
		}
		if err := colRows.Err(); err != nil {
			return models.MCPTableStats{}, err
		}
	}
	return stats, nil
}
