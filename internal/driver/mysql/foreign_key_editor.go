// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MySQLDriver) SupportsForeignKeys() bool { return true }

func (d *MySQLDriver) FetchForeignKeys(ctx context.Context, db *sql.DB, schema, table string) ([]models.ForeignKeyInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			kcu.CONSTRAINT_NAME,
			kcu.COLUMN_NAME,
			kcu.REFERENCED_TABLE_SCHEMA,
			kcu.REFERENCED_TABLE_NAME,
			kcu.REFERENCED_COLUMN_NAME,
			rc.DELETE_RULE,
			rc.UPDATE_RULE
		FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
		JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
			ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
			AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
		WHERE kcu.TABLE_SCHEMA = ?
			AND kcu.TABLE_NAME = ?
			AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
		ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return driver.ScanForeignKeyRows(rows)
}

func (d *MySQLDriver) CreateForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table string, fk models.ForeignKeyInfo) error {
	_, err := exec.ExecContext(ctx, driver.BuildAddForeignKeyDDL(d, schema, table, fk))
	return err
}

func (d *MySQLDriver) DropForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table, constraintName string) error {
	ddl := "ALTER TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table) +
		" DROP FOREIGN KEY " + d.QuoteIdentifier(constraintName)
	_, err := exec.ExecContext(ctx, ddl)
	return err
}
