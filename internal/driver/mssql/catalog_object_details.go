// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// CatalogObjectDetails returns the DDL/metadata for one named catalog object.
func (d *MSSQLDriver) CatalogObjectDetails(ctx context.Context, db *sql.DB, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error) {
	switch objectKind {
	case "indexes":
		return mssqlIndexCatalogDetails(ctx, db, schema, name)
	case "functions", "procedures":
		return mssqlRoutineCatalogDetails(ctx, db, schema, objectKind, name)
	case "sequences":
		return mssqlSequenceCatalogDetails(ctx, db, schema, name)
	case "data_types":
		return mssqlDataTypeCatalogDetails(ctx, db, schema, name)
	case "aggregate_functions":
		return mssqlAggregateCatalogDetails(ctx, db, schema, name)
	default:
		return models.CatalogObjectDetails{
			ObjectKind:         objectKind,
			Name:               name,
			Schema:             schema,
			UnsupportedMessage: "No catalog viewer is implemented for this object type yet.",
		}, nil
	}
}

func mssqlIndexCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, indexName string,
) (models.CatalogObjectDetails, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			i.name,
			t.name,
			i.is_unique,
			i.is_primary_key,
			c.name,
			ic.key_ordinal
		FROM sys.indexes i
		JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1 AND i.name = @p2
		ORDER BY ic.key_ordinal
	`, schema, indexName)
	if err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: fetch index details: %w", err)
	}
	defer rows.Close()

	var (
		tableName  string
		columns    []string
		unique     bool
		primaryKey bool
		found      bool
	)
	for rows.Next() {
		var idxName, colName string
		var isUnique, isPrimaryKey bool
		var ordinal int
		if err := rows.Scan(&idxName, &tableName, &isUnique, &isPrimaryKey, &colName, &ordinal); err != nil {
			return models.CatalogObjectDetails{}, fmt.Errorf("mssql: scan index details: %w", err)
		}
		_ = idxName
		_ = ordinal
		columns = append(columns, colName)
		unique = isUnique
		primaryKey = isPrimaryKey
		found = true
	}
	if err := rows.Err(); err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: index rows error: %w", err)
	}

	if !found {
		return models.CatalogObjectDetails{
			ObjectKind:         "indexes",
			Name:               indexName,
			Schema:             schema,
			UnsupportedMessage: "Index details were not found for this schema.",
		}, nil
	}

	ddl := ""
	if primaryKey {
		ddl = fmt.Sprintf(
			"ALTER TABLE [%s].[%s] ADD CONSTRAINT [%s] PRIMARY KEY (%s);",
			schema, tableName, indexName, quoteBracketList(columns),
		)
	} else {
		uniqueStr := ""
		if unique {
			uniqueStr = "UNIQUE "
		}
		ddl = fmt.Sprintf(
			"CREATE %sINDEX [%s] ON [%s].[%s] (%s);",
			uniqueStr, indexName, schema, tableName, quoteBracketList(columns),
		)
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

func mssqlRoutineCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, objectKind, name string,
) (models.CatalogObjectDetails, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT o.name, o.type, m.definition
		FROM sys.objects o
		LEFT JOIN sys.sql_modules m ON o.object_id = m.object_id
		JOIN sys.schemas s ON o.schema_id = s.schema_id
		WHERE s.name = @p1 AND o.name = @p2 AND o.type IN ('P','PC','FN','IF','TF')
		ORDER BY o.name
	`, schema, name)
	if err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: fetch routine details: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var objName, objType string
		var definition sql.NullString
		if err := rows.Scan(&objName, &objType, &definition); err != nil {
			return models.CatalogObjectDetails{}, fmt.Errorf("mssql: scan routine details: %w", err)
		}
		ddl := strings.TrimSpace(definition.String)
		if ddl == "" {
			ddl = fmt.Sprintf("CREATE %s [%s].[%s] AS /* Definition not available or encrypted */;", routineKeyword(objType), schema, objName)
		} else if !strings.HasSuffix(ddl, ";") {
			ddl += ";"
		}
		return models.CatalogObjectDetails{
			ObjectKind: objectKind,
			Name:       objName,
			Schema:     schema,
			Signature:  fmt.Sprintf("%s.%s", schema, objName),
			DDL:        ddl,
		}, nil
	}
	if err := rows.Err(); err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: routine rows error: %w", err)
	}

	return models.CatalogObjectDetails{
		ObjectKind:         objectKind,
		Name:               name,
		Schema:             schema,
		UnsupportedMessage: "Routine definition was not found for this schema.",
	}, nil
}

func mssqlSequenceCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, name string,
) (models.CatalogObjectDetails, error) {
	row := db.QueryRowContext(ctx, `
		SELECT sequence_name
		FROM information_schema.sequences
		WHERE sequence_schema = @p1 AND sequence_name = @p2
	`, schema, name)
	var sequenceName string
	if err := row.Scan(&sequenceName); err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         "sequences",
				Name:               name,
				Schema:             schema,
				UnsupportedMessage: "Sequence details were not found for this schema.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: fetch sequence details: %w", err)
	}
	return models.CatalogObjectDetails{
		ObjectKind:         "sequences",
		Name:               sequenceName,
		Schema:             schema,
		UnsupportedMessage: "Sequence metadata viewer is not yet implemented for MSSQL.",
	}, nil
}

func mssqlDataTypeCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, name string,
) (models.CatalogObjectDetails, error) {
	row := db.QueryRowContext(ctx, `
		SELECT t.name
		FROM sys.types t
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1 AND t.name = @p2 AND t.is_user_defined = 1
	`, schema, name)
	var typeName string
	if err := row.Scan(&typeName); err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         "data_types",
				Name:               name,
				Schema:             schema,
				UnsupportedMessage: "User-defined type not found for this schema.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: fetch data type details: %w", err)
	}
	return models.CatalogObjectDetails{
		ObjectKind:         "data_types",
		Name:               typeName,
		Schema:             schema,
		UnsupportedMessage: "Data type metadata viewer is not yet implemented for MSSQL.",
	}, nil
}

func mssqlAggregateCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, name string,
) (models.CatalogObjectDetails, error) {
	row := db.QueryRowContext(ctx, `
		SELECT o.name
		FROM sys.objects o
		JOIN sys.schemas s ON o.schema_id = s.schema_id
		WHERE s.name = @p1 AND o.name = @p2 AND o.type = 'AF'
	`, schema, name)
	var aggregateName string
	if err := row.Scan(&aggregateName); err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         "aggregate_functions",
				Name:               name,
				Schema:             schema,
				UnsupportedMessage: "Aggregate function was not found for this schema.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("mssql: fetch aggregate details: %w", err)
	}
	return models.CatalogObjectDetails{
		ObjectKind:         "aggregate_functions",
		Name:               aggregateName,
		Schema:             schema,
		UnsupportedMessage: "Aggregate function metadata viewer is not yet implemented for MSSQL.",
	}, nil
}

func quoteBracketList(items []string) string {
	quoted := make([]string, len(items))
	for i, item := range items {
		quoted[i] = fmt.Sprintf("[%s]", strings.ReplaceAll(item, "]", "]]"))
	}
	return strings.Join(quoted, ", ")
}

func routineKeyword(objType string) string {
	switch strings.ToUpper(strings.TrimSpace(objType)) {
	case "P", "PC":
		return "PROCEDURE"
	default:
		return "FUNCTION"
	}
}
