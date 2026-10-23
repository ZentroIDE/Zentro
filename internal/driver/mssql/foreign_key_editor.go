// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MSSQLDriver) SupportsForeignKeys() bool { return true }

func (d *MSSQLDriver) FetchForeignKeys(ctx context.Context, db *sql.DB, schema, table string) ([]models.ForeignKeyInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			fk.name,
			pc.name,
			rs.name,
			rt.name,
			rc.name,
			fk.delete_referential_action_desc,
			fk.update_referential_action_desc
		FROM sys.foreign_keys fk
		JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
		JOIN sys.schemas ps ON ps.schema_id = pt.schema_id
		JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
		JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
		JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
		JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
		JOIN sys.columns rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id
		WHERE ps.name = @p1 AND pt.name = @p2
		ORDER BY fk.name, fkc.constraint_column_id
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return driver.ScanForeignKeyRows(rows)
}

func (d *MSSQLDriver) CreateForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table string, fk models.ForeignKeyInfo) error {
	_, err := exec.ExecContext(ctx, driver.BuildAddForeignKeyDDL(d, schema, table, fk))
	return err
}

func (d *MSSQLDriver) DropForeignKey(ctx context.Context, exec driver.ContextExecutor, schema, table, constraintName string) error {
	ddl := "ALTER TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table) +
		" DROP CONSTRAINT " + d.QuoteIdentifier(constraintName)
	_, err := exec.ExecContext(ctx, ddl)
	return err
}
