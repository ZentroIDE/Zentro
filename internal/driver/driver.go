// SPDX-License-Identifier: GPL-3.0-only

// Package driver defines the extension points (Ports) for database drivers.
// Pattern: Hexagonal / Ports & Adapters — interfaces are Ports; implementations are Adapters.
// Pattern: Interface Segregation — three focused interfaces instead of one fat interface.
package driver

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"zentro/internal/models"
)

// ErrCreateDatabaseUnsupported is returned by drivers where "database" has no
// server-level create concept (e.g. SQLite, where a database is just a file).
var ErrCreateDatabaseUnsupported = errors.New("driver does not support creating databases")

// ErrObjectNotFound is wrapped by a read port when the object (or column) it
// was asked about does not exist, so the app layer can answer
// OBJECT_NOT_FOUND instead of treating it as a database failure.
var ErrObjectNotFound = errors.New("object not found")

// Connector is the Port for opening database connections.
// Pattern: Dependency Inversion — callers depend on this abstraction, not concrete drivers.
type Connector interface {
	// Name returns the driver identifier ("postgres", "sqlserver", etc.).
	Name() string
	// Open creates and configures a *sql.DB from a connection profile.
	Open(p *models.ConnectionProfile) (*sql.DB, error)
	// FriendlyError translates a raw driver error to a user-facing message.
	FriendlyError(err error) error
	// MaintenanceDBName returns the database to connect to for server-level
	// operations (e.g. CREATE DATABASE) where the target database may not
	// exist yet. Empty string means connect without selecting a database.
	// Drivers with no server-level database concept return
	// ErrCreateDatabaseUnsupported.
	MaintenanceDBName() (string, error)
}

// SchemaFetcher is the Port for reading database structure.
type SchemaFetcher interface {
	// FetchDatabases returns all databases on the server plus schemas for currentDB.
	FetchDatabases(ctx context.Context, db *sql.DB, currentDB string, showAllSchemas bool, logger *slog.Logger) ([]*models.DatabaseInfo, error)
	// FetchSchema returns schemas+tables+views for the currently connected database.
	FetchSchema(ctx context.Context, db *sql.DB, showAllSchemas bool, logger *slog.Logger) ([]*models.SchemaNode, error)
	// FetchTablePrimaryKeys returns the primary key columns for a given table.
	FetchTablePrimaryKeys(ctx context.Context, db *sql.DB, schema, table string) ([]string, error)
	// FetchTableColumns returns detailed column definitions for a given table.
	FetchTableColumns(ctx context.Context, db *sql.DB, schema, table string) ([]*models.ColumnDef, error)
	// AlterTableColumn applies changes to a column definition via driver-specific DDL.
	AlterTableColumn(ctx context.Context, db *sql.DB, schema, table string, old, updated *models.ColumnDef) error
	// AddTableColumn appends a new column to a table via driver-specific DDL.
	AddTableColumn(ctx context.Context, db *sql.DB, schema, table string, col *models.ColumnDef) error
	// DropTableColumn removes a column from a table via driver-specific DDL.
	DropTableColumn(ctx context.Context, db *sql.DB, schema, table, column string) error
	// FetchTableRelationships returns foreign key relationships for the given table.
	FetchTableRelationships(ctx context.Context, db *sql.DB, schema, table string) ([]models.TableRelationship, error)
	// ReorderTableColumns reorders columns in the given table to match the provided name order.
	ReorderTableColumns(ctx context.Context, db *sql.DB, schema, table string, newOrder []string) error
	// CreateDatabase creates a new database on the server. Drivers where a
	// database has no server-level create concept return ErrCreateDatabaseUnsupported.
	CreateDatabase(ctx context.Context, db *sql.DB, name string) error
}

