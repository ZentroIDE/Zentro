// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"sort"
	"strings"

	"zentro/internal/constant"
	"zentro/internal/models"
)

func buildMySQLTableMigration(
	schemaName string,
	desired models.SchemaTableSnapshot,
	current models.SchemaTableSnapshot,
) ([]string, []string) {
	tableName := desired.Name
	var qualifiedTable string
	if schemaName != "" {
		qualifiedTable = fmt.Sprintf(`%s.%s`, quoteIdentifierForDriverName(constant.DriverMySQL, schemaName), quoteIdentifierForDriverName(constant.DriverMySQL, tableName))
	} else {
		qualifiedTable = quoteIdentifierForDriverName(constant.DriverMySQL, tableName)
	}

	desiredColumns, currentColumns, allColumnNames := buildColumnLookup(desired.Columns, current.Columns)
	missing, extra := findMissingAndExtraColumns(desired.Columns, current.Columns, desiredColumns, currentColumns)

	lines := make([]string, 0)
	warnings := make([]string, 0)

	currentColumns, missing, extra, renameLines := buildColumnRenameLines(
		qualifiedTable,
		missing,
		extra,
		currentColumns,
		func(extraColumn, missingColumn models.ColumnDef) string {
			return fmt.Sprintf(
				`ALTER TABLE %s CHANGE COLUMN %s %s %s;`,
				qualifiedTable,
				quoteIdentifierForDriverName(constant.DriverMySQL, extraColumn.Name),
				quoteIdentifierForDriverName(constant.DriverMySQL, missingColumn.Name),
				firstNonEmpty(missingColumn.FullDataType, missingColumn.DataType),
			)
		},
	)
	lines = append(lines, renameLines...)

	for _, column := range extra {
		lines = append(lines, fmt.Sprintf(
			`ALTER TABLE %s DROP COLUMN %s;`,
			qualifiedTable,
			quoteIdentifierForDriverName(constant.DriverMySQL, column.Name),
		))
	}
	for _, column := range missing {
		lines = append(lines, fmt.Sprintf(
			`ALTER TABLE %s ADD COLUMN %s;`,
			qualifiedTable,
			formatMySQLColumnDefinition(column),
		))
	}

	for _, columnName := range intersectingSortedColumnNames(allColumnNames, desiredColumns, currentColumns) {
		desiredColumn := desiredColumns[columnName]
		currentColumn := currentColumns[columnName]

		desiredType := firstNonEmpty(desiredColumn.FullDataType, desiredColumn.DataType)
		currentType := firstNonEmpty(currentColumn.FullDataType, currentColumn.DataType)
		desiredDefault := normalizeInlineSQL(desiredColumn.DefaultValue)
		currentDefault := normalizeInlineSQL(currentColumn.DefaultValue)

		if normalizeInlineSQL(desiredType) != normalizeInlineSQL(currentType) ||
			desiredColumn.IsNullable != currentColumn.IsNullable ||
			desiredDefault != currentDefault {
			lines = append(lines, fmt.Sprintf(
				`ALTER TABLE %s MODIFY COLUMN %s;`,
				qualifiedTable,
				formatMySQLColumnDefinition(desiredColumn),
			))
		}

		if desiredColumn.IsPrimaryKey != currentColumn.IsPrimaryKey {
			warnings = append(warnings, fmt.Sprintf("Primary key change detected on %s.%s and is not auto-generated in v1.", tableName, desiredColumn.Name))
		}
	}

	return lines, warnings
}

func formatMySQLColumnDefinition(column models.ColumnDef) string {
	columnType := firstNonEmpty(column.FullDataType, column.DataType)
	parts := []string{
		quoteIdentifierForDriverName(constant.DriverMySQL, column.Name),
		strings.TrimSpace(columnType),
	}
	if column.IsNullable {
		parts = append(parts, "NULL")
	} else {
		parts = append(parts, "NOT NULL")
	}
	if strings.TrimSpace(column.DefaultValue) != "" {
		parts = append(parts, "DEFAULT "+strings.TrimSpace(column.DefaultValue))
	}
	return strings.Join(parts, " ")
}

