// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"zentro/internal/models"
)

// isFatalSchemaErr reports whether err means the underlying connection or
// context is dead, so continuing to query further schemas would just repeat
// the same failure. *sql.DB returns an unexported "sql: database is closed"
// sentinel once Close has been called, hence the string match.
func isFatalSchemaErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, sql.ErrConnDone) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	return strings.Contains(err.Error(), "database is closed")
}

// FetchDatabases lists user databases and fetches schemas for currentDB.
func (d *MSSQLDriver) FetchDatabases(ctx context.Context, db *sql.DB, currentDB string, showAllSchemas bool, logger *slog.Logger) ([]*models.DatabaseInfo, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT name FROM sys.databases
		WHERE database_id > 4
		ORDER BY name
	`)
	if err != nil {
		return nil, fmt.Errorf("mssql: list databases: %w", err)
	}
	defer rows.Close()

	var dbInfos []*models.DatabaseInfo
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("mssql: scan database name: %w", err)
		}
		dbInfos = append(dbInfos, &models.DatabaseInfo{Name: name})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mssql: database rows error: %w", err)
	}
	logger.Info("mssql database list", "count", len(dbInfos))

	for _, info := range dbInfos {
		if info.Name == currentDB {
			schemas, err := d.FetchSchema(ctx, db, showAllSchemas, logger)
			if err == nil {
				info.Schemas = schemas
			}
			break
		}
	}
	return dbInfos, nil
}

// FetchSchema returns all non-system schemas with their supported object categories.
func (d *MSSQLDriver) FetchSchema(ctx context.Context, db *sql.DB, showAllSchemas bool, logger *slog.Logger) ([]*models.SchemaNode, error) {
	query := `
		SELECT s.name
		FROM sys.schemas s
	`
	if !showAllSchemas {
		query += `
		WHERE s.name NOT IN (
			'sys','INFORMATION_SCHEMA','guest',
			'db_owner','db_accessadmin','db_securityadmin',
			'db_ddladmin','db_backupoperator',
			'db_datareader','db_datawriter',
			'db_denydatareader','db_denydatawriter'
		)
	`
	}
	query += "\nORDER BY s.name"

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("mssql: list schema: %w", err)
	}
	defer rows.Close()

	var schemaNames []string
	for rows.Next() {
		var schemaName string
		if err := rows.Scan(&schemaName); err != nil {
			return nil, fmt.Errorf("mssql: scan schema: %w", err)
		}
		schemaNames = append(schemaNames, schemaName)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mssql: schema rows error: %w", err)
	}

	nodes := make([]*models.SchemaNode, 0, len(schemaNames))
	for _, schemaName := range schemaNames {
		node := models.NewSchemaNode(schemaName)
		fatal := d.populateSchema(ctx, db, schemaName, node, logger)
		nodes = append(nodes, node)
		if fatal {
			return nodes, fmt.Errorf("mssql: aborted schema fetch after %q: connection closed", schemaName)
		}
	}
	return nodes, nil
}

// populateSchema fills node with the objects for one schema. It returns true
// when a query failed for a reason that will keep failing for every
// remaining schema (closed connection, cancelled context), signaling the
// caller to stop iterating instead of repeating the same failure per schema.
func (d *MSSQLDriver) populateSchema(
	ctx context.Context,
	db *sql.DB,
	schema string,
	node *models.SchemaNode,
	logger *slog.Logger,
) bool {
	fatal := false
	appendNames := func(query string, target *[]string, operation string, args ...any) {
		if fatal {
			return
		}
		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			logger.Warn("mssql: schema query failed", "schema", schema, "operation", operation, "err", err)
			if isFatalSchemaErr(err) {
				fatal = true
			}
			return
		}
		defer rows.Close()

		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				logger.Warn("mssql: schema row scan failed", "schema", schema, "operation", operation, "err", err)
				return
			}
			*target = append(*target, name)
		}
		if err := rows.Err(); err != nil {
			logger.Warn("mssql: schema rows error", "schema", schema, "operation", operation, "err", err)
		}
	}

	appendNames(`
		SELECT t.name
		FROM sys.tables t
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1
		ORDER BY t.name
	`, &node.Tables, "tables", schema)

	appendNames(`
		SELECT v.name
		FROM sys.views v
		JOIN sys.schemas s ON v.schema_id = s.schema_id
		WHERE s.name = @p1
		ORDER BY v.name
	`, &node.Views, "views", schema)

	appendNames(`
		SELECT DISTINCT i.name
		FROM sys.indexes i
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1
		  AND i.name IS NOT NULL
		  AND i.is_hypothetical = 0
		ORDER BY i.name
	`, &node.Indexes, "indexes", schema)

	appendNames(`
		SELECT o.name
		FROM sys.objects o
		JOIN sys.schemas s ON o.schema_id = s.schema_id
		WHERE s.name = @p1
		  AND o.type IN ('FN', 'IF', 'TF', 'FS', 'FT')
		ORDER BY o.name
	`, &node.Functions, "functions", schema)

	appendNames(`
		SELECT o.name
		FROM sys.objects o
		JOIN sys.schemas s ON o.schema_id = s.schema_id
		WHERE s.name = @p1
		  AND o.type IN ('P', 'PC', 'X')
		ORDER BY o.name
	`, &node.Procedures, "procedures", schema)

	appendNames(`
		SELECT t.name
		FROM sys.types t
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1
		  AND t.is_user_defined = 1
		ORDER BY t.name
	`, &node.DataTypes, "data_types", schema)

	logger.Info("mssql schema populated",
		"schema", schema,
		"tables", len(node.Tables),
		"views", len(node.Views),
		"indexes", len(node.Indexes),
		"functions", len(node.Functions),
		"procedures", len(node.Procedures),
		"data_types", len(node.DataTypes),
	)
	return fatal
}

// FetchTablePrimaryKeys returns the primary key columns for a given table.
func (d *MSSQLDriver) FetchTablePrimaryKeys(ctx context.Context, db *sql.DB, schema, table string) ([]string, error) {
	query := `
		SELECT c.name
		FROM sys.indexes i
		JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE i.is_primary_key = 1
		  AND t.name = @p1
		  AND s.name = @p2
	`
	rows, err := db.QueryContext(ctx, query, table, schema)
	if err != nil {
		return nil, fmt.Errorf("mssql: fetch primary keys: %w", err)
	}
	defer rows.Close()

	var pks []string
	for rows.Next() {
		var pk string
		if err := rows.Scan(&pk); err != nil {
			return nil, fmt.Errorf("mssql: scan primary key: %w", err)
		}
		pks = append(pks, pk)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("mssql: primary key rows error: %w", err)
	}
	return pks, nil
}
