// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ReadTableStats implements driver.TableStatsReader. Size comes from
// page_count * page_size (database-wide; SQLite has no per-table byte
// size without dbstat). EstRows comes from sqlite_stat1 after ANALYZE.
func (d *SQLiteDriver) ReadTableStats(ctx context.Context, sqlDB *sql.DB, _, table string, withColumns bool) (models.MCPTableStats, error) {
	exists, err := sqliteObjectExists(ctx, sqlDB, table, "table")
	if err != nil {
		return models.MCPTableStats{}, err
	}
	if !exists {
		return models.MCPTableStats{}, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
	}

	var pages, pageSize int64
	_ = sqlDB.QueryRowContext(ctx, "PRAGMA page_count").Scan(&pages)
	_ = sqlDB.QueryRowContext(ctx, "PRAGMA page_size").Scan(&pageSize)
	stats := models.MCPTableStats{TableBytes: pages * pageSize, TotalBytes: pages * pageSize}

	var rowEst sql.NullString
	err = sqlDB.QueryRowContext(ctx, `SELECT stat FROM sqlite_stat1 WHERE tbl = ? AND idx IS NULL`, table).Scan(&rowEst)
	if err != nil && isMissingSQLiteStat1(err) {
		err = sql.ErrNoRows
	}
	if err == sql.ErrNoRows {
		err = sqlDB.QueryRowContext(ctx, `SELECT stat FROM sqlite_stat1 WHERE tbl = ? ORDER BY idx LIMIT 1`, table).Scan(&rowEst)
		if err != nil && isMissingSQLiteStat1(err) {
			err = sql.ErrNoRows
		}
	}
	if err == nil && rowEst.Valid {
		fields := strings.Fields(rowEst.String)
		if len(fields) > 0 {
			if n, parseErr := strconv.ParseInt(fields[0], 10, 64); parseErr == nil {
				stats.EstRows = &n
			}
		}
	}

	if withColumns {
		cols, colErr := readSQLiteColumnStats(ctx, sqlDB, table)
		if colErr != nil {
			return models.MCPTableStats{}, colErr
		}
		stats.Columns = cols
	}
	return stats, nil
}

func readSQLiteColumnStats(ctx context.Context, sqlDB *sql.DB, table string) ([]models.MCPTableStatsColumn, error) {
	rows, err := sqlDB.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", quotePragmaIdent(table)))
	if err != nil {
		return nil, fmt.Errorf("sqlite: table stats: columns: %w", err)
	}
	defer rows.Close()
	var cols []models.MCPTableStatsColumn
	for rows.Next() {
		var cid, notnull, pk int
		var name, typ string
		var dflt any
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, models.MCPTableStatsColumn{Name: name})
	}
	return cols, rows.Err()
}

func sqliteObjectExists(ctx context.Context, sqlDB *sql.DB, name, kind string) (bool, error) {
	var n int
	err := sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE name = ? AND type = ?`, name, kind).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func isMissingSQLiteStat1(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "no such table: sqlite_stat1")
}

func quotePragmaIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}
