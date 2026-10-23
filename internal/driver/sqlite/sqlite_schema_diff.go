// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// FetchSchemaTableNames returns the names of all tables in a schema.
func (d *SQLiteDriver) FetchSchemaTableNames(ctx context.Context, db *sql.DB, schema string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT name 
		FROM sqlite_master 
		WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, nil
}

// FetchTableDDL returns the raw DDL statement to recreate a table and its columns/primary key.
func (d *SQLiteDriver) FetchTableDDL(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	var sqlStr sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT sql 
		FROM sqlite_master 
		WHERE type = 'table' AND name = $1
	`, table).Scan(&sqlStr)
	if err != nil {
		return "", err
	}

	if !sqlStr.Valid {
		return "", nil
	}

	ddl := strings.TrimSpace(sqlStr.String)
	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
	}
	return ddl, nil
}

// FetchSchemaIndexes returns the DDL for all secondary indexes in a schema.
func (d *SQLiteDriver) FetchSchemaIndexes(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaIndexSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT name, tbl_name, sql 
		FROM sqlite_master 
		WHERE type = 'index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
		ORDER BY tbl_name, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []models.SchemaIndexSnapshot
	for rows.Next() {
		var name, table, sqlStr string
		if err := rows.Scan(&name, &table, &sqlStr); err != nil {
			return nil, err
		}
		ddl := strings.TrimSpace(sqlStr)
		if !strings.HasSuffix(ddl, ";") {
			ddl += ";"
		}
		indexes = append(indexes, models.SchemaIndexSnapshot{
			Name:      name,
			TableName: table,
			DDL:       ddl,
		})
	}
	return indexes, nil
}

// FetchSchemaConstraints returns the DDL for constraints (Foreign Keys, Unique, Check).
func (d *SQLiteDriver) FetchSchemaConstraints(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaConstraintSnapshot, error) {
	tables, err := d.FetchSchemaTableNames(ctx, db, schema)
	if err != nil {
		return nil, err
	}

	var constraints []models.SchemaConstraintSnapshot
	for _, table := range tables {
		query := fmt.Sprintf(`PRAGMA foreign_key_list("%s")`, table)
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			continue // skip table if pragma fails
		}
		for rows.Next() {
			var id, seq int
			var targetTable, sourceColumn, targetColumn, onUpdate, onDelete, match string
			if err := rows.Scan(&id, &seq, &targetTable, &sourceColumn, &targetColumn, &onUpdate, &onDelete, &match); err == nil {
				constraintName := fmt.Sprintf("fk_%s_%s_%s", table, targetTable, sourceColumn)
				ddl := fmt.Sprintf(
					"ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s(%s);",
					table, constraintName, sourceColumn, targetTable, targetColumn,
				)
				constraints = append(constraints, models.SchemaConstraintSnapshot{
					Name:      constraintName,
					TableName: table,
					Type:      "FOREIGN KEY",
					DDL:       ddl,
				})
			}
		}
		rows.Close()
	}

	return constraints, nil
}

// FetchSchemaViews returns the DDL for all views in a schema.
func (d *SQLiteDriver) FetchSchemaViews(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaViewSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT name, sql 
		FROM sqlite_master 
		WHERE type = 'view' AND sql IS NOT NULL
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var views []models.SchemaViewSnapshot
	for rows.Next() {
		var name, sqlStr string
		if err := rows.Scan(&name, &sqlStr); err != nil {
			return nil, err
		}
		ddl := strings.TrimSpace(sqlStr)
		if !strings.HasSuffix(ddl, ";") {
			ddl += ";"
		}
		views = append(views, models.SchemaViewSnapshot{
			Name: name,
			DDL:  ddl,
		})
	}
	return views, nil
}

// FetchSchemaRoutines returns the DDL for all stored procedures and functions in a schema (unsupported in SQLite).
func (d *SQLiteDriver) FetchSchemaRoutines(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaRoutineSnapshot, error) {
	return nil, nil
}
