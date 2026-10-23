// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// PreviewCreateIndexDDL returns the CREATE INDEX statement CreateIndex executes.
func (d *MSSQLDriver) PreviewCreateIndexDDL(schema, table, indexName string, columns []string, unique bool) string {
	return driver.BuildCreateIndexDDL(d, schema, table, indexName, columns, unique)
}

// CreateIndex builds and executes a CREATE INDEX statement.
func (d *MSSQLDriver) CreateIndex(ctx context.Context, db *sql.DB, schema, table, indexName string, columns []string, unique bool) error {
	_, err := db.ExecContext(ctx, d.PreviewCreateIndexDDL(schema, table, indexName, columns, unique))
	return err
}

// PreviewDropIndexDDL returns the DROP INDEX statement DropIndex executes.
func (d *MSSQLDriver) PreviewDropIndexDDL(schema, table, indexName string) string {
	return fmt.Sprintf("DROP INDEX %s ON %s.%s",
		d.QuoteIdentifier(indexName),
		d.QuoteIdentifier(schema),
		d.QuoteIdentifier(table))
}

// DropIndex builds and executes a DROP INDEX statement.
func (d *MSSQLDriver) DropIndex(ctx context.Context, db *sql.DB, schema, table, indexName string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropIndexDDL(schema, table, indexName))
	return err
}

// FetchIndexes lists indexes on a table.
func (d *MSSQLDriver) FetchIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.IndexInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT i.name, c.name, i.is_unique
		FROM sys.indexes i
		JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1 AND t.name = @p2 AND i.name IS NOT NULL
		ORDER BY i.name, ic.key_ordinal
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	indexes := make(map[string]*models.IndexInfo)
	for rows.Next() {
		var idxName, colName *string
		var unique *bool
		if err := rows.Scan(&idxName, &colName, &unique); err != nil {
			return nil, err
		}
		if _, ok := indexes[*idxName]; !ok {
			indexes[*idxName] = &models.IndexInfo{Name: *idxName, Table: table, Unique: *unique}
		}
		indexes[*idxName].Columns = append(indexes[*idxName].Columns, *colName)
	}

	result := make([]models.IndexInfo, 0, len(indexes))
	for _, idx := range indexes {
		result = append(result, *idx)
	}
	return result, nil
}
