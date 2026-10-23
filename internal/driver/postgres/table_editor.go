// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"zentro/internal/constant"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// normalizeSerialColumns canonicalizes serial/bigserial/smallserial columns
// into their underlying integer type plus an owned sequence, so
// BuildCreateTableStatements only ever has to handle "sequence-generated"
// as one case rather than three SERIAL spellings.
func normalizeSerialColumns(schema, table string, columns []models.ColumnDef) []models.ColumnDef {
	normalized := make([]models.ColumnDef, 0, len(columns))
	for _, column := range columns {
		next := column
		columnType := strings.ToLower(driver.FirstNonEmpty(column.FullDataType, column.DataType))
		switch columnType {
		case "serial":
			next.DataType = "integer"
			next.FullDataType = "integer"
		case "bigserial":
			next.DataType = "bigint"
			next.FullDataType = "bigint"
		case "smallserial":
			next.DataType = "smallint"
			next.FullDataType = "smallint"
		default:
			next.FullDataType = driver.FirstNonEmpty(column.FullDataType, column.DataType)
		}
		if columnType == "serial" || columnType == "bigserial" || columnType == "smallserial" {
			next.GenerationKind = "sequence"
			next.IdentityGeneration = ""
			next.SequenceSchema = schema
			next.SequenceName = table + "_" + column.Name + "_seq"
			next.DefaultValue = ""
		}
		normalized = append(normalized, next)
	}
	return normalized
}

// BuildCreateTableStatements builds the DDL statement(s) to create a table
// from a snapshot: owned sequences first, then the table, then ALTER
// SEQUENCE OWNED BY. Pure — no DB access.
func (d *PostgresDriver) BuildCreateTableStatements(schema string, table models.SchemaTableSnapshot) []string {
	qualifiedTable := fmt.Sprintf(`%s.%s`, d.QuoteIdentifier(schema), d.QuoteIdentifier(table.Name))

	sequenceLines := make([]string, 0)
	ownedByLines := make([]string, 0)
	seenSequences := make(map[string]struct{})
	columnDefs := make([]string, 0, len(table.Columns))
	pkColumns := make([]string, 0)

	for _, column := range table.Columns {
		columnDefs = append(columnDefs, "  "+d.formatColumnDefinition(column))
		if column.IsPrimaryKey {
			pkColumns = append(pkColumns, d.QuoteIdentifier(column.Name))
		}

		if !strings.EqualFold(column.GenerationKind, "sequence") {
			continue
		}
		if strings.TrimSpace(column.SequenceSchema) == "" || strings.TrimSpace(column.SequenceName) == "" {
			continue
		}

		sequenceKey := strings.TrimSpace(column.SequenceSchema) + "." + strings.TrimSpace(column.SequenceName)
		if _, exists := seenSequences[sequenceKey]; exists {
			continue
		}
		seenSequences[sequenceKey] = struct{}{}

		qualifiedSequence := fmt.Sprintf(
			`%s.%s`,
			d.QuoteIdentifier(strings.TrimSpace(column.SequenceSchema)),
			d.QuoteIdentifier(strings.TrimSpace(column.SequenceName)),
		)
		sequenceLines = append(sequenceLines, fmt.Sprintf("CREATE SEQUENCE %s;", qualifiedSequence))
		ownedByLines = append(
			ownedByLines,
			fmt.Sprintf(
				"ALTER SEQUENCE %s OWNED BY %s.%s;",
				qualifiedSequence,
				qualifiedTable,
				d.QuoteIdentifier(column.Name),
			),
		)
	}

	if len(pkColumns) > 0 {
		columnDefs = append(columnDefs, "  PRIMARY KEY ("+strings.Join(pkColumns, ", ")+")")
	}

	lines := make([]string, 0, len(sequenceLines)+1+len(ownedByLines))
	lines = append(lines, sequenceLines...)
	lines = append(
		lines,
		fmt.Sprintf(
			"CREATE TABLE %s (\n%s\n);",
			qualifiedTable,
			strings.Join(columnDefs, ",\n"),
		),
	)
	lines = append(lines, ownedByLines...)
	return lines
}