func buildMSSQLTableMigration(
	schemaName string,
	desired models.SchemaTableSnapshot,
	current models.SchemaTableSnapshot,
) ([]string, []string) {
	tableName := desired.Name
	qualifiedTable := fmt.Sprintf(`%s.%s`, quoteIdentifierForDriverName(constant.DriverSQLServer, schemaName), quoteIdentifierForDriverName(constant.DriverSQLServer, tableName))

	desiredColumns, currentColumns, allColumnNames := buildColumnLookup(desired.Columns, current.Columns)
	missing, extra := findMissingAndExtraColumns(desired.Columns, current.Columns, desiredColumns, currentColumns)

	lines := make([]string, 0)
	warnings := make([]string, 0)

	currentColumns, missing, extra, renameLines := buildColumnRenameLines(
		qualifiedTable,
		missing,
		extra,
		currentColumns,
		func(extraColumn, missingColumn models.ColumnDef) string {
			return fmt.Sprintf(
				`EXEC sp_rename '%s.%s', '%s', 'COLUMN';`,
				qualifiedTable,
				extraColumn.Name,
				missingColumn.Name,
			)
		},
	)
	lines = append(lines, renameLines...)

	for _, column := range extra {
		lines = append(lines, fmt.Sprintf(
			`ALTER TABLE %s DROP COLUMN %s;`,
			qualifiedTable,
			quoteIdentifierForDriverName(constant.DriverSQLServer, column.Name),
		))
		delete(currentColumns, column.Name)
	}
	for _, column := range missing {
		lines = append(lines, fmt.Sprintf(
			`ALTER TABLE %s ADD %s;`,
			qualifiedTable,
			formatMSSQLColumnDefinition(column),
		))
		currentColumns[column.Name] = column
	}

	for _, columnName := range intersectingSortedColumnNames(allColumnNames, desiredColumns, currentColumns) {
		desiredColumn := desiredColumns[columnName]
		currentColumn := currentColumns[columnName]

		desiredType := firstNonEmpty(desiredColumn.FullDataType, desiredColumn.DataType)
		currentType := firstNonEmpty(currentColumn.FullDataType, currentColumn.DataType)
		desiredDefault := normalizeInlineSQL(desiredColumn.DefaultValue)
		currentDefault := normalizeInlineSQL(currentColumn.DefaultValue)

		if normalizeInlineSQL(desiredType) != normalizeInlineSQL(currentType) ||
			desiredColumn.IsNullable != currentColumn.IsNullable {
			nullability := "NULL"
			if !desiredColumn.IsNullable {
				nullability = "NOT NULL"
			}
			lines = append(lines, fmt.Sprintf(
				`ALTER TABLE %s ALTER COLUMN %s %s %s;`,
				qualifiedTable,
				quoteIdentifierForDriverName(constant.DriverSQLServer, desiredColumn.Name),
				strings.TrimSpace(desiredType),
				nullability,
			))
		}

		if desiredDefault != currentDefault {
			lines = append(lines, formatMSSQLDropDefaultConstraint(schemaName, tableName, qualifiedTable, desiredColumn.Name))
			if strings.TrimSpace(desiredColumn.DefaultValue) != "" {
				lines = append(lines, formatMSSQLAddDefaultConstraint(qualifiedTable, desiredColumn.Name, desiredColumn.DefaultValue))
			}
		}
	}

	desiredPKColumns := primaryKeyColumnOrder(desired.Columns)
	currentPKColumns := primaryKeyColumnOrderFromMap(currentColumns)
	if !sameStringSlices(desiredPKColumns, currentPKColumns) {
		if len(currentPKColumns) > 0 {
			lines = append(lines, formatMSSQLDropPrimaryKey(schemaName, tableName, qualifiedTable))
		}
		if len(desiredPKColumns) > 0 {
			lines = append(lines, formatMSSQLAddPrimaryKey(tableName, qualifiedTable, desiredPKColumns))
		}
	}

	return lines, warnings
}

func formatMSSQLColumnDefinition(column models.ColumnDef) string {
	columnType := firstNonEmpty(column.FullDataType, column.DataType)
	parts := []string{
		quoteIdentifierForDriverName(constant.DriverSQLServer, column.Name),
		strings.TrimSpace(columnType),
	}
	if column.IsNullable {
		parts = append(parts, "NULL")
	} else {
		parts = append(parts, "NOT NULL")
	}
	if strings.TrimSpace(column.DefaultValue) != "" {
		parts = append(parts, "DEFAULT "+strings.TrimSpace(column.DefaultValue))
	}
	return strings.Join(parts, " ")
}

