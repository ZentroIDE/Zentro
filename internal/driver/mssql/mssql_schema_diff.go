// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// FetchSchemaTableNames returns the names of all tables in a schema.
func (d *MSSQLDriver) FetchSchemaTableNames(ctx context.Context, db *sql.DB, schema string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT t.name 
		FROM sys.tables t
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1
		ORDER BY t.name
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tables, nil
}

// FetchTableDDL returns the raw DDL statement to recreate a table and its columns/primary key.
func (d *MSSQLDriver) FetchTableDDL(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
		FROM information_schema.columns
		WHERE table_schema = @p1 AND table_name = @p2
		ORDER BY ordinal_position
	`, schema, table)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var colName, dataType, nullable *string
		var defaultVal *string
		var charLen, numPrec, numScale *int64
		if err := rows.Scan(&colName, &dataType, &nullable, &defaultVal, &charLen, &numPrec, &numScale); err != nil {
			return "", err
		}
		col := *colName + " " + *dataType
		if charLen != nil {
			if *charLen == -1 {
				col += "(max)"
			} else {
				col += fmt.Sprintf("(%d)", *charLen)
			}
		}
		if nullable != nil && *nullable == "NO" {
			col += " NOT NULL"
		}
		if defaultVal != nil && *defaultVal != "" {
			col += " DEFAULT " + *defaultVal
		}
		cols = append(cols, col)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}

	pkCols, err := d.FetchTablePrimaryKeys(ctx, db, schema, table)
	if err != nil {
		return "", err
	}

	ddl := "CREATE TABLE " + schema + "." + table + " (\n"
	ddl += "  " + strings.Join(cols, ",\n  ")
	if len(pkCols) > 0 {
		ddl += ",\n  PRIMARY KEY (" + strings.Join(pkCols, ", ") + ")"
	}
	ddl += "\n);"

	return ddl, nil
}

// FetchSchemaIndexes returns the DDL for all secondary indexes in a schema.
func (d *MSSQLDriver) FetchSchemaIndexes(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaIndexSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT 
			i.name AS index_name,
			t.name AS table_name,
			i.is_unique,
			c.name AS column_name
		FROM sys.indexes i
		JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1 AND i.is_primary_key = 0 AND i.name IS NOT NULL
		ORDER BY t.name, i.name, ic.key_ordinal
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type colInfo struct {
		columnName string
	}
	type idxKey struct {
		tableName string
		indexName string
		isUnique  bool
	}
	idxMap := make(map[idxKey][]colInfo)
	var keys []idxKey

	for rows.Next() {
		var indexName, tableName, columnName string
		var isUnique bool
		if err := rows.Scan(&indexName, &tableName, &isUnique, &columnName); err != nil {
			return nil, err
		}
		k := idxKey{tableName: tableName, indexName: indexName, isUnique: isUnique}
		if _, exists := idxMap[k]; !exists {
			keys = append(keys, k)
		}
		idxMap[k] = append(idxMap[k], colInfo{columnName: columnName})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var indexes []models.SchemaIndexSnapshot
	for _, k := range keys {
		cols := idxMap[k]
		quotedCols := make([]string, len(cols))
		for i, c := range cols {
			quotedCols[i] = fmt.Sprintf("[%s]", c.columnName)
		}
		unique := ""
		if k.isUnique {
			unique = "UNIQUE "
		}
		ddl := fmt.Sprintf("CREATE %sINDEX [%s] ON [%s].[%s] (%s);", unique, k.indexName, schema, k.tableName, strings.Join(quotedCols, ", "))
		indexes = append(indexes, models.SchemaIndexSnapshot{
			Name:      k.indexName,
			TableName: k.tableName,
			DDL:       ddl,
		})
	}

	return indexes, nil
}

// FetchSchemaConstraints returns the DDL for constraints (Foreign Keys, Unique, Check).
func (d *MSSQLDriver) FetchSchemaConstraints(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaConstraintSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT 
			fk.name AS fk_name,
			parent_t.name AS parent_table,
			parent_c.name AS parent_column,
			ref_t.name AS ref_table,
			ref_c.name AS ref_column
		FROM sys.foreign_keys fk
		JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
		JOIN sys.tables parent_t ON fkc.parent_object_id = parent_t.object_id
		JOIN sys.columns parent_c ON fkc.parent_object_id = parent_c.object_id AND fkc.parent_column_id = parent_c.column_id
		JOIN sys.tables ref_t ON fkc.referenced_object_id = ref_t.object_id
		JOIN sys.columns ref_c ON fkc.referenced_object_id = ref_c.object_id AND fkc.referenced_column_id = ref_c.column_id
		JOIN sys.schemas s ON parent_t.schema_id = s.schema_id
		WHERE s.name = @p1
		ORDER BY parent_t.name, fk.name, fkc.constraint_column_id
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type fkCol struct {
		parentCol string
		refCol    string
	}
	type fkKey struct {
		parentTable string
		fkName      string
		refTable    string
	}
	fkMap := make(map[fkKey][]fkCol)
	var keys []fkKey

	for rows.Next() {
		var fkName, parentTable, parentColumn, refTable, refColumn string
		if err := rows.Scan(&fkName, &parentTable, &parentColumn, &refTable, &refColumn); err != nil {
			return nil, err
		}
		k := fkKey{parentTable: parentTable, fkName: fkName, refTable: refTable}
		if _, exists := fkMap[k]; !exists {
			keys = append(keys, k)
		}
		fkMap[k] = append(fkMap[k], fkCol{parentCol: parentColumn, refCol: refColumn})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var constraints []models.SchemaConstraintSnapshot
	for _, k := range keys {
		cols := fkMap[k]
		srcCols := make([]string, len(cols))
		targetCols := make([]string, len(cols))
		for i, c := range cols {
			srcCols[i] = fmt.Sprintf("[%s]", c.parentCol)
			targetCols[i] = fmt.Sprintf("[%s]", c.refCol)
		}
		ddl := fmt.Sprintf(
			"ALTER TABLE [%s].[%s] ADD CONSTRAINT [%s] FOREIGN KEY (%s) REFERENCES [%s].[%s] (%s);",
			schema, k.parentTable, k.fkName, strings.Join(srcCols, ", "), schema, k.refTable, strings.Join(targetCols, ", "),
		)
		constraints = append(constraints, models.SchemaConstraintSnapshot{
			Name:      k.fkName,
			TableName: k.parentTable,
			Type:      "FOREIGN KEY",
			DDL:       ddl,
		})
	}

	return constraints, nil
}

// FetchSchemaViews returns the DDL for all views in a schema.
func (d *MSSQLDriver) FetchSchemaViews(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaViewSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT v.name, m.definition
		FROM sys.views v
		LEFT JOIN sys.sql_modules m ON v.object_id = m.object_id
		JOIN sys.schemas s ON v.schema_id = s.schema_id
		WHERE s.name = @p1
		ORDER BY v.name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var views []models.SchemaViewSnapshot
	for rows.Next() {
		var name string
		var definition sql.NullString
		if err := rows.Scan(&name, &definition); err != nil {
			return nil, err
		}
		ddl := ""
		if definition.Valid {
			ddl = strings.TrimSpace(definition.String)
		}
		if ddl == "" {
			ddl = fmt.Sprintf("CREATE VIEW [%s].[%s] AS /* Definition not available or encrypted */;", schema, name)
		} else if !strings.HasSuffix(ddl, ";") {
			ddl += ";"
		}
		views = append(views, models.SchemaViewSnapshot{
			Name: name,
			DDL:  ddl,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return views, nil
}

// FetchSchemaRoutines returns the DDL for all stored procedures and functions in a schema.
func (d *MSSQLDriver) FetchSchemaRoutines(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaRoutineSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT o.name, m.definition, o.type
		FROM sys.objects o
		LEFT JOIN sys.sql_modules m ON o.object_id = m.object_id
		JOIN sys.schemas s ON o.schema_id = s.schema_id
		WHERE s.name = @p1 AND o.type IN ('P', 'FN', 'IF', 'TF')
		ORDER BY o.name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routines []models.SchemaRoutineSnapshot
	for rows.Next() {
		var name, objType string
		var definition sql.NullString
		if err := rows.Scan(&name, &definition, &objType); err != nil {
			return nil, err
		}
		ddl := ""
		if definition.Valid {
			ddl = strings.TrimSpace(definition.String)
		}
		if ddl == "" {
			keyword := "PROCEDURE"
			if strings.TrimSpace(objType) != "P" {
				keyword = "FUNCTION"
			}
			ddl = fmt.Sprintf("CREATE %s [%s].[%s] AS /* Definition not available or encrypted */;", keyword, schema, name)
		} else if !strings.HasSuffix(ddl, ";") {
			ddl += ";"
		}
		routines = append(routines, models.SchemaRoutineSnapshot{
			Name:      name,
			Signature: name,
			DDL:       ddl,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return routines, nil
}
