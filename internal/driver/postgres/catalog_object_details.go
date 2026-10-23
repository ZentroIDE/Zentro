// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// CatalogObjectDetails returns the DDL/metadata for one named catalog object.
func (d *PostgresDriver) CatalogObjectDetails(ctx context.Context, db *sql.DB, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error) {
	switch objectKind {
	case "indexes":
		return postgresIndexCatalogDetails(ctx, db, schema, name)
	case "functions", "procedures", "aggregate_functions":
		return postgresRoutineCatalogDetails(ctx, db, schema, objectKind, name)
	case "sequences":
		return postgresSequenceCatalogDetails(ctx, db, schema, name)
	case "data_types":
		return postgresDataTypeCatalogDetails(ctx, db, schema, name)
	default:
		return models.CatalogObjectDetails{
			ObjectKind:         objectKind,
			Name:               name,
			Schema:             schema,
			UnsupportedMessage: "No catalog viewer is implemented for this object type yet.",
		}, nil
	}
}

func postgresIndexCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, indexName string,
) (models.CatalogObjectDetails, error) {
	var (
		tableName  string
		unique     bool
		primaryKey bool
		ddl        string
	)

	err := db.QueryRowContext(ctx, `
		SELECT
			c.relname AS tablename,
			i.indisunique AS unique,
			i.indisprimary AS primarykey,
			pg_get_indexdef(i.indexrelid) AS ddl
		FROM pg_index i
		JOIN pg_class c ON c.oid = i.indrelid
		JOIN pg_class idx ON idx.oid = i.indexrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND idx.relname = $2
	`, schema, indexName).Scan(&tableName, &unique, &primaryKey, &ddl)
	if err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         "indexes",
				Name:               indexName,
				Schema:             schema,
				UnsupportedMessage: "Index details were not found for this schema.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch index details: %w", err)
	}

	// Fetch columns in order
	rows, err := db.QueryContext(ctx, `
		SELECT
			a.attname
		FROM pg_class idx
		JOIN pg_index i ON i.indexrelid = idx.oid
		JOIN pg_attribute a ON a.attrelid = i.indrelid
		JOIN pg_namespace n ON n.oid = idx.relnamespace
		CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
		WHERE n.nspname = $1 AND idx.relname = $2 AND a.attnum = k.attnum
		ORDER BY k.ord
	`, schema, indexName)
	if err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch index columns: %w", err)
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var colName string
		if err := rows.Scan(&colName); err == nil {
			columns = append(columns, colName)
		}
	}

	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
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

func postgresRoutineCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, objectKind, name string,
) (models.CatalogObjectDetails, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			pg_get_functiondef(p.oid) AS ddl,
			pg_get_function_arguments(p.oid) AS signature
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = $1 AND p.proname = $2
	`, schema, name)
	if err != nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch routine: %w", err)
	}
	defer rows.Close()

	var ddls []string
	var signatures []string
	for rows.Next() {
		var ddlVal, sigVal string
		if err := rows.Scan(&ddlVal, &sigVal); err == nil {
			ddls = append(ddls, ddlVal)
			signatures = append(signatures, sigVal)
		}
	}

	if len(ddls) == 0 {
		return models.CatalogObjectDetails{
			ObjectKind:         objectKind,
			Name:               name,
			Schema:             schema,
			UnsupportedMessage: "Routine definition was not found for this schema.",
		}, nil
	}

	return models.CatalogObjectDetails{
		ObjectKind: objectKind,
		Name:       name,
		Schema:     schema,
		DDL:        strings.Join(ddls, "\n\n"),
		Signature:  fmt.Sprintf("%s.%s(%s)", schema, name, strings.Join(signatures, " | ")),
	}, nil
}

func postgresSequenceCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, name string,
) (models.CatalogObjectDetails, error) {
	var startVal, increment, maxVal, minVal string
	var cycleOpt string
	err := db.QueryRowContext(ctx, `
		SELECT start_value, increment_by, maximum_value, minimum_value, cycle_option
		FROM information_schema.sequences
		WHERE sequence_schema = $1 AND sequence_name = $2
	`, schema, name).Scan(&startVal, &increment, &maxVal, &minVal, &cycleOpt)
	if err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         "sequences",
				Name:               name,
				Schema:             schema,
				UnsupportedMessage: "Sequence details were not found for this schema.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch sequence details: %w", err)
	}

	ddl := fmt.Sprintf("CREATE SEQUENCE %s.%s\n  START WITH %s\n  INCREMENT BY %s\n  MINVALUE %s\n  MAXVALUE %s", schema, name, startVal, increment, minVal, maxVal)
	if cycleOpt == "YES" {
		ddl += "\n  CYCLE"
	} else {
		ddl += "\n  NO CYCLE"
	}
	ddl += ";"

	return models.CatalogObjectDetails{
		ObjectKind: "sequences",
		Name:       name,
		Schema:     schema,
		DDL:        ddl,
	}, nil
}

func postgresDataTypeCatalogDetails(
	ctx context.Context,
	db *sql.DB,
	schema, typeName string,
) (models.CatalogObjectDetails, error) {
	var oid int
	var typtype string
	err := db.QueryRowContext(ctx, `
		SELECT t.oid, t.typtype
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = $1 AND t.typname = $2
	`, schema, typeName).Scan(&oid, &typtype)
	if err != nil {
		if err == sql.ErrNoRows {
			return models.CatalogObjectDetails{
				ObjectKind:         "data_types",
				Name:               typeName,
				Schema:             schema,
				UnsupportedMessage: "Data type was not found for this schema.",
			}, nil
		}
		return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch type details: %w", err)
	}

	ddl := ""
	switch typtype {
	case "e": // enum
		rows, err := db.QueryContext(ctx, "SELECT enumlabel FROM pg_enum WHERE enumtypid = $1 ORDER BY enumsortorder", oid)
		if err != nil {
			return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch enum labels: %w", err)
		}
		defer rows.Close()
		var labels []string
		for rows.Next() {
			var label string
			if rows.Scan(&label) == nil {
				labels = append(labels, fmt.Sprintf("'%s'", strings.ReplaceAll(label, "'", "''")))
			}
		}
		ddl = fmt.Sprintf("CREATE TYPE %s.%s AS ENUM (\n  %s\n);", schema, typeName, strings.Join(labels, ",\n  "))
	case "c": // composite
		rows, err := db.QueryContext(ctx, `
			SELECT a.attname, format_type(a.atttypid, a.atttypmod)
			FROM pg_attribute a
			WHERE a.attrelid = (SELECT typrelid FROM pg_type WHERE oid = $1)
			  AND a.attnum > 0 AND NOT a.attisdropped
			ORDER BY a.attnum
		`, oid)
		if err != nil {
			return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch composite attributes: %w", err)
		}
		defer rows.Close()
		var attrs []string
		for rows.Next() {
			var name, typeStr string
			if rows.Scan(&name, &typeStr) == nil {
				attrs = append(attrs, fmt.Sprintf("  %s %s", name, typeStr))
			}
		}
		ddl = fmt.Sprintf("CREATE TYPE %s.%s AS (\n%s\n);", schema, typeName, strings.Join(attrs, ",\n"))
	case "d": // domain
		var baseType string
		var typnotnull bool
		var typdefault sql.NullString
		err := db.QueryRowContext(ctx, `
			SELECT format_type(typbasetype, typtypmod), typnotnull, typdefault
			FROM pg_type
			WHERE oid = $1
		`, oid).Scan(&baseType, &typnotnull, &typdefault)
		if err != nil {
			return models.CatalogObjectDetails{}, fmt.Errorf("postgres: fetch domain details: %w", err)
		}
		notNullStr := ""
		if typnotnull {
			notNullStr = " NOT NULL"
		}
		defaultStr := ""
		if typdefault.Valid {
			defaultStr = " DEFAULT " + typdefault.String
		}
		ddl = fmt.Sprintf("CREATE DOMAIN %s.%s AS %s%s%s;", schema, typeName, baseType, notNullStr, defaultStr)
	default:
		return models.CatalogObjectDetails{
			ObjectKind:         "data_types",
			Name:               typeName,
			Schema:             schema,
			UnsupportedMessage: fmt.Sprintf("Data type viewer is not implemented for type category '%s'.", typtype),
		}, nil
	}

	return models.CatalogObjectDetails{
		ObjectKind: "data_types",
		Name:       typeName,
		Schema:     schema,
		DDL:        ddl,
	}, nil
}
