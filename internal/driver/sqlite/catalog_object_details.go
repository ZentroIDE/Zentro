// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// CatalogObjectDetails returns the DDL/metadata for one named catalog object.
func (d *SQLiteDriver) CatalogObjectDetails(ctx context.Context, db *sql.DB, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error) {
	var tblName, ddl sql.NullString
	sqlType := ""
	switch objectKind {
	case "indexes":
		sqlType = "index"
	case "views":
		sqlType = "view"
	case "triggers":
		sqlType = "trigger"
	default:
		return models.CatalogObjectDetails{
			ObjectKind:         objectKind,
			Name:               name,
			Schema:             schema,
			UnsupportedMessage: "No catalog viewer is implemented for this SQLite object type yet.",
		}, nil
	}

	err := db.QueryRowContext(ctx, `
		SELECT tbl_name, sql
		FROM sqlite_master
		WHERE type = $1 AND name = $2
	`, sqlType, name).Scan(&tblName, &ddl)
	if err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         objectKind,
				Name:               name,
				Schema:             schema,
				UnsupportedMessage: "Object details were not found in sqlite_master.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("sqlite: fetch details: %w", err)
	}

	ddlStr := ddl.String
	if ddlStr != "" && !strings.HasSuffix(ddlStr, ";") {
		ddlStr += ";"
	}

	return models.CatalogObjectDetails{
		ObjectKind: objectKind,
		Name:       name,
		Schema:     schema,
		TableName:  tblName.String,
		DDL:        ddlStr,
	}, nil
}
