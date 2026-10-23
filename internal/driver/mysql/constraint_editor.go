// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ─── Check Constraints ────────────────────────────────────────────────────────

func (d *MySQLDriver) FetchCheckConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.CheckConstraintInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
		FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
		JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
			ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
			AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
		WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
		ORDER BY cc.CONSTRAINT_NAME
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
func (d *MySQLDriver) PreviewAddCheckConstraintDDL(schema, table, name, expression string) string {
	return driver.BuildAddCheckConstraintDDL(d, schema, table, name, expression)
}

func (d *MySQLDriver) CreateCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name, expression string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddCheckConstraintDDL(schema, table, name, expression))
	return err
}

// PreviewDropCheckConstraintDDL returns the statement DropCheckConstraint executes.
func (d *MySQLDriver) PreviewDropCheckConstraintDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CHECK %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *MySQLDriver) DropCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropCheckConstraintDDL(schema, table, name))
	return err
}

// ─── Unique Constraints ───────────────────────────────────────────────────────

func (d *MySQLDriver) FetchUniqueConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.UniqueConstraintInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT tc.CONSTRAINT_NAME, kcu.COLUMN_NAME
		FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
		JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
			ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
			AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
			AND tc.TABLE_NAME = kcu.TABLE_NAME
		WHERE tc.CONSTRAINT_TYPE = 'UNIQUE'
			AND tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
		ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return driver.ScanUniqueConstraintRows(rows)
}

func (d *MySQLDriver) CreateUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, driver.BuildAddUniqueConstraintDDL(d, schema, table, name, columns))
	return err
}

func (d *MySQLDriver) DropUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	ddl := fmt.Sprintf("ALTER TABLE %s.%s DROP INDEX %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// ─── Primary Key ──────────────────────────────────────────────────────────────

func (d *MySQLDriver) FetchPrimaryKey(ctx context.Context, db *sql.DB, schema, table string) (*models.PrimaryKeyInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT 'PRIMARY', COLUMN_NAME
		FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
		ORDER BY ORDINAL_POSITION
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
			pk = &models.PrimaryKeyInfo{Name: "PRIMARY", Columns: []string{}}
		}
		pk.Columns = append(pk.Columns, col)
	}
	return pk, nil
}

// PreviewAddPrimaryKeyDDL returns the statement AddPrimaryKey executes.
func (d *MySQLDriver) PreviewAddPrimaryKeyDDL(schema, table, name string, columns []string) string {
	return driver.BuildAddPrimaryKeyDDL(d, schema, table, name, columns)
}

func (d *MySQLDriver) AddPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddPrimaryKeyDDL(schema, table, name, columns))
	return err
}

// PreviewDropPrimaryKeyDDL returns the statement DropPrimaryKey executes.
// MySQL's DROP PRIMARY KEY syntax has no constraint name to reference.
func (d *MySQLDriver) PreviewDropPrimaryKeyDDL(schema, table, _ string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP PRIMARY KEY",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table))
}

func (d *MySQLDriver) DropPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropPrimaryKeyDDL(schema, table, name))
	return err
}