// ContextExecutor is a minimal SQL execution interface satisfied by both
// *sql.DB and *sql.Tx. Passed to ApplySchemaContext to avoid importing sql
// directly, and to ForeignKeyEditor's Create/DropForeignKey so a caller can
// run both inside its own transaction.
type ContextExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// QueryDialect is the Port for SQL dialect differences (pagination, schema defaults).
type QueryDialect interface {
	InjectPageClause(query string, limit, offset int) string
	DefaultSchema() string
	// SupportsSessionSchema reports whether the dialect keeps a session-level
	// schema context that ApplySchemaContext can set (Postgres search_path).
	// Callers use it to decide whether query execution must pin a dedicated
	// connection so the context survives across pooled statements.
	SupportsSessionSchema() bool
	// ApplySchemaContext sets the session-level schema context before query execution.
	// Drivers that do not support schema context (MySQL, SQLite, MSSQL) return nil.
	ApplySchemaContext(ctx context.Context, exec ContextExecutor, schema string) error
	// ResetSchemaContext clears any session schema context previously set by
	// ApplySchemaContext. No-op for dialects without session schema context.
	ResetSchemaContext(ctx context.Context, exec ContextExecutor) error
	// QuoteIdentifier quotes a schema/table/column/constraint name per the
	// dialect's identifier-quoting rules, escaping any embedded quote character.
	QuoteIdentifier(name string) string
}

// SessionInitializer is an optional interface for drivers that require
// post-connection initialization (e.g. PRAGMA settings, timezone, auth tokens).
// Implement only when needed — DatabaseDriver does not embed this interface.
type SessionInitializer interface {
	InitSession(ctx context.Context, db *sql.DB) error
}

// MessageCapturer is an optional interface for drivers that can report
// server-side informational messages (e.g. T-SQL PRINT / low-severity
// RAISERROR) emitted while a statement executes. Implement only when
// needed — DatabaseDriver does not embed this interface. Only MSSQL
// implements it today; see internal/driver/mssql/message_capture.go.
type MessageCapturer interface {
	// PrepareMessageCapture returns an extra query arg to append to an
	// upcoming QueryContext call — used in place of ExecContext so the
	// driver's message stream can be read back — and a drain func to call
	// immediately after that call returns. drain fully consumes rows
	// (closing it), reports every captured message via onMessage, and
	// returns the statement's rows-affected count.
	//
	// drain must only be called after the QueryContext call it wraps has
	// already returned, never concurrently with it: the driver only
	// starts reporting messages once it has processed this arg, which for
	// this call happens on the same goroutine, before QueryContext
	// returns, and calling drain from that same point onward is what
	// keeps this race-free (see the mssql implementation for the data
	// race a naive concurrent-drain version of this hit in practice).
	PrepareMessageCapture(onMessage func(text string)) (args []any, drain func(ctx context.Context, rows *sql.Rows) (int64, error))
}

// SchemaDiffExtractor is the Port for extracting DDL of database objects for schema comparison.
type SchemaDiffExtractor interface {
	// FetchSchemaTableNames returns the names of all tables in a schema.
	FetchSchemaTableNames(ctx context.Context, db *sql.DB, schema string) ([]string, error)
	// FetchTableDDL returns the raw DDL statement to recreate a table and its columns/primary key.
	FetchTableDDL(ctx context.Context, db *sql.DB, schema, table string) (string, error)
	// FetchSchemaIndexes returns the DDL for all secondary indexes in a schema.
	FetchSchemaIndexes(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaIndexSnapshot, error)
	// FetchSchemaConstraints returns the DDL for constraints (Foreign Keys, Unique, Check).
	FetchSchemaConstraints(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaConstraintSnapshot, error)
	// FetchSchemaViews returns the DDL for all views in a schema.
	FetchSchemaViews(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaViewSnapshot, error)
	// FetchSchemaRoutines returns the DDL for all stored procedures and functions in a schema.
	FetchSchemaRoutines(ctx context.Context, db *sql.DB, schema string) ([]models.SchemaRoutineSnapshot, error)
}

