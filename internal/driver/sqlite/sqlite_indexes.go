// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/models"
)

// ReadIndexes implements driver.IndexReader. SQLite does not record index
// scans; Scans is -1 so list_indexes will not flag unused.
func (d *SQLiteDriver) ReadIndexes(ctx context.Context, sqlDB *sql.DB, _, table string) ([]models.MCPIndexInfo, error) {
	rows, err := sqlDB.QueryContext(ctx, fmt.Sprintf("PRAGMA index_list(%s)", quotePragmaIdent(table)))
	if err != nil {
		return nil, fmt.Errorf("sqlite: list indexes: %w", err)
	}
	defer rows.Close()

	type listed struct {
		name    string
		unique  bool
		origin  string
		partial bool
	}
	var listedIdx []listed
	for rows.Next() {
		var seq int
		var name, origin string
		var unique, partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return nil, fmt.Errorf("sqlite: list indexes: scan: %w", err)
		}
		listedIdx = append(listedIdx, listed{name: name, unique: unique != 0, origin: origin, partial: partial != 0})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var out []models.MCPIndexInfo
	for _, item := range listedIdx {
		cols, colErr := sqliteIndexColumns(ctx, sqlDB, item.name)
		if colErr != nil {
			return nil, colErr
		}
		out = append(out, models.MCPIndexInfo{
			Table:   table,
			Name:    item.name,
			Columns: cols,
			Unique:  item.unique,
			Primary: item.origin == "pk",
			Method:  "btree",
			Valid:   true,
			Scans:   -1,
		})
	}
	return out, nil
}

func sqliteIndexColumns(ctx context.Context, sqlDB *sql.DB, indexName string) ([]string, error) {
	rows, err := sqlDB.QueryContext(ctx, fmt.Sprintf("PRAGMA index_info(%s)", quotePragmaIdent(indexName)))
	if err != nil {
		return nil, fmt.Errorf("sqlite: index_info: %w", err)
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var seqno, cid int
		var name sql.NullString
		if err := rows.Scan(&seqno, &cid, &name); err != nil {
			return nil, err
		}
		if name.Valid {
			cols = append(cols, name.String)
		}
	}
	return cols, rows.Err()
}
