// SPDX-License-Identifier: GPL-3.0-only

package mssql

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
func (d *MSSQLDriver) BuildCreateTableStatements(schema string, table models.SchemaTableSnapshot) []string {
	return []string{driver.BuildSimpleCreateTableStatement(d, schema, table)}
}

// CreateTable creates a table from column definitions.
func (d *MSSQLDriver) CreateTable(ctx context.Context, db *sql.DB, schema, table string, columns []models.ColumnDef) error {
	statements := d.BuildCreateTableStatements(schema, models.SchemaTableSnapshot{Name: table, Columns: columns})
	return driver.RunStatementsInTx(ctx, db, statements)
}

// DropObject drops a TABLE or VIEW. MSSQL does not support CASCADE, and
// INDEX must be dropped via DropIndex (it needs the owning table name).
func (d *MSSQLDriver) DropObject(ctx context.Context, db *sql.DB, schema, objectName, objectType string, cascade bool) error {
	var ddl string
	switch objectType {
	case constant.ObjectTypeTable:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for driver: sqlserver")
		}
		ddl = "DROP TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	case constant.ObjectTypeView:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for driver: sqlserver")
		}
		ddl = "DROP VIEW " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	case constant.ObjectTypeIndex:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for INDEX")
		}
		return fmt.Errorf("use DropIndex with table name for MSSQL indexes")
	default:
		return fmt.Errorf("unsupported object type: %s", objectType)
	}
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// TruncateTable empties a table. MSSQL does not support CASCADE or RESTART
// IDENTITY options.
func (d *MSSQLDriver) TruncateTable(ctx context.Context, db *sql.DB, schema, table string, cascade, restartIdentity bool) error {
	if cascade || restartIdentity {
		return fmt.Errorf("truncate options are not supported for driver: sqlserver")
	}
	ddl := "TRUNCATE TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table)
	_, err := db.ExecContext(ctx, ddl)
	return err
}

func (d *MSSQLDriver) SupportsSnapshotDDL() bool { return true }

// FetchTableDDLForSnapshot returns authoritative CREATE TABLE DDL,
// independent of SchemaDiffExtractor's FetchTableDDL.
func (d *MSSQLDriver) FetchTableDDLForSnapshot(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT c.name, t.name, c.is_nullable, dc.definition, c.max_length, c.precision, c.scale, ic.key_ordinal
		FROM sys.columns c
		JOIN sys.types t ON c.user_type_id = t.user_type_id
		JOIN sys.tables tb ON c.object_id = tb.object_id
		JOIN sys.schemas s ON tb.schema_id = s.schema_id
		LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
		LEFT JOIN sys.index_columns ic ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		WHERE s.name = @p1 AND tb.name = @p2
		ORDER BY c.column_id
	`, schema, table)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var colName, dataType, defaultVal *string
		var isNullable *bool
		var maxLen, precision, scale, keyOrd *int64

		if err := rows.Scan(&colName, &dataType, &isNullable, &defaultVal, &maxLen, &precision, &scale, &keyOrd); err != nil {
			return "", err
		}
		col := *colName + " " + *dataType
		if maxLen != nil && *maxLen > 0 && *dataType != "nvarchar" && *dataType != "nchar" {
			col += fmt.Sprintf("(%d)", *maxLen)
		} else if maxLen != nil && *maxLen == -1 && (*dataType == "nvarchar" || *dataType == "varchar") {
			col += "(MAX)"
		}
		if isNullable != nil && !*isNullable {
			col += " NOT NULL"
		}
		cols = append(cols, col)
	}

	ddl := "CREATE TABLE " + schema + ".[" + table + "] (\n"
	ddl += strings.Join(cols, ",\n")
	ddl += "\n);"

	return ddl, nil
}