// CatalogDetailsFetcher is the Port for fetching a single catalog object's
// details (index/routine/sequence/data-type DDL) for the schema-explorer
// detail panel — distinct from SchemaFetcher, which fetches the schema tree.
type CatalogDetailsFetcher interface {
	// CatalogObjectDetails returns the DDL/metadata for one named catalog
	// object. Unrecognized objectKind values return a populated
	// UnsupportedMessage rather than an error.
	CatalogObjectDetails(ctx context.Context, db *sql.DB, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error)
}

// IndexEditor is the Port for interactive index DDL (schema editor):
// create/drop/list indexes on a table. Distinct from SchemaDiffExtractor's
// FetchSchemaIndexes, which returns DDL text for schema-diff comparison.
type IndexEditor interface {
	// CreateIndex builds and executes a CREATE INDEX statement.
	CreateIndex(ctx context.Context, db *sql.DB, schema, table, indexName string, columns []string, unique bool) error
	// DropIndex builds and executes a DROP INDEX statement.
	DropIndex(ctx context.Context, db *sql.DB, schema, table, indexName string) error
	// FetchIndexes lists indexes on a table. Not yet wired up for every
	// driver — an unimplemented driver returns an error, not because the
	// dialect lacks introspection capability, but because this port hasn't
	// been connected to it yet (e.g. SQLite's sqlite_master-based index
	// listing already exists for SchemaDiffExtractor and could be reused
	// here in a follow-up).
	FetchIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.IndexInfo, error)
}

// BackendCanceller is an optional Port for drivers that can stop a
// statement on the SERVER side, not just abandon it locally via context
// cancellation. Implement only when the server exposes such a primitive —
// DatabaseDriver does not embed this interface. SQLite has no server to
// signal (a local ctx cancellation/interrupt is its only stop), so it
// doesn't implement this port; callers type-assert for it, the same
// pattern MessageCapturer uses.
type BackendCanceller interface {
	// BackendID reads the server-side session identifier (Postgres
	// backend pid, MySQL connection id, SQL Server @@SPID) of the exact
	// connection conn is on. Must be called on the same *sql.Conn the
	// statement to cancel/kill will run on — calling it on a different
	// pooled connection returns someone else's id.
	BackendID(ctx context.Context, conn *sql.Conn) (string, error)
	// CancelBackend asks the server to stop the session identified by id.
	// force=false interrupts only the currently running statement,
	// leaving the session open (Postgres: pg_cancel_backend). force=true
	// ends the whole session, rolling back any open transaction
	// (Postgres: pg_terminate_backend; MySQL/MSSQL: KILL). A driver with
	// no soft-cancel primitive of its own (MSSQL — a driver-level ctx
	// cancellation already interrupts the statement) treats force=false
	// as a no-op rather than an error.
	CancelBackend(ctx context.Context, db *sql.DB, id string, force bool) error
}

// ServerSession is one row of a database server's own session/process list
// (Postgres pg_stat_activity, MySQL information_schema.PROCESSLIST, SQL
// Server sys.dm_exec_sessions) — not a Zentro job. ID matches the value
// BackendCanceller.BackendID/CancelBackend uses, so callers can cross-mark
// "this is one of Zentro's own connections" and cancel/kill a row by ID.
type ServerSession struct {
	ID         string    `json:"id"`
	User       string    `json:"user"`
	Database   string    `json:"database"`
	Client     string    `json:"client"`
	State      string    `json:"state"`
	StartedAt  time.Time `json:"startedAt"`
	DurationMs int64     `json:"durationMs"`
	Wait       string    `json:"wait"`
	Query      string    `json:"query"`
}

// SessionMonitor is an optional Port for drivers that can list every session
// currently open on the server, not just the ones Zentro itself holds.
// Implement only when the server exposes such a view — SQLite has no server
// process list, so it doesn't implement this port; callers type-assert for
// it, the same pattern BackendCanceller and MessageCapturer use.
type SessionMonitor interface {
	// ListSessions returns every session visible to db's current user,
	// excluding the one db.Conn would hand back for this very call (a
	// listing never reports on itself). Query text is truncated by the
	// implementation to a bounded length before it reaches this struct.
	ListSessions(ctx context.Context, db *sql.DB) ([]ServerSession, error)
}

