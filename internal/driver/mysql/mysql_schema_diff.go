// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

func (d *MySQLDriver) resolveSchema(ctx context.Context, db *sql.DB, schema string) (string, error) {
	if schema != "" {
		return schema, nil
	}
	var currentDB string
	err := db.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&currentDB)
	if err != nil {
		return "", fmt.Errorf("resolve active database: %w", err)
	}
	return currentDB, nil
}

// FetchSchemaTableNames returns the names of all tables in a schema.
func (d *MySQLDriver) FetchSchemaTableNames(ctx context.Context, db *sql.DB, schema string) ([]string, error) {
	resolved, err := d.resolveSchema(ctx, db, schema)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = ? AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`, resolved)
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
func (d *MySQLDriver) FetchTableDDL(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	resolved, err := d.resolveSchema(ctx, db, schema)
	if err != nil {
		return "", err
	}

	var tbl, ddl string
	query := fmt.Sprintf("SHOW CREATE TABLE `%s`.`%s`", resolved, table)
	// Some MySQL versions/drivers might require no prefix or prefix
	err = db.QueryRowContext(ctx, query).Scan(&tbl, &ddl)
	if err != nil {
		// Try without schema prefix in case of single connection DB locking
		err = db.QueryRowContext(ctx, fmt.Sprintf("SHOW CREATE TABLE `%s`", table)).Scan(&tbl, &ddl)
		if err != nil {
			return "", err
		}
	}

	ddl = strings.TrimSpace(ddl)
	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
	}
	return ddl, nil
}

// FetchSchemaIndexes returns the DDL for all secondary indexes in a schema.
func (d *MySQLDriver) FetchSchemaIndexes(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaIndexSnapshot, error) {
	resolved, err := d.resolveSchema(ctx, db, schema)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		SELECT INDEX_NAME, TABLE_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
		FROM information_schema.statistics
		WHERE table_schema = ? AND INDEX_NAME != 'PRIMARY'
		ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
	`, resolved)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type colInfo struct {
		colName    string
		seqInIndex int
	}
	type idxKey struct {
		tableName string
		indexName string
		nonUnique int
	}
	idxMap := make(map[idxKey][]colInfo)
	var keys []idxKey

	for rows.Next() {
		var indexName, tableName, columnName string
		var nonUnique, seqInIndex int
		if err := rows.Scan(&indexName, &tableName, &columnName, &nonUnique, &seqInIndex); err == nil {
			k := idxKey{tableName: tableName, indexName: indexName, nonUnique: nonUnique}
			if _, exists := idxMap[k]; !exists {
				keys = append(keys, k)
			}
			idxMap[k] = append(idxMap[k], colInfo{colName: columnName, seqInIndex: seqInIndex})
		}
	}

	var indexes []models.SchemaIndexSnapshot
	for _, k := range keys {
		cols := idxMap[k]
		quotedCols := make([]string, len(cols))
		for i, c := range cols {
			quotedCols[i] = fmt.Sprintf("`%s`", c.colName)
		}
		unique := ""
		if k.nonUnique == 0 {
			unique = "UNIQUE "
		}
		ddl := fmt.Sprintf("CREATE %sINDEX `%s` ON `%s`.`%s` (%s);", unique, k.indexName, resolved, k.tableName, strings.Join(quotedCols, ", "))
		indexes = append(indexes, models.SchemaIndexSnapshot{
			Name:      k.indexName,
			TableName: k.tableName,
			DDL:       ddl,
		})
	}

	return indexes, nil
}