func buildPostgresTableMigration(
	schemaName string,
	desired models.SchemaTableSnapshot,
	current models.SchemaTableSnapshot,
) ([]string, []string) {
	tableName := desired.Name
	qualifiedTable := fmt.Sprintf(`%s.%s`, quoteIdentifierForDriverName(constant.DriverPostgres, schemaName), quoteIdentifierForDriverName(constant.DriverPostgres, tableName))

	desiredColumns, currentColumns, allColumnNames := buildColumnLookup(desired.Columns, current.Columns)
	missing, extra := findMissingAndExtraColumns(desired.Columns, current.Columns, desiredColumns, currentColumns)

	lines := make([]string, 0)
	warnings := make([]string, 0)

	currentColumns, missing, extra, renameLines := buildColumnRenameLines(
		qualifiedTable,
		missing,
		extra,
		currentColumns,
		func(extraColumn, missingColumn models.ColumnDef) string {
			return fmt.Sprintf(
				`ALTER TABLE %s RENAME COLUMN %s TO %s;`,
				qualifiedTable,
				quoteIdentifierForDriverName(constant.DriverPostgres, extraColumn.Name),
				quoteIdentifierForDriverName(constant.DriverPostgres, missingColumn.Name),
			)
		},
	)
	lines = append(lines, renameLines...)

	for _, column := range extra {
		lines = append(lines, fmt.Sprintf(
			`ALTER TABLE %s DROP COLUMN %s;`,
			qualifiedTable,
			quoteIdentifierForDriverName(constant.DriverPostgres, column.Name),
		))
	}
	for _, column := range missing {
		lines = append(lines, fmt.Sprintf(
			`ALTER TABLE %s ADD COLUMN %s;`,
			qualifiedTable,
			formatPostgresColumnDefinition(column),
		))
	}

	for _, columnName := range intersectingSortedColumnNames(allColumnNames, desiredColumns, currentColumns) {
		desiredColumn := desiredColumns[columnName]
		currentColumn := currentColumns[columnName]

		desiredType := firstNonEmpty(desiredColumn.FullDataType, desiredColumn.DataType)
		currentType := firstNonEmpty(currentColumn.FullDataType, currentColumn.DataType)
		if normalizeInlineSQL(desiredType) != normalizeInlineSQL(currentType) {
			lines = append(lines, fmt.Sprintf(
				`ALTER TABLE %s ALTER COLUMN %s TYPE %s USING %s::%s;`,
				qualifiedTable,
				quoteIdentifierForDriverName(constant.DriverPostgres, desiredColumn.Name),
				desiredType,
				quoteIdentifierForDriverName(constant.DriverPostgres, desiredColumn.Name),
				desiredType,
			))
		}
		if desiredColumn.IsNullable != currentColumn.IsNullable {
			if desiredColumn.IsNullable {
				lines = append(lines, fmt.Sprintf(
					`ALTER TABLE %s ALTER COLUMN %s DROP NOT NULL;`,
					qualifiedTable,
					quoteIdentifierForDriverName(constant.DriverPostgres, desiredColumn.Name),
				))
			} else {
				lines = append(lines, fmt.Sprintf(
					`ALTER TABLE %s ALTER COLUMN %s SET NOT NULL;`,
					qualifiedTable,
					quoteIdentifierForDriverName(constant.DriverPostgres, desiredColumn.Name),
				))
			}
		}

		desiredDefault := normalizeInlineSQL(desiredColumn.DefaultValue)
		currentDefault := normalizeInlineSQL(currentColumn.DefaultValue)
		if desiredDefault != currentDefault {
			if desiredDefault == "" {
				lines = append(lines, fmt.Sprintf(
					`ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT;`,
					qualifiedTable,
					quoteIdentifierForDriverName(constant.DriverPostgres, desiredColumn.Name),
				))
			} else {
				lines = append(lines, fmt.Sprintf(
					`ALTER TABLE %s ALTER COLUMN %s SET DEFAULT %s;`,
					qualifiedTable,
					quoteIdentifierForDriverName(constant.DriverPostgres, desiredColumn.Name),
					strings.TrimSpace(desiredColumn.DefaultValue),
				))
			}
		}

		if desiredColumn.IsPrimaryKey != currentColumn.IsPrimaryKey {
			warnings = append(warnings, fmt.Sprintf("Primary key change detected on %s.%s and is not auto-generated in v1.", tableName, desiredColumn.Name))
		}
	}

	return lines, warnings
}

