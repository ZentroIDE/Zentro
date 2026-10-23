// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *PostgresDriver) SupportsForeignKeys() bool { return true }

func (d *PostgresDriver) FetchForeignKeys(ctx context.Context, db *sql.DB, schema, table string) ([]models.ForeignKeyInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			tc.constraint_name,
			kcu.column_name,
			ukcu.table_schema,
			ukcu.table_name,
			ukcu.column_name,
			rc.delete_rule,
			rc.update_rule
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name
			AND tc.constraint_schema = kcu.constraint_schema
		JOIN information_schema.referential_constraints rc
			ON rc.constraint_name = tc.constraint_name
			AND rc.constraint_schema = tc.constraint_schema
		JOIN information_schema.key_column_usage ukcu
			ON ukcu.constraint_name = rc.unique_constraint_name
			AND ukcu.constraint_schema = rc.unique_constraint_schema
			AND ukcu.ordinal_position = kcu.position_in_unique_constraint
		WHERE tc.constraint_type = 'FOREIGN KEY'
			AND tc.table_schema = $1
			AND tc.table_name = $2
		ORDER BY tc.constraint_name, kcu.ordinal_position
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return driver.ScanForeignKeyRows(rows)
}

func (d *PostgresDriver) CreateForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table string, fk models.ForeignKeyInfo) error {
	_, err := exec.ExecContext(ctx, driver.BuildAddForeignKeyDDL(d, schema, table, fk))
	return err
}

func (d *PostgresDriver) DropForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table, constraintName string) error {
	ddl := "ALTER TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table) +
		" DROP CONSTRAINT " + d.QuoteIdentifier(constraintName)
	_, err := exec.ExecContext(ctx, ddl)
	return err
}
