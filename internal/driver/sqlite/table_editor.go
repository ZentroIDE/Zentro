// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"zentro/internal/constant"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// BuildCreateTableStatements builds one CREATE TABLE statement. Pure — no DB
// access.
func (d *SQLiteDriver) BuildCreateTableStatements(schema string, table models.SchemaTableSnapshot) []string {
	return []string{driver.BuildSimpleCreateTableStatement(d, schema, table)}
}

// CreateTable creates a table from column definitions.
func (d *SQLiteDriver) CreateTable(ctx context.Context, db *sql.DB, schema, table string, columns []models.ColumnDef) error {
	statements := d.BuildCreateTableStatements(schema, models.SchemaTableSnapshot{Name: table, Columns: columns})
	return driver.RunStatementsInTx(ctx, db, statements)
}

// DropObject drops a TABLE, VIEW, or INDEX. SQLite does not support CASCADE.
func (d *SQLiteDriver) DropObject(ctx context.Context, db *sql.DB, schema, objectName, objectType string, cascade bool) error {
	var ddl string
	switch objectType {
	case constant.ObjectTypeTable:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for driver: sqlite")
		}
		ddl = "DROP TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	case constant.ObjectTypeView:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for driver: sqlite")
		}
		ddl = "DROP VIEW " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	case constant.ObjectTypeIndex:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for INDEX")
		}
		ddl = "DROP INDEX " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	default:
		return fmt.Errorf("unsupported object type: %s", objectType)
	}
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// TruncateTable is not supported for SQLite (matching prior behavior).
func (d *SQLiteDriver) TruncateTable(ctx context.Context, db *sql.DB, schema, table string, cascade, restartIdentity bool) error {
	return fmt.Errorf("truncate is not supported for driver: sqlite")
}

func (d *SQLiteDriver) SupportsSnapshotDDL() bool { return true }

// FetchTableDDLForSnapshot returns authoritative CREATE TABLE DDL (plus any
// indexes) from sqlite_master, independent of SchemaDiffExtractor's
// FetchTableDDL.
func (d *SQLiteDriver) FetchTableDDLForSnapshot(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	row := db.QueryRowContext(ctx, `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table)
	var createStmt string
	if err := row.Scan(&createStmt); err != nil {
		return "", err
	}
	idxRows, err := db.QueryContext(ctx, `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`, table)
	if err != nil {
		return createStmt + ";", nil
	}
	defer idxRows.Close()
	parts := []string{createStmt + ";"}
	for idxRows.Next() {
		var idxSQL string
		if idxRows.Scan(&idxSQL) == nil && idxSQL != "" {
			parts = append(parts, idxSQL+";")
		}
	}
	return strings.Join(parts, "\n\n"), nil
}