func (d *PostgresDriver) formatColumnDefinition(column models.ColumnDef) string {
	columnType := driver.FirstNonEmpty(column.FullDataType, column.DataType)
	parts := []string{
		d.QuoteIdentifier(column.Name),
		strings.TrimSpace(columnType),
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
	if defaultValue := d.formatColumnDefault(column); defaultValue != "" {
		parts = append(parts, "DEFAULT "+defaultValue)
	}
	return strings.Join(parts, " ")
}

func (d *PostgresDriver) formatColumnDefault(column models.ColumnDef) string {
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

// CreateTable creates a table from column definitions, running
// BuildCreateTableStatements's output in one transaction.
func (d *PostgresDriver) CreateTable(ctx context.Context, db *sql.DB, schema, table string, columns []models.ColumnDef) error {
	normalized := normalizeSerialColumns(schema, table, columns)
	statements := d.BuildCreateTableStatements(schema, models.SchemaTableSnapshot{
		Name:    table,
		Columns: normalized,
	})

	return driver.RunStatementsInTx(ctx, db, statements)
}

// DropObject drops a TABLE, VIEW, or INDEX. Postgres is the only dialect
// that supports CASCADE.
func (d *PostgresDriver) DropObject(ctx context.Context, db *sql.DB, schema, objectName, objectType string, cascade bool) error {
	var ddl string
	switch objectType {
	case constant.ObjectTypeTable:
		ddl = "DROP TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
		if cascade {
			ddl += " CASCADE"
		}
	case constant.ObjectTypeView:
		ddl = "DROP VIEW " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
		if cascade {
			ddl += " CASCADE"
		}
	case constant.ObjectTypeIndex:
		if cascade {
			return fmt.Errorf("drop cascade is not supported for INDEX")
		}
		ddl = "DROP INDEX " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(objectName)
	default:
		return fmt.Errorf("unsupported object type: %s", objectType)
	}
	_, err := db.ExecContext(ctx, ddl)
	return err
}

// TruncateTable empties a table. Postgres supports both CASCADE and RESTART
// IDENTITY.
func (d *PostgresDriver) TruncateTable(ctx context.Context, db *sql.DB, schema, table string, cascade, restartIdentity bool) error {
	ddl := "TRUNCATE TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table)
	if restartIdentity {
		ddl += " RESTART IDENTITY"
	}
	if cascade {
		ddl += " CASCADE"
	}
	_, err := db.ExecContext(ctx, ddl)
	return err
}

func (d *PostgresDriver) SupportsSnapshotDDL() bool { return true }

// FetchTableDDLForSnapshot returns authoritative CREATE TABLE DDL for the
// git-tracking snapshot feature, independent of SchemaDiffExtractor's
// FetchTableDDL (see the TableEditor interface doc for why).
func (d *PostgresDriver) FetchTableDDLForSnapshot(ctx context.Context, db *sql.DB, schema, table string) (string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT column_name, data_type, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
		FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2
		ORDER BY ordinal_position
	`, schema, table)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var colName, dataType, nullable, defaultVal *string
		var charLen, numPrec, numScale *int64
		if err := rows.Scan(&colName, &dataType, &nullable, &defaultVal, &charLen, &numPrec, &numScale); err != nil {
			return "", err
		}
		col := d.QuoteIdentifier(*colName) + " " + *dataType
		if charLen != nil && *charLen > 0 {
			col += fmt.Sprintf("(%d)", *charLen)
		}
		if nullable != nil && *nullable == "NO" {
			col += " NOT NULL"
		}
		if defaultVal != nil && *defaultVal != "" {
			col += " DEFAULT " + *defaultVal
		}
		cols = append(cols, col)
	}

	pkRows, err := db.QueryContext(ctx, `
		SELECT a.attname
		FROM pg_index i
		JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
		JOIN pg_class c ON c.oid = i.indrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary
	`, schema, table)
	if err != nil {
		return "", err
	}
	defer pkRows.Close()

	var pkCols []string
	for pkRows.Next() {
		var pkCol string
		pkRows.Scan(&pkCol)
		pkCols = append(pkCols, d.QuoteIdentifier(pkCol))
	}

	ddl := "CREATE TABLE " + d.QuoteIdentifier(schema) + "." + d.QuoteIdentifier(table) + " (\n"
	ddl += strings.Join(cols, ",\n")
	if len(pkCols) > 0 {
		ddl += ",\n  PRIMARY KEY (" + strings.Join(pkCols, ", ") + ")"
	}
	ddl += "\n);"
	return ddl, nil
}