// FirstNonEmpty returns the first non-blank (after trimming) value, or "".
func FirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// QuoteIdentifiers quotes each name in columns using the given dialect.
func QuoteIdentifiers(dialect QueryDialect, columns []string) []string {
	quoted := make([]string, len(columns))
	for i, c := range columns {
		quoted[i] = dialect.QuoteIdentifier(c)
	}
	return quoted
}

// BuildCreateIndexDDL builds a CREATE INDEX statement using the given
// dialect's identifier quoting. All four current drivers share this exact
// CREATE INDEX shape — only DROP INDEX syntax diverges by dialect, so that
// stays adapter-owned rather than centralized here.
func BuildCreateIndexDDL(dialect QueryDialect, schema, table, indexName string, columns []string, unique bool) string {
	uniqueStr := ""
	if unique {
		uniqueStr = "UNIQUE "
	}
	return fmt.Sprintf("CREATE %sINDEX %s ON %s.%s (%s)",
		uniqueStr,
		dialect.QuoteIdentifier(indexName),
		dialect.QuoteIdentifier(schema),
		dialect.QuoteIdentifier(table),
		strings.Join(QuoteIdentifiers(dialect, columns), ", "))
}

// BuildAddCheckConstraintDDL builds an ADD CONSTRAINT ... CHECK statement.
// expression is raw SQL, not quoted as an identifier. All four current
// drivers share this exact shape — only DROP syntax diverges by dialect.
func BuildAddCheckConstraintDDL(dialect QueryDialect, schema, table, name, expression string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s ADD CONSTRAINT %s CHECK (%s)",
		dialect.QuoteIdentifier(schema), dialect.QuoteIdentifier(table), dialect.QuoteIdentifier(name), expression)
}

// BuildAddUniqueConstraintDDL builds an ADD CONSTRAINT ... UNIQUE statement.
// All four current drivers share this exact shape — only DROP syntax
// diverges by dialect.
func BuildAddUniqueConstraintDDL(dialect QueryDialect, schema, table, name string, columns []string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s ADD CONSTRAINT %s UNIQUE (%s)",
		dialect.QuoteIdentifier(schema), dialect.QuoteIdentifier(table), dialect.QuoteIdentifier(name),
		strings.Join(QuoteIdentifiers(dialect, columns), ", "))
}

// BuildAddPrimaryKeyDDL builds an ADD CONSTRAINT ... PRIMARY KEY statement.
// All four current drivers share this exact shape — only DROP syntax
// diverges by dialect.
func BuildAddPrimaryKeyDDL(dialect QueryDialect, schema, table, name string, columns []string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s ADD CONSTRAINT %s PRIMARY KEY (%s)",
		dialect.QuoteIdentifier(schema), dialect.QuoteIdentifier(table), dialect.QuoteIdentifier(name),
		strings.Join(QuoteIdentifiers(dialect, columns), ", "))
}

// ScanUniqueConstraintRows aggregates (name, column) rows into
// UniqueConstraintInfo values, preserving the order constraints were first
// seen. Shared by every adapter's FetchUniqueConstraints — the row shape is
// identical across dialects even though the query text isn't.
func ScanUniqueConstraintRows(rows *sql.Rows) ([]models.UniqueConstraintInfo, error) {
	constraints := make(map[string]*models.UniqueConstraintInfo)
	var order []string

	for rows.Next() {
		var name, col string
		if err := rows.Scan(&name, &col); err != nil {
			return nil, err
		}
		if _, ok := constraints[name]; !ok {
			constraints[name] = &models.UniqueConstraintInfo{Name: name, Columns: []string{}}
			order = append(order, name)
		}
		constraints[name].Columns = append(constraints[name].Columns, col)
	}

	result := make([]models.UniqueConstraintInfo, 0, len(order))
	for _, name := range order {
		result = append(result, *constraints[name])
	}
	return result, nil
}

