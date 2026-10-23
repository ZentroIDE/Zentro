// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"sort"
	"strings"

	"zentro/internal/constant"
	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/models"
)

func generateSchemaMigration(left, right models.SchemaSnapshot) (models.SchemaMigrationResult, error) {
	result := models.SchemaMigrationResult{
		Supported: true,
		Driver:    strings.TrimSpace(left.Driver),
		Direction: "left-to-right",
		Warnings:  []string{},
	}

	if !left.Supported || !right.Supported {
		result.Supported = false
		result.UnsupportedMessage = firstNonEmpty(left.UnsupportedMsg, right.UnsupportedMsg, "Schema diff migration is unsupported for one or both sources.")
		return result, nil
	}

	if !strings.EqualFold(left.Driver, right.Driver) {
		result.Supported = false
		result.UnsupportedMessage = "Comparing schemas between different database drivers is not supported."
		return result, nil
	}

	driver := strings.ToLower(strings.TrimSpace(left.Driver))
	if driver == constant.DriverSQLite {
		result.Supported = false
		result.UnsupportedMessage = "Schema migration scripting is not supported for SQLite due to SQLite ALTER TABLE limitations. Visual DDL comparison only."
		return result, nil
	}

	if driver != constant.DriverPostgres && driver != constant.DriverMySQL && driver != constant.DriverSQLServer {
		result.Supported = false
		result.UnsupportedMessage = fmt.Sprintf("Schema diff migration is not supported for driver: %s.", left.Driver)
		return result, nil
	}

	if !strings.EqualFold(left.SchemaName, right.SchemaName) {
		result.Warnings = append(result.Warnings, fmt.Sprintf("Schema names differ (%s vs %s). Migration will target %s.", left.SchemaName, right.SchemaName, right.SchemaName))
	}

	dropConstraints, createConstraints := diffConstraints(driver, left, right)
	dropViews, createViews := diffViews(driver, left, right)
	dropRoutines, createRoutines := diffRoutines(driver, left, right)
	dropIndexes, createIndexes := diffIndexes(driver, left, right)
	tableLines, tableWarnings, err := diffTables(driver, left, right)
	if err != nil {
		return models.SchemaMigrationResult{}, err
	}
	result.Warnings = append(result.Warnings, tableWarnings...)

	var lines []string
	lines = append(lines, dropConstraints...)
	lines = append(lines, dropViews...)
	lines = append(lines, dropRoutines...)
	lines = append(lines, dropIndexes...)
	lines = append(lines, tableLines...)
	lines = append(lines, createIndexes...)
	lines = append(lines, createConstraints...)
	lines = append(lines, createViews...)
	lines = append(lines, createRoutines...)

	result.SQL = strings.Join(lines, "\n")
	if len(result.Warnings) > 0 {
		result.SQL = buildMigrationSQLWithWarnings(result.SQL, result.Warnings)
	}
	return result, nil
}

func diffConstraints(driver string, left, right models.SchemaSnapshot) ([]string, []string) {
	var dropConstraints, createConstraints []string

	leftConstraints := make(map[string]models.SchemaConstraintSnapshot)
	for _, c := range left.Constraints {
		leftConstraints[c.Name] = c
	}
	rightConstraints := make(map[string]models.SchemaConstraintSnapshot)
	for _, c := range right.Constraints {
		rightConstraints[c.Name] = c
	}

	for name, rightConstraint := range rightConstraints {
		leftConstraint, hasLeft := leftConstraints[name]
		if !hasLeft || normalizeDDL(leftConstraint.DDL) != normalizeDDL(rightConstraint.DDL) {
			dropConstraints = append(dropConstraints, formatDropConstraint(driver, right.SchemaName, rightConstraint.TableName, rightConstraint.Name, rightConstraint.Type))
		}
	}
	for name, leftConstraint := range leftConstraints {
		rightConstraint, hasRight := rightConstraints[name]
		if !hasRight || normalizeDDL(leftConstraint.DDL) != normalizeDDL(rightConstraint.DDL) {
			createConstraints = append(createConstraints, leftConstraint.DDL)
		}
	}

	return dropConstraints, createConstraints
}

func diffViews(driver string, left, right models.SchemaSnapshot) ([]string, []string) {
	var dropViews, createViews []string

	leftViews := make(map[string]models.SchemaViewSnapshot)
	for _, view := range left.Views {
		leftViews[view.Name] = view
	}
	rightViews := make(map[string]models.SchemaViewSnapshot)
	for _, view := range right.Views {
		rightViews[view.Name] = view
	}

	for name, rightView := range rightViews {
		leftView, hasLeft := leftViews[name]
		if !hasLeft || normalizeDDL(leftView.DDL) != normalizeDDL(rightView.DDL) {
			dropViews = append(dropViews, formatDropView(driver, right.SchemaName, rightView.Name))
		}
	}
	for name, leftView := range leftViews {
		rightView, hasRight := rightViews[name]
		if !hasRight || normalizeDDL(leftView.DDL) != normalizeDDL(rightView.DDL) {
			createViews = append(createViews, leftView.DDL)
		}
	}

	return dropViews, createViews
}