// FetchSchemaConstraints returns the DDL for constraints (Foreign Keys, Unique, Check).
func (d *MySQLDriver) FetchSchemaConstraints(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaConstraintSnapshot, error) {
	resolved, err := d.resolveSchema(ctx, db, schema)
	if err != nil {
		return nil, err
	}

	// 1. Fetch Foreign Keys
	fkRows, err := db.QueryContext(ctx, `
		SELECT 
			kcu.CONSTRAINT_NAME,
			kcu.TABLE_NAME,
			kcu.COLUMN_NAME,
			kcu.REFERENCED_TABLE_NAME,
			kcu.REFERENCED_COLUMN_NAME,
			rc.UPDATE_RULE,
			rc.DELETE_RULE
		FROM information_schema.KEY_COLUMN_USAGE kcu
		JOIN information_schema.REFERENTIAL_CONSTRAINTS rc 
		  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA 
		 AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
		WHERE kcu.CONSTRAINT_SCHEMA = ?
		ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
	`, resolved)
	if err != nil {
		return nil, err
	}
	defer fkRows.Close()

	type fkCol struct {
		colName    string
		refColName string
	}
	type fkKey struct {
		tableName  string
		constraint string
		refTable   string
		updateRule string
		deleteRule string
	}
	fkMap := make(map[fkKey][]fkCol)
	var fkKeys []fkKey

	for fkRows.Next() {
		var constraintName, tableName, columnName, refTable, refColumn, updateRule, deleteRule string
		if err := fkRows.Scan(&constraintName, &tableName, &columnName, &refTable, &refColumn, &updateRule, &deleteRule); err == nil {
			k := fkKey{
				tableName:  tableName,
				constraint: constraintName,
				refTable:   refTable,
				updateRule: updateRule,
				deleteRule: deleteRule,
			}
			if _, exists := fkMap[k]; !exists {
				fkKeys = append(fkKeys, k)
			}
			fkMap[k] = append(fkMap[k], fkCol{colName: columnName, refColName: refColumn})
		}
	}

	var constraints []models.SchemaConstraintSnapshot

	for _, k := range fkKeys {
		cols := fkMap[k]
		srcCols := make([]string, len(cols))
		targetCols := make([]string, len(cols))
		for i, c := range cols {
			srcCols[i] = fmt.Sprintf("`%s`", c.colName)
			targetCols[i] = fmt.Sprintf("`%s`", c.refColName)
		}
		ddl := fmt.Sprintf(
			"ALTER TABLE `%s`.`%s` ADD CONSTRAINT `%s` FOREIGN KEY (%s) REFERENCES `%s`.`%s` (%s) ON UPDATE %s ON DELETE %s;",
			resolved, k.tableName, k.constraint, strings.Join(srcCols, ", "), resolved, k.refTable, strings.Join(targetCols, ", "), k.updateRule, k.deleteRule,
		)
		constraints = append(constraints, models.SchemaConstraintSnapshot{
			Name:      k.constraint,
			TableName: k.tableName,
			Type:      "FOREIGN KEY",
			DDL:       ddl,
		})
	}

	// 2. Fetch Unique Constraints
	uqRows, err := db.QueryContext(ctx, `
		SELECT tc.CONSTRAINT_NAME, tc.TABLE_NAME, kcu.COLUMN_NAME
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu 
		  ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA 
		 AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
		WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'UNIQUE'
		ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
	`, resolved)
	if err == nil {
		type uqKey struct {
			tableName  string
			constraint string
		}
		uqMap := make(map[uqKey][]string)
		var uqKeys []uqKey

		for uqRows.Next() {
			var constraintName, tableName, columnName string
			if err := uqRows.Scan(&constraintName, &tableName, &columnName); err == nil {
				k := uqKey{tableName: tableName, constraint: constraintName}
				if _, exists := uqMap[k]; !exists {
					uqKeys = append(uqKeys, k)
				}
				uqMap[k] = append(uqMap[k], columnName)
			}
		}
		uqRows.Close()

		for _, k := range uqKeys {
			cols := uqMap[k]
			quotedCols := make([]string, len(cols))
			for i, c := range cols {
				quotedCols[i] = fmt.Sprintf("`%s`", c)
			}
			ddl := fmt.Sprintf(
				"ALTER TABLE `%s`.`%s` ADD CONSTRAINT `%s` UNIQUE (%s);",
				resolved, k.tableName, k.constraint, strings.Join(quotedCols, ", "),
			)
			constraints = append(constraints, models.SchemaConstraintSnapshot{
				Name:      k.constraint,
				TableName: k.tableName,
				Type:      "UNIQUE",
				DDL:       ddl,
			})
		}
	}

	return constraints, nil
}

// FetchSchemaViews returns the DDL for all views in a schema.
func (d *MySQLDriver) FetchSchemaViews(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaViewSnapshot, error) {
	resolved, err := d.resolveSchema(ctx, db, schema)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		SELECT table_name, view_definition 
		FROM information_schema.views 
		WHERE table_schema = ?
		ORDER BY table_name
	`, resolved)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var views []models.SchemaViewSnapshot
	for rows.Next() {
		var name, definition string
		if err := rows.Scan(&name, &definition); err != nil {
			return nil, err
		}
		ddl := fmt.Sprintf("CREATE OR REPLACE VIEW `%s`.`%s` AS\n%s;", resolved, name, strings.TrimSpace(definition))
		views = append(views, models.SchemaViewSnapshot{
			Name: name,
			DDL:  ddl,
		})
	}
	return views, nil
}

// FetchSchemaRoutines returns the DDL for all stored procedures and functions in a schema.
func (d *MySQLDriver) FetchSchemaRoutines(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaRoutineSnapshot, error) {
	resolved, err := d.resolveSchema(ctx, db, schema)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		SELECT routine_name, routine_type 
		FROM information_schema.routines 
		WHERE routine_schema = ?
		ORDER BY routine_name
	`, resolved)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routines []models.SchemaRoutineSnapshot
	for rows.Next() {
		var name, rType string
		if err := rows.Scan(&name, &rType); err == nil {
			var tbl, ddl string
			query := fmt.Sprintf("SHOW CREATE %s `%s`.`%s`", rType, resolved, name)
			err = db.QueryRowContext(ctx, query).Scan(&tbl, &ddl, &ddl) // MySQL SHOW CREATE PROCEDURE returns 3 cols (Procedure, sql_mode, Create Procedure)
			if err != nil {
				// Fallback to scan with 3 variables just in case
				var sqlMode, characterSet, collation string
				err = db.QueryRowContext(ctx, query).Scan(&tbl, &sqlMode, &ddl, &characterSet, &collation)
				if err != nil {
					continue // skip on error
				}
			}

			ddl = strings.TrimSpace(ddl)
			if !strings.HasSuffix(ddl, ";") {
				ddl += ";"
			}
			routines = append(routines, models.SchemaRoutineSnapshot{
				Name:      name,
				Signature: fmt.Sprintf("%s(%s)", name, strings.ToLower(rType)),
				DDL:       ddl,
			})
		}
	}
	return routines, nil
}