// DDLPreviewer is the Port for computing the exact DDL a schema-editor write
// operation will execute, without running it. The write-safety confirmation
// dialog shows this text to the user before they approve the change — each
// Preview* method must return precisely the DDL its corresponding
// create/drop method executes, so the preview and the executed statement can
// never drift apart. Covers only the operations reachable from the schema
// editor UI today (index, check constraint, primary key); unique
// constraints are not yet wired to a UI action, so no preview is needed
// there.
type DDLPreviewer interface {
	PreviewCreateIndexDDL(schema, table, indexName string, columns []string, unique bool) string
	PreviewDropIndexDDL(schema, table, indexName string) string
	PreviewAddCheckConstraintDDL(schema, table, name, expression string) string
	PreviewDropCheckConstraintDDL(schema, table, name string) string
	PreviewAddPrimaryKeyDDL(schema, table, name string, columns []string) string
	PreviewDropPrimaryKeyDDL(schema, table, name string) string
}

// ConstraintEditor is the Port for interactive constraint DDL (schema
// editor): check, unique, and primary-key constraints on a table. All three
// share the same ALTER TABLE ADD/DROP CONSTRAINT family, so they live on one
// port rather than three.
type ConstraintEditor interface {
	// FetchCheckConstraints lists CHECK constraints on a table.
	FetchCheckConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.CheckConstraintInfo, error)
	// CreateCheckConstraint adds a CHECK constraint. expression is raw SQL,
	// not quoted as an identifier.
	CreateCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name, expression string) error
	// DropCheckConstraint drops a CHECK constraint.
	DropCheckConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error

	// FetchUniqueConstraints lists UNIQUE constraints on a table. Drivers
	// without introspection support return an error.
	FetchUniqueConstraints(ctx context.Context, db *sql.DB, schema, table string) ([]models.UniqueConstraintInfo, error)
	// CreateUniqueConstraint adds a UNIQUE constraint over the given columns.
	CreateUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error
	// DropUniqueConstraint drops a UNIQUE constraint.
	DropUniqueConstraint(ctx context.Context, db *sql.DB, schema, table, name string) error

	// FetchPrimaryKey returns a table's primary key, or nil if it has none.
	// Drivers without introspection support return an error.
	FetchPrimaryKey(ctx context.Context, db *sql.DB, schema, table string) (*models.PrimaryKeyInfo, error)
	// AddPrimaryKey adds a primary key over the given columns.
	AddPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string, columns []string) error
	// DropPrimaryKey drops a table's primary key.
	DropPrimaryKey(ctx context.Context, db *sql.DB, schema, table, name string) error
}

// BuildAddForeignKeyDDL builds an ADD CONSTRAINT ... FOREIGN KEY statement.
// Postgres, MySQL, and MSSQL share this exact shape (SQLite does not
// implement foreign-key management — see SupportsForeignKeys) — only DROP
// syntax diverges among the three that do.
func BuildAddForeignKeyDDL(dialect QueryDialect, schema, table string, fk models.ForeignKeyInfo) string {
	ddl := fmt.Sprintf("ALTER TABLE %s.%s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s.%s (%s)",
		dialect.QuoteIdentifier(schema),
		dialect.QuoteIdentifier(table),
		dialect.QuoteIdentifier(fk.Name),
		strings.Join(QuoteIdentifiers(dialect, fk.Columns), ", "),
		dialect.QuoteIdentifier(fk.RefSchema),
		dialect.QuoteIdentifier(fk.RefTable),
		strings.Join(QuoteIdentifiers(dialect, fk.RefColumns), ", "),
	)
	if fk.OnDelete != "" {
		ddl += " ON DELETE " + fk.OnDelete
	}
	if fk.OnUpdate != "" {
		ddl += " ON UPDATE " + fk.OnUpdate
	}
	return ddl
}

