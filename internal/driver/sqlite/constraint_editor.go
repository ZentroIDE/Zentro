// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ─── Check Constraints ────────────────────────────────────────────────────────

func (d *SQLiteDriver) FetchCheckConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.CheckConstraintInfo, error) {
	// SQLite stores the full CREATE TABLE SQL in sqlite_master; parse CHECK constraints from it
	row := db.QueryRowContext(ctx, `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table)
	var createSQL string
	if err := row.Scan(&createSQL); err != nil {
		return []models.CheckConstraintInfo{}, nil
	}
	// Basic extraction: find "CONSTRAINT name CHECK (...)" patterns
	return parseSQLiteCheckConstraints(createSQL), nil
}

// parseSQLiteCheckConstraints extracts named CHECK constraints from a CREATE TABLE statement.
// SQLite does not expose constraints via system tables, so we parse the DDL text.
func parseSQLiteCheckConstraints(ddl string) []models.CheckConstraintInfo {
	var result []models.CheckConstraintInfo
	upper := strings.ToUpper(ddl)
	search := upper

	for {
		idx := strings.Index(search, "CONSTRAINT")
		if idx < 0 {
			break
		}
		rest := strings.TrimSpace(ddl[len(ddl)-len(search)+idx+len("CONSTRAINT"):])
		upperRest := strings.ToUpper(rest)
		checkIdx := strings.Index(upperRest, "CHECK")
		if checkIdx < 0 {
			search = search[idx+1:]
			continue
		}
		// name is the token between CONSTRAINT and CHECK
		nameToken := strings.TrimSpace(rest[:checkIdx])
		// remove quotes if any
		nameToken = strings.Trim(nameToken, `"'`+"`")
		// expression is inside the first balanced parens after CHECK
		afterCheck := strings.TrimSpace(rest[checkIdx+len("CHECK"):])
		expr := extractBalancedParens(afterCheck)
		result = append(result, models.CheckConstraintInfo{Name: nameToken, Expression: "CHECK " + expr})
		search = search[idx+1:]
	}
	if result == nil {
		result = []models.CheckConstraintInfo{}
	}
	return result
}

func extractBalancedParens(s string) string {
	s = strings.TrimSpace(s)
	if len(s) == 0 || s[0] != '(' {
		return s
	}
	depth := 0
	for i, ch := range s {
		if ch == '(' {
			depth++
		} else if ch == ')' {
			depth--
			if depth == 0 {
				return s[:i+1]
			}
		}
	}
	return s
}

// PreviewAddCheckConstraintDDL returns the statement CreateCheckConstraint executes.
func (d *SQLiteDriver) PreviewAddCheckConstraintDDL(schema, table, name, expression string) string {
	return driver.BuildAddCheckConstraintDDL(d, schema, table, name, expression)
}

func (d *SQLiteDriver) CreateCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name, expression string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddCheckConstraintDDL(schema, table, name, expression))
	return err
}

// PreviewDropCheckConstraintDDL returns the statement DropCheckConstraint executes.
func (d *SQLiteDriver) PreviewDropCheckConstraintDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *SQLiteDriver) DropCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropCheckConstraintDDL(schema, table, name))
	return err
}

// ─── Unique Constraints ───────────────────────────────────────────────────────

// FetchUniqueConstraints is not implemented for SQLite (matching prior
// behavior — unique-constraint listing was never wired up for this driver).
func (d *SQLiteDriver) FetchUniqueConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.UniqueConstraintInfo, error) {
	return nil, fmt.Errorf("unsupported driver: sqlite")
}

func (d *SQLiteDriver) CreateUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, driver.BuildAddUniqueConstraintDDL(d, schema, table, name, columns))
	return err
}

func (d *SQLiteDriver) DropUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error {
	ddl := fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// ─── Primary Key ──────────────────────────────────────────────────────────────

// FetchPrimaryKey is not implemented for SQLite (matching prior behavior —
// primary-key listing was never wired up for this driver).
func (d *SQLiteDriver) FetchPrimaryKey(ctx context.Context, db *sql.DB, schema, table string) (*models.PrimaryKeyInfo, error) {
	return nil, fmt.Errorf("unsupported driver: sqlite")
}

// PreviewAddPrimaryKeyDDL returns the statement AddPrimaryKey executes.
func (d *SQLiteDriver) PreviewAddPrimaryKeyDDL(schema, table, name string, columns []string) string {
	return driver.BuildAddPrimaryKeyDDL(d, schema, table, name, columns)
}

func (d *SQLiteDriver) AddPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error {
	_, err := db.ExecContext(ctx, d.PreviewAddPrimaryKeyDDL(schema, table, name, columns))
	return err
}

// PreviewDropPrimaryKeyDDL returns the statement DropPrimaryKey executes.
func (d *SQLiteDriver) PreviewDropPrimaryKeyDDL(schema, table, name string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP CONSTRAINT %s",
		d.QuoteIdentifier(schema), d.QuoteIdentifier(table), d.QuoteIdentifier(name))
}

func (d *SQLiteDriver) DropPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string) error {
	_, err := db.ExecContext(ctx, d.PreviewDropPrimaryKeyDDL(schema, table, name))
	return err
}
