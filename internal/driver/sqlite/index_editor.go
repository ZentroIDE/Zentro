// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// PreviewCreateIndexDDL returns the CREATE INDEX statement CreateIndex executes.
func (d *SQLiteDriver) PreviewCreateIndexDDL(schema, table, indexName string, columns []string, unique bool) string {
	return driver.BuildCreateIndexDDL(d, schema, table, indexName, columns, unique)
}

// CreateIndex builds and executes a CREATE INDEX statement.
func (d *SQLiteDriver) CreateIndex(ctx context.Context, db *sql.DB, schema, table, indexName string, columns []string, unique bool) error {
	_, err := db.ExecContext(ctx, d.PreviewCreateIndexDDL(schema, table, indexName, columns, unique))
	return err
}

// PreviewDropIndexDDL returns the DROP INDEX statement DropIndex executes.
func (d *SQLiteDriver) PreviewDropIndexDDL(schema, table, indexName string) string {
	return fmt.Sprintf("DROP INDEX %s.%s", d.QuoteIdentifier(schema), d.QuoteIdentifier(indexName))
}

// DropIndex builds and executes a DROP INDEX statement.
func (d *SQLiteDriver) DropIndex(ctx context.Context, db *sql.DB, schema, table, indexName string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropIndexDDL(schema, table, indexName))
	return err
}

// FetchIndexes is not implemented for SQLite (matching prior behavior — index
// listing was never wired up for this driver).
func (d *SQLiteDriver) FetchIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.IndexInfo, error) {
	return nil, fmt.Errorf("unsupported driver: sqlite")
}