// foreignKeyRow is one (constraint, source column, referenced column) row
// from a dialect's foreign-key introspection query.
type foreignKeyRow struct {
	Name      string
	SourceCol string
	RefSchema string
	RefTable  string
	RefCol    string
	OnDelete  string
	OnUpdate  string
}

// ScanForeignKeyRows aggregates foreign-key rows into ForeignKeyInfo values,
// normalizing each dialect's ON DELETE/UPDATE rule spelling and preserving
// the order constraints were first seen. Shared by every adapter's
// FetchForeignKeys — the row shape is identical across dialects even though
// the query text and rule spelling aren't.
func ScanForeignKeyRows(rows *sql.Rows) ([]models.ForeignKeyInfo, error) {
	byName := make(map[string]*models.ForeignKeyInfo)
	var order []string

	for rows.Next() {
		var r foreignKeyRow
		if err := rows.Scan(&r.Name, &r.SourceCol, &r.RefSchema, &r.RefTable, &r.RefCol, &r.OnDelete, &r.OnUpdate); err != nil {
			return nil, err
		}

		entry, ok := byName[r.Name]
		if !ok {
			entry = &models.ForeignKeyInfo{
				Name:       r.Name,
				Columns:    []string{},
				RefSchema:  r.RefSchema,
				RefTable:   r.RefTable,
				RefColumns: []string{},
				OnDelete:   normalizeForeignKeyRule(r.OnDelete),
				OnUpdate:   normalizeForeignKeyRule(r.OnUpdate),
			}
			byName[r.Name] = entry
			order = append(order, r.Name)
		}
		entry.Columns = append(entry.Columns, r.SourceCol)
		entry.RefColumns = append(entry.RefColumns, r.RefCol)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]models.ForeignKeyInfo, 0, len(order))
	for _, name := range order {
		result = append(result, *byName[name])
	}
	return result, nil
}

func normalizeForeignKeyRule(rule string) string {
	normalized := strings.ToUpper(strings.TrimSpace(rule))
	switch normalized {
	case "", "NO_ACTION":
		return "NO ACTION"
	case "RESTRICT":
		return "RESTRICT"
	case "CASCADE":
		return "CASCADE"
	case "SET_NULL":
		return "SET NULL"
	case "SET_DEFAULT":
		return "SET DEFAULT"
	default:
		return strings.ReplaceAll(normalized, "_", " ")
	}
}

// ForeignKeyEditor is the Port for interactive foreign-key DDL (schema
// editor). Create/Drop take a ContextExecutor rather than *sql.DB so callers
// can run both phases of an update (drop old FK, create new FK) inside one
// transaction — orchestration that stays app-side since it's not
// dialect-specific. Implementations must use only the passed exec (never
// open their own connection or transaction), since callers rely on both
// phases sharing one atomic transaction.
type ForeignKeyEditor interface {
	// SupportsForeignKeys reports whether this driver can manage foreign
	// keys at all (SQLite cannot). Callers check this before doing any
	// transactional work, so an unsupported driver never pays the cost of
	// opening and rolling back a transaction just to be told no.
	SupportsForeignKeys() bool
	// FetchForeignKeys lists foreign keys on a table.
	FetchForeignKeys(ctx context.Context, db *sql.DB, schema, table string) ([]models.ForeignKeyInfo, error)
	// CreateForeignKey adds a foreign key. Callers validate fk before calling.
	CreateForeignKey(ctx context.Context, exec ContextExecutor, schema, table string, fk models.ForeignKeyInfo) error
	// DropForeignKey drops a foreign key.
	DropForeignKey(ctx context.Context, exec ContextExecutor, schema, table, constraintName string) error
}

