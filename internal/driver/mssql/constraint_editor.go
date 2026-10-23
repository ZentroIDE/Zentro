// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ─── Check Constraints ────────────────────────────────────────────────────────

func (d *MSSQLDriver) FetchCheckConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.CheckConstraintInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT cc.name, cc.definition
		FROM sys.check_constraints cc
		JOIN sys.tables t ON t.object_id = cc.parent_object_id
		JOIN sys.schemas s ON s.schema_id = t.schema_id
		WHERE s.name = @p1 AND t.name = @p2
		ORDER BY cc.name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.CheckConstraintInfo
	for rows.Next() {
		var name, expr string
		if err := rows.Scan(&name, &expr); err != nil {
			return nil, err
		}
		result = append(result, models.CheckConstraintInfo{Name: name, Expression: expr})
	}
	if result == nil {
		result = []models.CheckConstraintInfo{}
	}
	return result, nil
}

// PreviewAddCheckConstraintDDL returns the statement CreateCheckConstraint executes.
func (d *MSSQLDriver) PreviewAddCheckConstraintDDL(schema, table, name, expression string) string {
	return driver.BuildAddCheckConstraintDDL(d, schema, table, name, expression)
}

func (d *MSSQLDriver) CreateCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name, expression string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddCheckConstraintDDL(schema, table, name, expression))
	return err
}

// PreviewDropCheckConstraintDDL returns the statement DropCheckConstraint executes.
func (d *MSSQLDriver) PreviewDropCheckConstraintDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *MSSQLDriver) DropCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropCheckConstraintDDL(schema, table, name))
	return err
}

// ─── Unique Constraints ───────────────────────────────────────────────────────

func (d *MSSQLDriver) FetchUniqueConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.UniqueConstraintInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT kc.name, c.name
		FROM sys.key_constraints kc
		JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
		JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		JOIN sys.tables t ON t.object_id = kc.parent_object_id
		JOIN sys.schemas s ON s.schema_id = t.schema_id
		WHERE kc.type = 'UQ' AND s.name = @p1 AND t.name = @p2
		ORDER BY kc.name, ic.key_ordinal
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return driver.ScanUniqueConstraintRows(rows)
}

func (d *MSSQLDriver) CreateUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, driver.BuildAddUniqueConstraintDDL(d, schema, table, name, columns))
	return err
}

func (d *MSSQLDriver) DropUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	ddl := fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// ─── Primary Key ──────────────────────────────────────────────────────────────

func (d *MSSQLDriver) FetchPrimaryKey(ctx context.Context, db *sql.DB, schema, table string) (*models.PrimaryKeyInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT kc.name, c.name
		FROM sys.key_constraints kc
		JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
		JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		JOIN sys.tables t ON t.object_id = kc.parent_object_id
		JOIN sys.schemas s ON s.schema_id = t.schema_id
		WHERE kc.type = 'PK' AND s.name = @p1 AND t.name = @p2
		ORDER BY ic.key_ordinal
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pk *models.PrimaryKeyInfo
	for rows.Next() {
		var name, col string
		if err := rows.Scan(&name, &col); err != nil {
			return nil, err
		}
		if pk == nil {
			pk = &models.PrimaryKeyInfo{Name: name, Columns: []string{}}
		}
		pk.Columns = append(pk.Columns, col)
	}
	return pk, nil
}

// PreviewAddPrimaryKeyDDL returns the statement AddPrimaryKey executes.
func (d *MSSQLDriver) PreviewAddPrimaryKeyDDL(schema, table, name string, columns []string) string {
	return driver.BuildAddPrimaryKeyDDL(d, schema, table, name, columns)
}

func (d *MSSQLDriver) AddPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddPrimaryKeyDDL(schema, table, name, columns))
	return err
}

// PreviewDropPrimaryKeyDDL returns the statement DropPrimaryKey executes.
func (d *MSSQLDriver) PreviewDropPrimaryKeyDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *MSSQLDriver) DropPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropPrimaryKeyDDL(schema, table, name))
	return err
}
