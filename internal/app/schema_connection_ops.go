// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/core"
	"zentro/internal/models"
)

// schema_connection_ops.go contains table-level DDL operations and the
// shared ensureActiveConnection helper. Object-level DDL lives in sibling
// files:
//   - schema_index_ops.go         — index create/drop/list
//   - schema_constraint_ops.go    — check, unique, primary-key DDL
//   - schema_foreign_key_ops.go   — foreign key DDL + validation

func ensureActiveConnection(profile *models.ConnectionProfile, db *sql.DB) error {
	if profile == nil || db == nil {
		return fmt.Errorf("no active connection")
	}
	return nil
}

// quoteIdentifierForDriverName resolves the driver by name and delegates to
// its QuoteIdentifier. Scoped to pure DDL-building functions that take a
// driver name string rather than a resolved handle: the schema-diff/
// migration DDL generators (schema_diff_helpers.go, schema_diff_migration.go,
// schema_diff_table_migration.go) and write_preview.go's SQL builder, which
// are separate concerns (SchemaDiffExtractor, write-preview parsing) outside
// this issue's scope entirely. Every operational *WithConnection call site
// resolves its driver once via core.Get and calls QuoteIdentifier directly.
func quoteIdentifierForDriverName(driverName, name string) string {
	drv, ok := core.Get(driverName)
	if !ok {
		// All four drivers register at startup in main.go (and in
		// internal/app's TestMain for tests) — a miss here means the
		// registry itself is misconfigured, not that the identifier is
		// unquotable. Fail loudly rather than guessing a dialect's quoting
		// rule in app code, which is exactly the coupling this port exists
		// to remove (ADR-0001).
		panic(fmt.Sprintf("quoteIdentifierForDriverName: driver %q is not registered", driverName))
	}
	return drv.QuoteIdentifier(name)
}

func GetTableDDLWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string) (string, error) {
	if err := ensureActiveConnection(profile, db); err != nil {
		return "", err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return "", fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.FetchTableDDL(context.Background(), db, schema, tableName)
}

func DropObjectWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, objectName, objectType string) error {
	return DropObjectAdvancedWithConnection(profile, db, schema, objectName, objectType, false)
}

func DropObjectAdvancedWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, objectName, objectType string, cascade bool) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.DropObject(context.Background(), db, schema, objectName, objectType, cascade)
}

func TruncateTableWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string, cascade bool, restartIdentity bool) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.TruncateTable(context.Background(), db, schema, tableName, cascade, restartIdentity)
}

func CreateTableWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string, columns []models.ColumnDef) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.CreateTable(context.Background(), db, schema, tableName, columns)
}