// TableEditor is the Port for interactive table-level DDL (schema editor):
// create/drop/truncate a table, plus a snapshot-flavored DDL fetch used by
// the git-tracking snapshot feature. Distinct from SchemaDiffExtractor's
// FetchTableDDL (schema-diff comparison) — FetchTableDDLForSnapshot may
// format output differently, and git-tracked snapshot files depend on that
// format staying stable, so the two are not unified even though every
// driver implements it identically today (SupportsSnapshotDDL exists so a
// future driver can report false without an app-side driver name check).
// The git-tracking feature itself (schema_snapshot_service.go) is currently
// wired to Postgres only — its table/routine listing SQL is Postgres-
// specific, independent of this port's per-dialect readiness.
type TableEditor interface {
	// BuildCreateTableStatements builds the DDL statement(s) to create a
	// table from a snapshot. Most dialects return one CREATE TABLE
	// statement; Postgres may return several (owned sequences before the
	// table, ALTER SEQUENCE OWNED BY after). Pure — no DB access — so both
	// CreateTable and the schema-diff migration generator can call it.
	BuildCreateTableStatements(schema string, table models.SchemaTableSnapshot) []string
	// CreateTable creates a table from column definitions, running
	// BuildCreateTableStatements's output in one transaction.
	CreateTable(ctx context.Context, db *sql.DB, schema, table string, columns []models.ColumnDef) error
	// DropObject drops a TABLE, VIEW, or INDEX. cascade is rejected for
	// dialects/object types that don't support it.
	DropObject(ctx context.Context, db *sql.DB, schema, objectName, objectType string, cascade bool) error
	// TruncateTable empties a table. cascade/restartIdentity are rejected
	// for dialects that don't support them.
	TruncateTable(ctx context.Context, db *sql.DB, schema, table string, cascade, restartIdentity bool) error
	// SupportsSnapshotDDL reports whether FetchTableDDLForSnapshot is wired
	// up for this driver.
	SupportsSnapshotDDL() bool
	// FetchTableDDLForSnapshot returns authoritative CREATE TABLE DDL for
	// the git-tracking snapshot feature. Formatting is independent of
	// SchemaDiffExtractor.FetchTableDDL by design (see the interface doc).
	FetchTableDDLForSnapshot(ctx context.Context, db *sql.DB, schema, table string) (string, error)
}

// BuildSimpleCreateTableStatement builds a single CREATE TABLE statement
// using the given dialect's identifier quoting. MySQL, MSSQL, and SQLite
// share this exact shape — only Postgres needs multiple statements (owned
// sequences), so it builds its own via normalizeSerialColumns instead of
// calling this helper.
func BuildSimpleCreateTableStatement(dialect QueryDialect, schema string, table models.SchemaTableSnapshot) string {
	var colDDLs []string
	var pkCols []string

	for _, col := range table.Columns {
		colDDL := dialect.QuoteIdentifier(col.Name) + " " + FirstNonEmpty(col.FullDataType, col.DataType)
		if !col.IsNullable {
			colDDL += " NOT NULL"
		}
		if col.DefaultValue != "" {
			colDDL += " DEFAULT " + col.DefaultValue
		}
		colDDLs = append(colDDLs, colDDL)

		if col.IsPrimaryKey {
			pkCols = append(pkCols, dialect.QuoteIdentifier(col.Name))
		}
	}

	ddl := "CREATE TABLE " + dialect.QuoteIdentifier(schema) + "." + dialect.QuoteIdentifier(table.Name) + " (\n"
	ddl += strings.Join(colDDLs, ",\n")
	if len(pkCols) > 0 {
		ddl += ",\n  PRIMARY KEY (" + strings.Join(pkCols, ", ") + ")"
	}
	ddl += "\n);"

	return ddl
}

