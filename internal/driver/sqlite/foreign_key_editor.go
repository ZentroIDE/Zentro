// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// SupportsForeignKeys, FetchForeignKeys, CreateForeignKey, and
// DropForeignKey are not implemented for SQLite (matching prior behavior —
// foreign key management was never wired up for this driver).

func (d *SQLiteDriver) SupportsForeignKeys() bool { return false }

func (d *SQLiteDriver) FetchForeignKeys(ctx context.Context, db *sql.DB, schema, table string) ([]models.ForeignKeyInfo, error) {
	return nil, fmt.Errorf("foreign key management is not supported for driver: sqlite")
}

func (d *SQLiteDriver) CreateForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table string, fk models.ForeignKeyInfo) error {
	return fmt.Errorf("foreign key management is not supported for driver: sqlite")
}

func (d *SQLiteDriver) DropForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table, constraintName string) error {
	return fmt.Errorf("foreign key management is not supported for driver: sqlite")
}
