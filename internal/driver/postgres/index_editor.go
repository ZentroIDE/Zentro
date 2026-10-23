// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// PreviewCreateIndexDDL returns the CREATE INDEX statement CreateIndex executes.
func (d *PostgresDriver) PreviewCreateIndexDDL(schema, table, indexName string, columns []string, unique bool) string {
	return driver.BuildCreateIndexDDL(d, schema, table, indexName, columns, unique)
}

// CreateIndex builds and executes a CREATE INDEX statement.
func (d *PostgresDriver) CreateIndex(ctx context.Context, db *sql.DB, schema, table, indexName string, columns []string, unique bool) error {
	_, err := db.ExecContext(ctx, d.PreviewCreateIndexDDL(schema, table, indexName, columns, unique))
	return err
}

// PreviewDropIndexDDL returns the DROP INDEX statement DropIndex executes.
// CASCADE is required because FetchIndexes lists every index on the table,
// including ones backing a UNIQUE constraint or the primary key — Postgres
// refuses a bare DROP INDEX on those ("cannot drop index ... because
// constraint ... requires it").
func (d *PostgresDriver) PreviewDropIndexDDL(schema, table, indexName string) string {
	return fmt.Sprintf(
		"DROP INDEX %s.%s CASCADE",
		d.QuoteIdentifier(schema),
		d.QuoteIdentifier(indexName),
	)
}

// DropIndex builds and executes a DROP INDEX statement.
func (d *PostgresDriver) DropIndex(ctx context.Context, db *sql.DB, schema, table, indexName string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropIndexDDL(schema, table, indexName))
	return err
}

// FetchIndexes lists indexes on a table.
func (d *PostgresDriver) FetchIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.IndexInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT i.relname, a.attname, ix.indisunique
		FROM pg_class t
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN pg_index ix ON t.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
		WHERE n.nspname = $1 AND t.relname = $2
		ORDER BY i.relname, a.attnum
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
