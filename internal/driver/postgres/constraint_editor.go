// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ─── Check Constraints ────────────────────────────────────────────────────────

func (d *PostgresDriver) FetchCheckConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.CheckConstraintInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT con.conname, pg_get_constraintdef(con.oid)
		FROM pg_constraint con
		JOIN pg_class t ON t.oid = con.conrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE n.nspname = $1 AND t.relname = $2 AND con.contype = 'c'
		ORDER BY con.conname
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
func (d *PostgresDriver) PreviewAddCheckConstraintDDL(schema, table, name, expression string) string {
	return driver.BuildAddCheckConstraintDDL(d, schema, table, name, expression)
}

func (d *PostgresDriver) CreateCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name, expression string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddCheckConstraintDDL(schema, table, name, expression))
	return err
}

// PreviewDropCheckConstraintDDL returns the statement DropCheckConstraint executes.
func (d *PostgresDriver) PreviewDropCheckConstraintDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *PostgresDriver) DropCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropCheckConstraintDDL(schema, table, name))
	return err
}

// ─── Unique Constraints ───────────────────────────────────────────────────────

func (d *PostgresDriver) FetchUniqueConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.UniqueConstraintInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT con.conname, a.attname
		FROM pg_constraint con
		JOIN pg_class t ON t.oid = con.conrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(con.conkey)
		WHERE n.nspname = $1 AND t.relname = $2 AND con.contype = 'u'
		ORDER BY con.conname, array_position(con.conkey, a.attnum)
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return driver.ScanUniqueConstraintRows(rows)
}

func (d *PostgresDriver) CreateUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, driver.BuildAddUniqueConstraintDDL(d, schema, table, name, columns))
	return err
}

func (d *PostgresDriver) DropUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	ddl := fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// ─── Primary Key ──────────────────────────────────────────────────────────────

func (d *PostgresDriver) FetchPrimaryKey(ctx context.Context, db *sql.DB, schema, table string) (*models.PrimaryKeyInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT con.conname, a.attname
		FROM pg_constraint con
		JOIN pg_class t ON t.oid = con.conrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(con.conkey)
		WHERE n.nspname = $1 AND t.relname = $2 AND con.contype = 'p'
		ORDER BY array_position(con.conkey, a.attnum)
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
func (d *PostgresDriver) PreviewAddPrimaryKeyDDL(schema, table, name string, columns []string) string {
	return driver.BuildAddPrimaryKeyDDL(d, schema, table, name, columns)
}

func (d *PostgresDriver) AddPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddPrimaryKeyDDL(schema, table, name, columns))
	return err
}

// PreviewDropPrimaryKeyDDL returns the statement DropPrimaryKey executes.
func (d *PostgresDriver) PreviewDropPrimaryKeyDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *PostgresDriver) DropPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropPrimaryKeyDDL(schema, table, name))
	return err
}