// RunStatementsInTx runs statements in one transaction, rolling back on the
// first error. Shared by every adapter's CreateTable.
func RunStatementsInTx(ctx context.Context, db *sql.DB, statements []string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ReferenceProber is the Port for asking whether rows of a table still
// reference a set of key values, so a delete can be checked against the data
// (not just the schema) before it is attempted.
type ReferenceProber interface {
	// CountReferencingRows counts up to limit rows of schema.table whose
	// columns match any tuple in keys, and reports whether more exist. Keys
	// go through as bound parameters; callers keep len(keys)*len(columns)
	// within MaxBindParams.
	CountReferencingRows(ctx context.Context, db *sql.DB, schema, table string, columns []string, keys [][]string, limit int) (count int64, hasMore bool, err error)
}

// The ports below back the MCP "read and check" tools (spec section 3).
// None is part of DatabaseDriver. A driver that does not implement a port
// is not an error — the app type-asserts and answers UNSUPPORTED_DRIVER,
// the same pattern BackendCanceller already uses. T5.x wires SQLite, MySQL,
// and SQL Server; cells the spec marks "Chưa" stay denied at the tool layer.

// SQLValidator checks one statement against the schema without running it.
type SQLValidator interface {
	// ValidateStatement checks stmt alone. A caller with several statements
	// (tokenized by internal/db) calls this once per statement and
	// assembles its own statements[] array; the port never splits input.
	ValidateStatement(ctx context.Context, db *sql.DB, schema, stmt string) (models.MCPValidationResult, error)
}

// PlanExplainer returns a statement's estimated plan without running it.
type PlanExplainer interface {
	ExplainStatement(ctx context.Context, db *sql.DB, schema, stmt string) (models.MCPPlanSummary, error)
}

// DependencyReader builds the graph of what an object depends on, or what
// depends on it.
type DependencyReader interface {
	ReadDependencies(ctx context.Context, db *sql.DB, schema string, q models.MCPDependencyQuery) (models.MCPDependencyGraph, error)
}

// TableStatsReader reads a table's stored size and activity statistics,
// never a sample of its rows.
type TableStatsReader interface {
	ReadTableStats(ctx context.Context, db *sql.DB, schema, table string, withColumns bool) (models.MCPTableStats, error)
}

// IndexReader lists a table's (or a schema's, when table is empty) indexes
// with enough detail for a caller to flag a missing, duplicate, unused, or
// invalid one. The port only reports facts; it draws no conclusions.
type IndexReader interface {
	ReadIndexes(ctx context.Context, db *sql.DB, schema, table string) ([]models.MCPIndexInfo, error)
}

// TableDetailsReader reads what describe_table adds to the catalog: table
// and column comments, identity and generated columns, triggers (name and
// event only), and partitioning. An unknown table wraps ErrObjectNotFound.
type TableDetailsReader interface {
	ReadTableDetails(ctx context.Context, db *sql.DB, schema, table string) (models.MCPTableDetails, error)
}

// ReadOnlyRunner runs one SELECT (already token-filtered by the caller) in a
// read-only transaction on a dedicated connection, then always rolls back.
type ReadOnlyRunner interface {
	RunReadOnly(ctx context.Context, db *sql.DB, q models.MCPReadOnlyQuery) (models.MCPReadOnlyResult, error)
}

// DryRunner runs statements in a real transaction on a dedicated connection
// and always rolls back. Constraint failures are data, not a port error.
type DryRunner interface {
	RunDry(ctx context.Context, db *sql.DB, q models.MCPDryRunQuery) (models.MCPDryRunResult, error)
}

// DatabaseDriver is the full extension point: Connector + SchemaFetcher + QueryDialect + SchemaDiffExtractor + CatalogDetailsFetcher + IndexEditor + ConstraintEditor + ForeignKeyEditor + TableEditor + DDLPreviewer + ReferenceProber.
// Callers that only need connection should accept Connector; only schema → SchemaFetcher.
type DatabaseDriver interface {
	Connector
	SchemaFetcher
	QueryDialect
	SchemaDiffExtractor
	CatalogDetailsFetcher
	IndexEditor
	ConstraintEditor
	ForeignKeyEditor
	TableEditor
	DDLPreviewer
	ReferenceProber
}
