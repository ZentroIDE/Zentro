// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"zentro/internal/models"

	// main.go blank-imports this for the running app; a test run of this
	// package alone needs its own import to register the "sqlserver" name.
	_ "github.com/microsoft/go-mssqldb"
)

// testMSSQLDB opens the database named by ZENTRO_TEST_MSSQL_DSN (a standard
// sqlserver:// DSN, e.g. "sqlserver://user:pass@localhost:1433?database=zentro_test")
// and skips the test when the variable is unset. Every test below that
// needs a live SQL Server goes through this helper.
func testMSSQLDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("ZENTRO_TEST_MSSQL_DSN")
	if dsn == "" {
		t.Skip("ZENTRO_TEST_MSSQL_DSN is not set; skipping a test that needs a live SQL Server")
	}
	db, err := sql.Open("sqlserver", dsn)
	if err != nil {
		t.Fatalf("open ZENTRO_TEST_MSSQL_DSN: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("ping ZENTRO_TEST_MSSQL_DSN: %v", err)
	}
	return db
}

// mssqlMCPSchema is the fixed schema these tests create their tables in.
// ZENTRO_TEST_MSSQL_DSN must select a database where this user can create
// and drop tables in dbo.
const mssqlMCPSchema = "dbo"

// setupMSSQLMCPTables creates two small tables (with a foreign key and a
// unique index) used across the live tests below, dropped at the end of the
// test, so these tests do not depend on or disturb whatever else lives in
// the test database.
func setupMSSQLMCPTables(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx := context.Background()
	drop := func() {
		_, _ = db.ExecContext(ctx, "IF OBJECT_ID('dbo.zentro_mcp_orders', 'U') IS NOT NULL DROP TABLE dbo.zentro_mcp_orders")
		_, _ = db.ExecContext(ctx, "IF OBJECT_ID('dbo.zentro_mcp_customers', 'U') IS NOT NULL DROP TABLE dbo.zentro_mcp_customers")
	}
	drop()
	if _, err := db.ExecContext(ctx, "CREATE TABLE dbo.zentro_mcp_customers (id INT PRIMARY KEY, name NVARCHAR(100))"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "CREATE UNIQUE INDEX zentro_mcp_customers_name ON dbo.zentro_mcp_customers(name)"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "CREATE TABLE dbo.zentro_mcp_orders (id INT PRIMARY KEY, customer_id INT REFERENCES dbo.zentro_mcp_customers(id))"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO dbo.zentro_mcp_customers (id, name) VALUES (1, 'a'), (2, 'b')"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(drop)
}

func TestMSSQLValidateStatementIsTokenCheckedOnlyEvenForASelect(t *testing.T) {
	db := testMSSQLDB(t)
	setupMSSQLMCPTables(t, db)
	d := New()

	// The spec marks SQL Server validate_sql "Một phần (token)": unlike
	// MySQL/SQLite it never prepares against the database, even for a
	// plain SELECT, so a reference to a column that does not exist is
	// accepted at the token level.
	result, err := d.ValidateStatement(context.Background(), db, mssqlMCPSchema, "select nope from zentro_mcp_customers")
	if err != nil {
		t.Fatal(err)
	}
	if result.CheckedBy != "tokens" {
		t.Fatalf("SQL Server validate_sql must be token-only: %+v", result)
	}
	if !result.Valid {
		t.Fatalf("a well-formed (if semantically wrong) select must still pass token checking: %+v", result)
	}
}

func TestMSSQLValidateStatementCatchesUnbalancedDDLAtTokenLevel(t *testing.T) {
	db := testMSSQLDB(t)
	d := New()

	result, err := d.ValidateStatement(context.Background(), db, mssqlMCPSchema, "create table t(id int")
	if err != nil {
		t.Fatal(err)
	}
	if result.Valid {
		t.Fatal("an unclosed paren was accepted")
	}
}

func TestMSSQLReadTableStatsReportsColumns(t *testing.T) {
	db := testMSSQLDB(t)
	setupMSSQLMCPTables(t, db)
	d := New()

	stats, err := d.ReadTableStats(context.Background(), db, mssqlMCPSchema, "zentro_mcp_customers", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats.Columns) != 2 {
		t.Fatalf("expected 2 columns from sys.columns: %+v", stats)
	}
}

func TestMSSQLReadTableStatsRejectsAMissingTable(t *testing.T) {
	db := testMSSQLDB(t)
	d := New()

	if _, err := d.ReadTableStats(context.Background(), db, mssqlMCPSchema, "zentro_mcp_does_not_exist", false); err == nil {
		t.Fatal("expected an error for a missing table")
	}
}

func TestMSSQLReadIndexesListsTheUniqueIndex(t *testing.T) {
	db := testMSSQLDB(t)
	setupMSSQLMCPTables(t, db)
	d := New()

	idx, err := d.ReadIndexes(context.Background(), db, mssqlMCPSchema, "zentro_mcp_customers")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, i := range idx {
		if i.Name == "zentro_mcp_customers_name" {
			found = true
			if !i.Unique {
				t.Fatalf("expected a unique index: %+v", i)
			}
			// sys.dm_db_index_usage_stats only has a row once the index has
			// actually been used this session, so Scans may legitimately be
			// 0 here; the spec claims the source, not a nonzero count.
		}
	}
	if !found {
		t.Fatalf("missing zentro_mcp_customers_name: %+v", idx)
	}
}

func TestMSSQLReadDependenciesWalksForeignKeys(t *testing.T) {
	db := testMSSQLDB(t)
	setupMSSQLMCPTables(t, db)
	d := New()

	graph, err := d.ReadDependencies(context.Background(), db, mssqlMCPSchema, models.MCPDependencyQuery{
		Object: "zentro_mcp_customers", Direction: "dependents", Depth: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range graph.Edges {
		if e.From == "zentro_mcp_orders" && e.To == "zentro_mcp_customers" && e.Via == "fk" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected zentro_mcp_orders -> zentro_mcp_customers fk: %+v", graph)
	}
}

func TestMSSQLRunReadOnlyRollsBackAndNeverWrites(t *testing.T) {
	db := testMSSQLDB(t)
	setupMSSQLMCPTables(t, db)
	d := New()

	var before int
	if err := db.QueryRow("SELECT COUNT(*) FROM dbo.zentro_mcp_customers").Scan(&before); err != nil {
		t.Fatal(err)
	}
	// SQL Server has no read-only transaction mode (the spec's "Transaction
	// thường + rollback"), so run_readonly_query relies on the caller never
	// sending a write and on the always-rollback below to undo it if one
	// slips through.
	out, err := d.RunReadOnly(context.Background(), db, models.MCPReadOnlyQuery{
		SQL: "SELECT id FROM dbo.zentro_mcp_customers ORDER BY id", MaxRows: 10, Timeout: 5 * time.Second, Schema: mssqlMCPSchema,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 2 {
		t.Fatalf("expected 2 rows: %+v", out)
	}
	if len(out.Warnings) == 0 {
		t.Fatal("run_readonly_query must warn that SQL Server has no read-only transaction")
	}
	var after int
	if err := db.QueryRow("SELECT COUNT(*) FROM dbo.zentro_mcp_customers").Scan(&after); err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatalf("run_readonly_query changed the table: before=%d after=%d", before, after)
	}
}

func TestMSSQLRunDryRollsBackDDLAndDML(t *testing.T) {
	db := testMSSQLDB(t)
	setupMSSQLMCPTables(t, db)
	d := New()

	// Unlike MySQL, SQL Server DDL (other than CREATE DATABASE) runs inside
	// a transaction and rolls back cleanly, per the spec's "Rollback;
	// CREATE DATABASE không vào transaction".
	out, err := d.RunDry(context.Background(), db, models.MCPDryRunQuery{
		Statements: []string{
			"alter table dbo.zentro_mcp_customers add extra int",
			"insert into dbo.zentro_mcp_customers (id, name) values (99, 'dry')",
		},
		Schema: mssqlMCPSchema, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Statements) != 2 {
		t.Fatalf("expected both statements to run: %+v", out)
	}
	for _, s := range out.Statements {
		if s.Status != "ok" {
			t.Fatalf("statement %d should have run: %+v", s.N, s)
		}
	}
	if !out.RolledBack {
		t.Fatalf("dry_run must report it rolled back: %+v", out)
	}
	var exists int
	if err := db.QueryRowContext(context.Background(),
		"SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.zentro_mcp_customers') AND name = 'extra'").
		Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != 0 {
		t.Fatal("dry_run left the ALTER TABLE column behind: rollback did not actually happen")
	}
	var rows int
	if err := db.QueryRow("SELECT COUNT(*) FROM dbo.zentro_mcp_customers WHERE id = 99").Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Fatal("dry_run left the inserted row behind: rollback did not actually happen")
	}
}