func diffRoutines(driver string, left, right models.SchemaSnapshot) ([]string, []string) {
	var dropRoutines, createRoutines []string

	leftRoutines := make(map[string]models.SchemaRoutineSnapshot)
	for _, routine := range left.Routines {
		leftRoutines[routine.Signature] = routine
	}
	rightRoutines := make(map[string]models.SchemaRoutineSnapshot)
	for _, routine := range right.Routines {
		rightRoutines[routine.Signature] = routine
	}

	for signature, rightRoutine := range rightRoutines {
		leftRoutine, hasLeft := leftRoutines[signature]
		if !hasLeft || normalizeDDL(leftRoutine.DDL) != normalizeDDL(rightRoutine.DDL) {
			dropRoutines = append(dropRoutines, formatDropRoutine(driver, right.SchemaName, rightRoutine.Name, rightRoutine.Signature))
		}
	}
	for signature, leftRoutine := range leftRoutines {
		rightRoutine, hasRight := rightRoutines[signature]
		if !hasRight || normalizeDDL(leftRoutine.DDL) != normalizeDDL(rightRoutine.DDL) {
			createRoutines = append(createRoutines, leftRoutine.DDL)
		}
	}

	return dropRoutines, createRoutines
}

func diffIndexes(driver string, left, right models.SchemaSnapshot) ([]string, []string) {
	var dropIndexes, createIndexes []string

	leftIndexes := make(map[string]models.SchemaIndexSnapshot)
	for _, index := range left.Indexes {
		leftIndexes[index.Name] = index
	}
	rightIndexes := make(map[string]models.SchemaIndexSnapshot)
	for _, index := range right.Indexes {
		rightIndexes[index.Name] = index
	}

	for name, rightIndex := range rightIndexes {
		leftIndex, hasLeft := leftIndexes[name]
		if !hasLeft || normalizeDDL(leftIndex.DDL) != normalizeDDL(rightIndex.DDL) {
			dropIndexes = append(dropIndexes, formatDropIndex(driver, right.SchemaName, rightIndex.TableName, rightIndex.Name))
		}
	}
	for name, leftIndex := range leftIndexes {
		rightIndex, hasRight := rightIndexes[name]
		if !hasRight || normalizeDDL(leftIndex.DDL) != normalizeDDL(rightIndex.DDL) {
			createIndexes = append(createIndexes, leftIndex.DDL)
		}
	}

	return dropIndexes, createIndexes
}

func diffTables(driver string, left, right models.SchemaSnapshot) ([]string, []string, error) {
	leftTables := make(map[string]models.SchemaTableSnapshot, len(left.Tables))
	rightTables := make(map[string]models.SchemaTableSnapshot, len(right.Tables))
	allTableNames := make(map[string]struct{}, len(left.Tables)+len(right.Tables))

	for _, table := range left.Tables {
		leftTables[table.Name] = table
		allTableNames[table.Name] = struct{}{}
	}
	for _, table := range right.Tables {
		rightTables[table.Name] = table
		allTableNames[table.Name] = struct{}{}
	}

	tableNames := make([]string, 0, len(allTableNames))
	for tableName := range allTableNames {
		tableNames = append(tableNames, tableName)
	}
	sort.Strings(tableNames)

	lines := make([]string, 0)
	warnings := make([]string, 0)

	// Postgres builds CREATE TABLE through its TableEditor port (owned
	// sequences need multiple statements); other dialects replay the raw
	// snapshot DDL below. Resolve via the registry keyed by the active
	// driver — never a concrete driver import (ADR-0001).
	var tableEditor driverport.TableEditor
	if driver == constant.DriverPostgres {
		drv, ok := core.Get(driver)
		if !ok {
			return nil, nil, fmt.Errorf("diffTables: driver %q is not registered", driver)
		}
		tableEditor = drv
	}

	for _, tableName := range tableNames {
		leftTable, hasLeft := leftTables[tableName]
		rightTable, hasRight := rightTables[tableName]
		qualifiedTable := fmt.Sprintf(`%s.%s`, quoteIdentifierForDriverName(driver, right.SchemaName), quoteIdentifierForDriverName(driver, tableName))
		if driver == constant.DriverMySQL && right.SchemaName == "" {
			qualifiedTable = quoteIdentifierForDriverName(driver, tableName)
		}

		switch {
		case hasLeft && !hasRight:
			if tableEditor != nil {
				lines = append(lines, tableEditor.BuildCreateTableStatements(left.SchemaName, leftTable)...)
				continue
			}
			lines = append(lines, strings.TrimSuffix(strings.TrimSpace(leftTable.DDL), ";")+";")
		case !hasLeft && hasRight:
			dropCascade := ""
			if driver == constant.DriverPostgres {
				dropCascade = " CASCADE"
			}
			lines = append(lines, fmt.Sprintf("DROP TABLE %s%s;", qualifiedTable, dropCascade))
		default:
			tableLines, tableWarnings := buildDriverTableMigration(driver, right.SchemaName, leftTable, rightTable)
			lines = append(lines, tableLines...)
			warnings = append(warnings, tableWarnings...)

			if normalizeDDL(leftTable.DDL) != normalizeDDL(rightTable.DDL) &&
				len(tableLines) == 0 &&
				len(tableWarnings) == 0 &&
				!tableColumnsSemanticallyEquivalent(leftTable.Columns, rightTable.Columns) {
				warnings = append(warnings, fmt.Sprintf("Table %s has non-column schema differences that are not auto-generated in v1.", qualifiedTable))
			}
		}
	}

	return lines, warnings, nil
}

