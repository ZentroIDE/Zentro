// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MySQLDriver) ReadTableStats(ctx context.Context, sqlDB *sql.DB, schema, table string, withColumns bool) (models.MCPTableStats, error) {
	var stats models.MCPTableStats
	var estRows sql.NullInt64
	var dataLen, indexLen, dataFree sql.NullInt64
	var updateTime, createTime sql.NullTime
	err := sqlDB.QueryRowContext(ctx, `
		SELECT TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, DATA_FREE, UPDATE_TIME, CREATE_TIME
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'
	`, schema, table).Scan(&estRows, &dataLen, &indexLen, &dataFree, &updateTime, &createTime)
	if err == sql.ErrNoRows {
		return models.MCPTableStats{}, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
	}
	if err != nil {
		return models.MCPTableStats{}, fmt.Errorf("mysql: table stats: %w", err)
	}
	if estRows.Valid {
		n := estRows.Int64
		stats.EstRows = &n
	}
	stats.TableBytes = dataLen.Int64
	stats.IndexBytes = indexLen.Int64
	stats.ToastBytes = dataFree.Int64
	stats.TotalBytes = stats.TableBytes + stats.IndexBytes
	if updateTime.Valid {
		t := updateTime.Time
		stats.LastAnalyze = &t
	}
	if createTime.Valid {
		t := createTime.Time
		stats.StatsSince = &t
	}
	if withColumns {
		cols, colErr := readMySQLColumnStats(ctx, sqlDB, schema, table)
		if colErr != nil {
			return models.MCPTableStats{}, colErr
		}
		stats.Columns = cols
	}
	return stats, nil
}

func readMySQLColumnStats(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]models.MCPTableStatsColumn, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY ORDINAL_POSITION
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("mysql: table stats: columns: %w", err)
	}
	defer rows.Close()
	var cols []models.MCPTableStatsColumn
	for rows.Next() {
		var name string
		var width sql.NullInt64
		if err := rows.Scan(&name, &width); err != nil {
			return nil, err
		}
		c := models.MCPTableStatsColumn{Name: name}
		if width.Valid {
			c.AvgWidth = int(width.Int64)
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}
