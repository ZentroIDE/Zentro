// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// CatalogObjectDetails returns the DDL/metadata for one named catalog object.
func (d *MySQLDriver) CatalogObjectDetails(ctx context.Context, db *sql.DB, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error) {
	switch objectKind {
	case "indexes":
		return mysqlIndexCatalogDetails(ctx, db, schema, name)
	case "functions", "procedures":
		return mysqlRoutineCatalogDetails(ctx, db, schema, objectKind, name)
	default:
		return models.CatalogObjectDetails{
			ObjectKind:         objectKind,
			Name:               name,
			Schema:             schema,
			UnsupportedMessage: "No catalog viewer is implemented for this object type in MySQL yet.",
		}, nil
	}
}

func mysqlIndexCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, indexName string,
) (models.CatalogObjectDetails, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			TABLE_NAME,
			NON_UNIQUE,
			COLUMN_NAME
		FROM information_schema.statistics
		WHERE TABLE_SCHEMA = ? AND INDEX_NAME = ?
		ORDER BY SEQ_IN_INDEX
	`, schema, indexName)
	if err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("mysql: fetch index details: %w", err)
	}
	defer rows.Close()

	var (
		tableName string
		columns   []string
		unique    bool
		found     bool
	)
	for rows.Next() {
		var tbl, col string
		var nonUnique int
		if err := rows.Scan(&tbl, &nonUnique, &col); err == nil {
			tableName = tbl
			unique = (nonUnique == 0)
			columns = append(columns, col)
			found = true
		}
	}

	if !found {
		return models.CatalogObjectDetails{
			ObjectKind:         "indexes",
			Name:               indexName,
			Schema:             schema,
			UnsupportedMessage: "Index details were not found for this schema.",
		}, nil
	}

	primaryKey := (strings.ToUpper(indexName) == "PRIMARY")
	ddl := ""
	quotedCols := make([]string, len(columns))
	for i, c := range columns {
		quotedCols[i] = fmt.Sprintf("`%s`", c)
	}
	colsList := strings.Join(quotedCols, ", ")

	if primaryKey {
		ddl = fmt.Sprintf("ALTER TABLE `%s`.`%s` ADD PRIMARY KEY (%s);", schema, tableName, colsList)
	} else if unique {
		ddl = fmt.Sprintf("CREATE UNIQUE INDEX `%s` ON `%s`.`%s` (%s);", indexName, schema, tableName, colsList)
	} else {
		ddl = fmt.Sprintf("CREATE INDEX `%s` ON `%s`.`%s` (%s);", indexName, schema, tableName, colsList)
	}

	return models.CatalogObjectDetails{
		ObjectKind: "indexes",
		Name:       indexName,
		Schema:     schema,
		TableName:  tableName,
		DDL:        ddl,
		Columns:    columns,
		Unique:     unique,
		PrimaryKey: primaryKey,
	}, nil
}

func mysqlRoutineCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, objectKind, name string,
) (models.CatalogObjectDetails, error) {
	var (
		nameVal     sql.NullString
		sqlMode     sql.NullString
		ddl         sql.NullString
		charSet     sql.NullString
		collation   sql.NullString
		dbCollation sql.NullString
	)

	var query string
	if objectKind == "procedures" {
		query = fmt.Sprintf("SHOW CREATE PROCEDURE `%s`.`%s`", schema, name)
	} else {
		query = fmt.Sprintf("SHOW CREATE FUNCTION `%s`.`%s`", schema, name)
	}

	err := db.QueryRowContext(ctx, query).Scan(&nameVal, &sqlMode, &ddl, &charSet, &collation, &dbCollation)
	if err != nil {
		return models.CatalogObjectDetails{
			ObjectKind:         objectKind,
			Name:               name,
			Schema:             schema,
			UnsupportedMessage: "Routine definition was not found or access is denied.",
		}, nil
	}

	ddlStr := ddl.String
	if ddlStr != "" && !strings.HasSuffix(ddlStr, ";") {
		ddlStr += ";"
	}

	return models.CatalogObjectDetails{
		ObjectKind: objectKind,
		Name:       name,
		Schema:     schema,
		DDL:        ddlStr,
		Signature:  fmt.Sprintf("%s.%s", schema, name),
	}, nil
}
