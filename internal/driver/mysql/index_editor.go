// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// PreviewCreateIndexDDL returns the CREATE INDEX statement CreateIndex executes.
func (d *MySQLDriver) PreviewCreateIndexDDL(schema, table, indexName string, columns []string, unique bool) string {
	return driver.BuildCreateIndexDDL(d, schema, table, indexName, columns, unique)
}

// CreateIndex builds and executes a CREATE INDEX statement.
func (d *MySQLDriver) CreateIndex(ctx context.Context, db *sql.DB, schema, table, indexName string, columns []string, unique bool) error {
	_, err := db.ExecContext(ctx, d.PreviewCreateIndexDDL(schema, table, indexName, columns, unique))
	return err
}

// PreviewDropIndexDDL returns the DROP INDEX statement DropIndex executes.
func (d *MySQLDriver) PreviewDropIndexDDL(schema, table, indexName string) string {
	return fmt.Sprintf("DROP INDEX %s ON %s.%s",
		d.QuoteIdentifier(indexName),
		d.QuoteIdentifier(schema),
		d.QuoteIdentifier(table))
}

// DropIndex builds and executes a DROP INDEX statement.
func (d *MySQLDriver) DropIndex(ctx context.Context, db *sql.DB, schema, table, indexName string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropIndexDDL(schema, table, indexName))
	return err
}

// FetchIndexes lists indexes on a table.
func (d *MySQLDriver) FetchIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.IndexInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
		FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY INDEX_NAME, SEQ_IN_INDEX
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	indexes := make(map[string]*models.IndexInfo)
	for rows.Next() {
		var idxName, colName *string
		var nonUnique *int64
		if err := rows.Scan(&idxName, &colName, &nonUnique); err != nil {
			return nil, err
		}
		if _, ok := indexes[*idxName]; !ok {
			indexes[*idxName] = &models.IndexInfo{Name: *idxName, Table: table, Unique: *nonUnique == 0}
		}
		indexes[*idxName].Columns = append(indexes[*idxName].Columns, *colName)
	}

	result := make([]models.IndexInfo, 0, len(indexes))
	for _, idx := range indexes {
		result = append(result, *idx)
	}
	return result, nil
}
