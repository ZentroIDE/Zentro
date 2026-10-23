// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"zentro/internal/constant"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// BuildCreateTableStatements builds one CREATE TABLE statement. Pure — no DB
// access.
func (d *MySQLDriver) BuildCreateTableStatements(schema string, table models.SchemaTableSnapshot) []string {
	return []string{driver.BuildSimpleCreateTableStatement(d, schema, table)}
}

// CreateTable creates a table from column definitions.
func (d *MySQLDriver) CreateTable(ctx context.Context, db *sql.DB, schema, table string, columns []models.ColumnDef) error {
	statements := d.BuildCreateTableStatements(schema, models.SchemaTableSnapshot{Name: table, Columns: columns})
	return driver.RunStatementsInTx(ctx, db, statements)
}

// DropObject drops a TABLE or VIEW. MySQL does not support CASCADE, and
// INDEX must be dropped via DropIndex (it needs the owning table name).
func (d *MySQLDriver) DropObject(ctx context.Context, db *sql.DB, schema, objectName, objectType string, cascade bool) error {
	var ddl string
	switch objectType {
	case constant.ObjectTypeTable:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for driver: mysql")
		}
		ddl = "DROP TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	case constant.ObjectTypeView:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for driver: mysql")
		}
		ddl = "DROP VIEW " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	case constant.ObjectTypeIndex:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for INDEX")
		}
		return fmt.Errorf("use DropIndex with table name for MySQL indexes")
	default:
		return fmt.Errorf("unsupported object type: %s", objectType)
	}
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// TruncateTable empties a table. MySQL does not support CASCADE or RESTART
// IDENTITY options.
func (d *MySQLDriver) TruncateTable(ctx context.Context, db *sql.DB, schema, table string, cascade, restartIdentity bool) error {
	if cascade || restartIdentity {
		return fmt.Errorf("truncate options are not supported for driver: mysql")
	}
	ddl := "TRUNCATE TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table)
	_, err := db.ExecContext(ctx, ddl)
	return err
}

func (d *MySQLDriver) SupportsSnapshotDDL() bool { return true }

// FetchTableDDLForSnapshot returns authoritative CREATE TABLE DDL via SHOW
// CREATE TABLE, independent of SchemaDiffExtractor's FetchTableDDL.
func (d *MySQLDriver) FetchTableDDLForSnapshot(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	row := db.QueryRowContext(ctx, fmt.Sprintf("SHOW CREATE TABLE `%s`.`%s`", schema, table))
	var tblName, createStmt string
	if err := row.Scan(&tblName, &createStmt); err != nil {
		return "", err
	}
	return createStmt, nil
}