func formatPostgresColumnDefinition(column models.ColumnDef) string {
	columnType := firstNonEmpty(column.FullDataType, column.DataType)
	parts := []string{
		quoteIdentifierForDriverName(constant.DriverPostgres, column.Name),
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
	if defaultValue := formatPostgresColumnDefaultForMigration(column); defaultValue != "" {
		parts = append(parts, "DEFAULT "+defaultValue)
	}
	return strings.Join(parts, " ")
}

func formatPostgresColumnDefaultForMigration(column models.ColumnDef) string {
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
	return quoteIdentifierForDriverName(constant.DriverPostgres, name)
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

func buildColumnLookup(
	desired []models.ColumnDef,
	current []models.ColumnDef,
) (map[string]models.ColumnDef, map[string]models.ColumnDef, map[string]struct{}) {
	desiredColumns := make(map[string]models.ColumnDef, len(desired))
	currentColumns := make(map[string]models.ColumnDef, len(current))
	allColumnNames := make(map[string]struct{}, len(desired)+len(current))

	for _, column := range desired {
		desiredColumns[column.Name] = column
		allColumnNames[column.Name] = struct{}{}
	}
	for _, column := range current {
		currentColumns[column.Name] = column
		allColumnNames[column.Name] = struct{}{}
	}

	return desiredColumns, currentColumns, allColumnNames
}

func findMissingAndExtraColumns(
	desired []models.ColumnDef,
	current []models.ColumnDef,
	desiredColumns map[string]models.ColumnDef,
	currentColumns map[string]models.ColumnDef,
) ([]models.ColumnDef, []models.ColumnDef) {
	missing := make([]models.ColumnDef, 0)
	extra := make([]models.ColumnDef, 0)

	for _, column := range desired {
		if _, ok := currentColumns[column.Name]; !ok {
			missing = append(missing, column)
		}
	}
	for _, column := range current {
		if _, ok := desiredColumns[column.Name]; !ok {
			extra = append(extra, column)
		}
	}

	return missing, extra
}

func buildColumnRenameLines(
	qualifiedTable string,
	missing []models.ColumnDef,
	extra []models.ColumnDef,
	currentColumns map[string]models.ColumnDef,
	buildLine func(extraColumn, missingColumn models.ColumnDef) string,
) (map[string]models.ColumnDef, []models.ColumnDef, []models.ColumnDef, []string) {
	lines := make([]string, 0)
	usedMissing := make([]bool, len(missing))
	usedExtra := make([]bool, len(extra))

	for extraIndex, extraColumn := range extra {
		for missingIndex, missingColumn := range missing {
			if usedMissing[missingIndex] || usedExtra[extraIndex] {
				continue
			}
			if !columnsEquivalentForRename(missingColumn, extraColumn) {
				continue
			}

			lines = append(lines, buildLine(extraColumn, missingColumn))
			currentColumns[missingColumn.Name] = extraColumn
			delete(currentColumns, extraColumn.Name)
			usedMissing[missingIndex] = true
			usedExtra[extraIndex] = true
			break
		}
	}

	return currentColumns, filterUnusedColumns(missing, usedMissing), filterUnusedColumns(extra, usedExtra), lines
}

func filterUnusedColumns(columns []models.ColumnDef, used []bool) []models.ColumnDef {
	filtered := make([]models.ColumnDef, 0, len(columns))
	for index, column := range columns {
		if !used[index] {
			filtered = append(filtered, column)
		}
	}
	return filtered
}

func intersectingSortedColumnNames(
	allColumnNames map[string]struct{},
	desiredColumns map[string]models.ColumnDef,
	currentColumns map[string]models.ColumnDef,
) []string {
	columnNames := make([]string, 0, len(allColumnNames))
	for columnName := range allColumnNames {
		if _, ok := desiredColumns[columnName]; !ok {
			continue
		}
		if _, ok := currentColumns[columnName]; !ok {
			continue
		}
		columnNames = append(columnNames, columnName)
	}
	sort.Strings(columnNames)
	return columnNames
}
