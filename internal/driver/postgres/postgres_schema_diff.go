// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

func quotePostgresIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func quotePostgresLiteral(value string) string {
	return `'` + strings.ReplaceAll(value, `'`, `''`) + `'`
}

func formatPostgresRegclassName(schemaName, objectName string) string {
	if schemaName == "" {
		return formatPostgresRegclassPart(objectName)
	}
	return formatPostgresRegclassPart(schemaName) + "." + formatPostgresRegclassPart(objectName)
}

func formatPostgresRegclassPart(name string) string {
	if isBarePostgresIdentifier(name) {
		return name
	}
	return quotePostgresIdentifier(name)
}

func isBarePostgresIdentifier(name string) bool {
	if name == "" {
		return false
	}
	for index, r := range name {
		if index == 0 {
			if !((r >= 'a' && r <= 'z') || r == '_') {
				return false
			}
			continue
		}
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '$') {
			return false
		}
	}
	return true
}

func formatPostgresSnapshotDefault(column *models.ColumnDef) string {
	if strings.EqualFold(column.GenerationKind, "identity") {
		return ""
	}
	if strings.EqualFold(column.GenerationKind, "sequence") &&
		strings.TrimSpace(column.SequenceSchema) != "" &&
		strings.TrimSpace(column.SequenceName) != "" {
		return fmt.Sprintf(
			"nextval(%s::regclass)",
			quotePostgresLiteral(
				formatPostgresRegclassName(
					strings.TrimSpace(column.SequenceSchema),
					strings.TrimSpace(column.SequenceName),
				),
			),
		)
	}
	return strings.TrimSpace(column.DefaultValue)
}

func formatPostgresSnapshotColumnDefinition(column *models.ColumnDef) string {
	parts := []string{
		quotePostgresIdentifier(column.Name),
		strings.TrimSpace(column.FullDataType),
	}
	if strings.EqualFold(column.GenerationKind, "identity") {
		generation := strings.ToUpper(strings.TrimSpace(column.IdentityGeneration))
		if generation == "" {
			generation = "BY DEFAULT"
		}
		parts = append(parts, fmt.Sprintf("GENERATED %s AS IDENTITY", generation))
	}
	if column.IsNullable {
		parts = append(parts, "NULL")
	} else {
		parts = append(parts, "NOT NULL")
	}
	if defaultValue := formatPostgresSnapshotDefault(column); defaultValue != "" {
		parts = append(parts, "DEFAULT "+defaultValue)
	}
	return strings.Join(parts, " ")
}

// FetchSchemaTableNames returns the names of all tables in a schema.
func (d *PostgresDriver) FetchSchemaTableNames(ctx context.Context, db *sql.DB, schema string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = $1 AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`, schema)
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
func (d *PostgresDriver) FetchTableDDL(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	columns, err := d.FetchTableColumns(ctx, db, schema, table)
	if err != nil {
		return "", err
	}

	var cols []string
	var pkCols []string
	for _, column := range columns {
		cols = append(cols, formatPostgresSnapshotColumnDefinition(column))
		if column.IsPrimaryKey {
			pkCols = append(pkCols, quotePostgresIdentifier(column.Name))
		}
	}

	ddl := "CREATE TABLE " + quotePostgresIdentifier(schema) + "." + quotePostgresIdentifier(table) + " (\n"
	ddl += strings.Join(cols, ",\n")
	if len(pkCols) > 0 {
		ddl += ",\n  PRIMARY KEY (" + strings.Join(pkCols, ", ") + ")"
	}
	ddl += "\n);"

	return ddl, nil
}

// FetchSchemaIndexes returns the DDL for all secondary indexes in a schema.
func (d *PostgresDriver) FetchSchemaIndexes(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaIndexSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT 
			c.relname as index_name,
			t.relname as table_name,
			pg_get_indexdef(i.indexrelid) as index_def
		FROM pg_index i
		JOIN pg_class c ON c.oid = i.indexrelid
		JOIN pg_class t ON t.oid = i.indrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE n.nspname = $1 AND i.indisprimary = false
		ORDER BY t.relname, c.relname
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []models.SchemaIndexSnapshot
	for rows.Next() {
		var name, table, ddl string
		if err := rows.Scan(&name, &table, &ddl); err != nil {
			return nil, err
		}
		indexes = append(indexes, models.SchemaIndexSnapshot{
			Name:      name,
			TableName: table,
			DDL:       ddl + ";",
		})
	}
	return indexes, nil
}

// FetchSchemaConstraints returns the DDL for constraints (Foreign Keys, Unique, Check).
func (d *PostgresDriver) FetchSchemaConstraints(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaConstraintSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT 
			c.conname,
			t.relname,
			c.contype,
			pg_get_constraintdef(c.oid)
		FROM pg_constraint c
		JOIN pg_class t ON t.oid = c.conrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE n.nspname = $1 AND c.contype IN ('f', 'u', 'c')
		ORDER BY t.relname, c.conname
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var constraints []models.SchemaConstraintSnapshot
	for rows.Next() {
		var name, table, contype, ddl string
		if err := rows.Scan(&name, &table, &contype, &ddl); err != nil {
			return nil, err
		}
		// contype: f=foreign key, c=check, u=unique
		typeStr := "UNKNOWN"
		switch contype {
		case "f":
			typeStr = "FOREIGN KEY"
		case "c":
			typeStr = "CHECK"
		case "u":
			typeStr = "UNIQUE"
		}

		constraints = append(constraints, models.SchemaConstraintSnapshot{
			Name:      name,
			TableName: table,
			Type:      typeStr,
			DDL:       fmt.Sprintf("ALTER TABLE %s.%s ADD CONSTRAINT %s %s;", schema, table, name, ddl),
		})
	}
	return constraints, nil
}

// FetchSchemaViews returns the DDL for all views in a schema.
func (d *PostgresDriver) FetchSchemaViews(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaViewSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT viewname, definition 
		FROM pg_views 
		WHERE schemaname = $1
		ORDER BY viewname
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var views []models.SchemaViewSnapshot
	for rows.Next() {
		var name, ddl string
		if err := rows.Scan(&name, &ddl); err != nil {
			return nil, err
		}
		views = append(views, models.SchemaViewSnapshot{
			Name: name,
			DDL:  fmt.Sprintf("CREATE OR REPLACE VIEW %s.%s AS\n%s", schema, name, strings.TrimSpace(ddl)),
		})
	}
	return views, nil
}

// FetchSchemaRoutines returns the DDL for all stored procedures and functions in a schema.
func (d *PostgresDriver) FetchSchemaRoutines(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaRoutineSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT 
			p.proname,
			pg_get_function_identity_arguments(p.oid) as signature,
			pg_get_functiondef(p.oid) as def
		FROM pg_proc p
		JOIN pg_namespace n ON p.pronamespace = n.oid
		WHERE n.nspname = $1
		ORDER BY p.proname, signature
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routines []models.SchemaRoutineSnapshot
	for rows.Next() {
		var name, signature, ddl string
		if err := rows.Scan(&name, &signature, &ddl); err != nil {
			return nil, err
		}
		routines = append(routines, models.SchemaRoutineSnapshot{
			Name:      name,
			Signature: fmt.Sprintf("%s(%s)", name, signature),
			DDL:       strings.TrimSpace(ddl) + ";",
		})
	}
	return routines, nil
}
