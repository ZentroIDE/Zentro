// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

func (d *MSSQLDriver) ReadIndexes(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]models.MCPIndexInfo, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT i.name, i.is_unique, i.is_primary_key, i.type_desc, i.is_disabled,
		       c.name, ic.key_ordinal,
		       COALESCE(s.user_seeks + s.user_scans + s.user_lookups, 0)
		FROM sys.indexes i
		INNER JOIN sys.tables t ON t.object_id = i.object_id
		INNER JOIN sys.schemas sch ON sch.schema_id = t.schema_id
		INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
		INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		LEFT JOIN sys.dm_db_index_usage_stats s ON s.object_id = i.object_id AND s.index_id = i.index_id AND s.database_id = DB_ID()
		WHERE sch.name = @p1 AND t.name = @p2 AND i.name IS NOT NULL
		ORDER BY i.name, ic.key_ordinal
	`, sql.Named("p1", schema), sql.Named("p2", table))
	if err != nil {
		return nil, fmt.Errorf("mssql: list indexes: %w", err)
	}
	defer rows.Close()

	order := []string{}
	byName := map[string]*models.MCPIndexInfo{}
	for rows.Next() {
		var name, method, col string
		var unique, primary, disabled bool
		var ordinal int
		var scans int64
		if err := rows.Scan(&name, &unique, &primary, &method, &disabled, &col, &ordinal, &scans); err != nil {
			return nil, err
		}
		item, ok := byName[name]
		if !ok {
			item = &models.MCPIndexInfo{
				Table: table, Name: name, Unique: unique, Primary: primary,
				Method: strings.ToLower(method), Valid: !disabled, Scans: scans,
			}
			byName[name] = item
			order = append(order, name)
		}
		item.Columns = append(item.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]models.MCPIndexInfo, 0, len(order))
	for _, name := range order {
		out = append(out, *byName[name])
	}
	return out, nil
}