func buildDriverTableMigration(
	driver string,
	schemaName string,
	desired models.SchemaTableSnapshot,
	current models.SchemaTableSnapshot,
) ([]string, []string) {
	switch driver {
	case constant.DriverPostgres:
		return buildPostgresTableMigration(schemaName, desired, current)
	case constant.DriverMySQL:
		return buildMySQLTableMigration(schemaName, desired, current)
	case constant.DriverSQLServer:
		return buildMSSQLTableMigration(schemaName, desired, current)
	default:
		return nil, nil
	}
}

func formatDropConstraint(driver, schema, table, name, ctype string) string {
	quotedTable := quoteIdentifierForDriverName(driver, table)
	var qualifiedTable string
	if schema != "" {
		qualifiedTable = quoteIdentifierForDriverName(driver, schema) + "." + quotedTable
	} else {
		qualifiedTable = quotedTable
	}

	if driver == constant.DriverMySQL && ctype == "FOREIGN KEY" {
		return fmt.Sprintf("ALTER TABLE %s DROP FOREIGN KEY %s;", qualifiedTable, quoteIdentifierForDriverName(driver, name))
	}
	return fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT %s;", qualifiedTable, quoteIdentifierForDriverName(driver, name))
}

func formatDropView(driver, schema, name string) string {
	var qualifiedName string
	if schema != "" {
		qualifiedName = quoteIdentifierForDriverName(driver, schema) + "." + quoteIdentifierForDriverName(driver, name)
	} else {
		qualifiedName = quoteIdentifierForDriverName(driver, name)
	}

	if driver == constant.DriverPostgres {
		return fmt.Sprintf("DROP VIEW IF EXISTS %s CASCADE;", qualifiedName)
	}
	return fmt.Sprintf("DROP VIEW IF EXISTS %s;", qualifiedName)
}

func formatDropRoutine(driver, schema, name, signature string) string {
	var qualifiedName string
	if schema != "" {
		qualifiedName = quoteIdentifierForDriverName(driver, schema) + "." + quoteIdentifierForDriverName(driver, name)
	} else {
		qualifiedName = quoteIdentifierForDriverName(driver, name)
	}

	if driver == constant.DriverPostgres {
		return fmt.Sprintf("DROP ROUTINE IF EXISTS %s.%s CASCADE;", quoteIdentifierForDriverName(driver, schema), signature)
	}
	if driver == constant.DriverMySQL {
		if strings.Contains(strings.ToLower(signature), "function") {
			return fmt.Sprintf("DROP FUNCTION IF EXISTS %s;", qualifiedName)
		}
		return fmt.Sprintf("DROP PROCEDURE IF EXISTS %s;", qualifiedName)
	}
	return fmt.Sprintf("DROP PROCEDURE IF EXISTS %s;", qualifiedName)
}

func formatDropIndex(driver, schema, table, name string) string {
	switch driver {
	case constant.DriverPostgres:
		var qualifiedName string
		if schema != "" {
			qualifiedName = quoteIdentifierForDriverName(driver, schema) + "." + quoteIdentifierForDriverName(driver, name)
		} else {
			qualifiedName = quoteIdentifierForDriverName(driver, name)
		}
		return fmt.Sprintf("DROP INDEX IF EXISTS %s CASCADE;", qualifiedName)
	case constant.DriverMySQL:
		var qualifiedTable string
		if schema != "" {
			qualifiedTable = quoteIdentifierForDriverName(driver, schema) + "." + quoteIdentifierForDriverName(driver, table)
		} else {
			qualifiedTable = quoteIdentifierForDriverName(driver, table)
		}
		return fmt.Sprintf("ALTER TABLE %s DROP INDEX %s;", qualifiedTable, quoteIdentifierForDriverName(driver, name))
	default:
		var qualifiedTable string
		if schema != "" {
			qualifiedTable = quoteIdentifierForDriverName(driver, schema) + "." + quoteIdentifierForDriverName(driver, table)
		} else {
			qualifiedTable = quoteIdentifierForDriverName(driver, table)
		}
		return fmt.Sprintf("DROP INDEX %s ON %s;", quoteIdentifierForDriverName(driver, name), qualifiedTable)
	}
}
