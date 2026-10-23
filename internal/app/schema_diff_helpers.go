// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"sort"
	"strings"

	"zentro/internal/constant"
	"zentro/internal/models"
)

func columnsEquivalentForRename(left, right models.ColumnDef) bool {
	return normalizeInlineSQL(firstNonEmpty(left.FullDataType, left.DataType)) == normalizeInlineSQL(firstNonEmpty(right.FullDataType, right.DataType)) &&
		left.IsNullable == right.IsNullable &&
		normalizeInlineSQL(left.DefaultValue) == normalizeInlineSQL(right.DefaultValue) &&
		left.IsPrimaryKey == right.IsPrimaryKey
}

func tableColumnsSemanticallyEquivalent(left, right []models.ColumnDef) bool {
	if len(left) != len(right) {
		return false
	}

	rightByName := make(map[string]models.ColumnDef, len(right))
	for _, column := range right {
		rightByName[column.Name] = column
	}

	for _, leftColumn := range left {
		rightColumn, ok := rightByName[leftColumn.Name]
		if !ok || !columnsEquivalentForRename(leftColumn, rightColumn) {
			return false
		}
	}

	return true
}

func primaryKeyColumnOrder(columns []models.ColumnDef) []string {
	result := make([]string, 0, len(columns))
	for _, column := range columns {
		if column.IsPrimaryKey {
			result = append(result, column.Name)
		}
	}
	return result
}

func primaryKeyColumnOrderFromMap(columns map[string]models.ColumnDef) []string {
	names := make([]string, 0, len(columns))
	for name, column := range columns {
		if column.IsPrimaryKey {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}

func sameStringSlices(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func formatMSSQLDropPrimaryKey(schemaName, tableName, qualifiedTable string) string {
	return fmt.Sprintf(
		`DECLARE @pkname NVARCHAR(256);
SELECT @pkname = kc.name FROM sys.key_constraints kc
JOIN sys.tables t ON kc.parent_object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE kc.type = 'PK' AND s.name = '%s' AND t.name = '%s';
IF @pkname IS NOT NULL
    EXEC('ALTER TABLE %s DROP CONSTRAINT [' + @pkname + ']');`,
		schemaName,
		tableName,
		qualifiedTable,
	)
}

func formatMSSQLAddPrimaryKey(tableName, qualifiedTable string, columns []string) string {
	quotedColumns := make([]string, 0, len(columns))
	suffixParts := make([]string, 0, len(columns))
	for _, column := range columns {
		quotedColumns = append(quotedColumns, quoteIdentifierForDriverName(constant.DriverSQLServer, column))
		suffixParts = append(suffixParts, column)
	}

	return fmt.Sprintf(
		`ALTER TABLE %s ADD CONSTRAINT %s PRIMARY KEY (%s);`,
		qualifiedTable,
		quoteIdentifierForDriverName(constant.DriverSQLServer, fmt.Sprintf("PK_%s_%s", tableName, strings.Join(suffixParts, "_"))),
		strings.Join(quotedColumns, ", "),
	)
}

func formatMSSQLDropDefaultConstraint(schemaName, tableName, qualifiedTable, columnName string) string {
	return fmt.Sprintf(
		`DECLARE @cname NVARCHAR(256);
SELECT @cname = dc.name FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
JOIN sys.tables t ON c.object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = '%s' AND t.name = '%s' AND c.name = '%s';
IF @cname IS NOT NULL
    EXEC('ALTER TABLE %s DROP CONSTRAINT [' + @cname + ']');`,
		schemaName,
		tableName,
		columnName,
		qualifiedTable,
	)
}

func formatMSSQLAddDefaultConstraint(qualifiedTable, columnName, defaultValue string) string {
	return fmt.Sprintf(
		`ALTER TABLE %s ADD DEFAULT (%s) FOR %s;`,
		qualifiedTable,
		strings.TrimSpace(defaultValue),
		quoteIdentifierForDriverName(constant.DriverSQLServer, columnName),
	)
}

func buildMigrationSQLWithWarnings(sqlText string, warnings []string) string {
	if len(warnings) == 0 {
		return sqlText
	}

	header := []string{"-- Schema migration warnings:"}
	for _, warning := range warnings {
		header = append(header, "-- - "+warning)
	}
	if strings.TrimSpace(sqlText) == "" {
		return strings.Join(header, "\n")
	}
	return strings.Join(header, "\n") + "\n\n" + sqlText
}

func normalizeDDL(value string) string {
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	normalized := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, strings.Join(strings.Fields(trimmed), " "))
	}
	return strings.Join(normalized, "\n")
}

func normalizeInlineSQL(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
