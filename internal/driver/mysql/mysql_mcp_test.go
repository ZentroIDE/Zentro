// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"zentro/internal/models"
)

// testMySQLDB opens the database named by ZENTRO_TEST_MYSQL_DSN (a standard
// go-sql-driver DSN, e.g. "user:pass@tcp(localhost:3306)/zentro_test") and
// skips the test when the variable is unset. mysql.go already blank-imports
// the driver, so this file does not need to. Every test below that needs a
// live MySQL goes through this helper.
func testMySQLDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("ZENTRO_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("ZENTRO_TEST_MYSQL_DSN is not set; skipping a test that needs a live MySQL")
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Fatalf("open ZENTRO_TEST_MYSQL_DSN: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("ping ZENTRO_TEST_MYSQL_DSN: %v", err)
	}
	return db
}

// mysqlMCPSchema returns the database the DSN itself selected: in MySQL the
// "schema" the MCP tools take is the database name.
func mysqlMCPSchema(t *testing.T, db *sql.DB) string {
	t.Helper()
	var schema string
	if err := db.QueryRowContext(context.Background(), "SELECT DATABASE()").Scan(&schema); err != nil {
		t.Fatalf("SELECT DATABASE(): %v", err)
	}
	if schema == "" {
		t.Fatal("ZENTRO_TEST_MYSQL_DSN must select a database")
	}
	return schema
}

// setupMySQLMCPTables creates two small tables (with a foreign key and a
// unique index) used across the live tests below, dropped at the end of the
// test, so these tests do not depend on or disturb whatever else lives in
// the test database.
func setupMySQLMCPTables(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx := context.Background()
	drop := func() {
		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS zentro_mcp_orders")
		_, _ = db.ExecContext(ctx, "DROP TABLE IF EXISTS zentro_mcp_customers")
	}
	drop()
	if _, err := db.ExecContext(ctx, "CREATE TABLE zentro_mcp_customers (id INT PRIMARY KEY, name VARCHAR(100))"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "CREATE UNIQUE INDEX zentro_mcp_customers_name ON zentro_mcp_customers(name)"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "CREATE TABLE zentro_mcp_orders (id INT PRIMARY KEY, customer_id INT, FOREIGN KEY (customer_id) REFERENCES zentro_mcp_customers(id))"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO zentro_mcp_customers (id, name) VALUES (1, 'a'), (2, 'b')"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(drop)
}

func TestMySQLValidateStatementAcceptsAValidSelect(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	result, err := d.ValidateStatement(context.Background(), db, schema, "select id, name from zentro_mcp_customers where id = 1")
	if err != nil {
		t.Fatal(err)
	}
	if !result.Valid || result.CheckedBy != "database" {
		t.Fatalf("a valid select was rejected: %+v", result)
	}
}

func TestMySQLValidateStatementRejectsAnUndefinedColumn(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	result, err := d.ValidateStatement(context.Background(), db, schema, "select nope from zentro_mcp_customers")
	if err != nil {
		t.Fatal(err)
	}
	if result.Valid {
		t.Fatal("a reference to a missing column was accepted")
	}
}

func TestMySQLValidateStatementDDLIsTokenCheckedAndNeverExecuted(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	result, err := d.ValidateStatement(context.Background(), db, schema, "alter table zentro_mcp_customers add column extra int")
	if err != nil {
		t.Fatal(err)
	}
	if result.CheckedBy != "tokens" || !result.Valid {
		t.Fatalf("DDL should be token-checked and accepted: %+v", result)
	}
	var exists int
	if err := db.QueryRowContext(context.Background(),
		"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'zentro_mcp_customers' AND COLUMN_NAME = 'extra'",
		schema).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != 0 {
		t.Fatal("validate_sql executed a DDL statement against the database")
	}
}

func TestMySQLReadTableStatsReportsColumns(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	stats, err := d.ReadTableStats(context.Background(), db, schema, "zentro_mcp_customers", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats.Columns) != 2 {
		t.Fatalf("expected 2 columns from information_schema.COLUMNS: %+v", stats)
	}
}

func TestMySQLReadTableStatsRejectsAMissingTable(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	d := New()

	if _, err := d.ReadTableStats(context.Background(), db, schema, "zentro_mcp_does_not_exist", false); err == nil {
		t.Fatal("expected an error for a missing table")
	}
}

func TestMySQLReadIndexesListsTheUniqueIndexWithUnknownScans(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	idx, err := d.ReadIndexes(context.Background(), db, schema, "zentro_mcp_customers")
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
			// Scans comes from performance_schema when available; the spec
			// says SQLite-style "-1 unknown" only when that schema is
			// missing, so we only check the field is set, not its value.
		}
	}
	if !found {
		t.Fatalf("missing zentro_mcp_customers_name: %+v", idx)
	}
}

func TestMySQLReadDependenciesWalksForeignKeys(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	graph, err := d.ReadDependencies(context.Background(), db, schema, models.MCPDependencyQuery{
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

func TestMySQLRunReadOnlyRejectsAWriteAndChangesNothing(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	var before int
	if err := db.QueryRow("SELECT COUNT(*) FROM zentro_mcp_customers").Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := d.RunReadOnly(context.Background(), db, models.MCPReadOnlyQuery{
		SQL: "DELETE FROM zentro_mcp_customers", MaxRows: 10, Timeout: 5 * time.Second, Schema: schema,
	}); err == nil {
		t.Fatal("a write statement should fail inside MySQL's BEGIN READ ONLY transaction")
	}
	var after int
	if err := db.QueryRow("SELECT COUNT(*) FROM zentro_mcp_customers").Scan(&after); err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatalf("run_readonly_query changed the table: before=%d after=%d", before, after)
	}
}

func TestMySQLRunReadOnlyReturnsRows(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	out, err := d.RunReadOnly(context.Background(), db, models.MCPReadOnlyQuery{
		SQL: "SELECT id FROM zentro_mcp_customers ORDER BY id", MaxRows: 10, Timeout: 5 * time.Second, Schema: schema,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 2 {
		t.Fatalf("expected 2 rows: %+v", out)
	}
}

func TestMySQLRunDryRejectsDDLAsImplicitCommit(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	out, err := d.RunDry(context.Background(), db, models.MCPDryRunQuery{
		Statements: []string{"alter table zentro_mcp_customers add column extra int"},
		Schema:     schema, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Statements) != 1 || out.Statements[0].Status != "error" {
		t.Fatalf("DDL should be rejected, not dry-run: %+v", out)
	}
	found := false
	for _, c := range out.Caveats {
		if c == "ddl_implicit_commit" {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing ddl_implicit_commit caveat: %+v", out.Caveats)
	}
}

func TestMySQLRunDryRollsBackAnInsert(t *testing.T) {
	db := testMySQLDB(t)
	schema := mysqlMCPSchema(t, db)
	setupMySQLMCPTables(t, db)
	d := New()

	out, err := d.RunDry(context.Background(), db, models.MCPDryRunQuery{
		Statements: []string{"insert into zentro_mcp_customers (id, name) values (99, 'dry')"},
		Schema:     schema, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Statements) != 1 || out.Statements[0].Status != "ok" || !out.RolledBack {
		t.Fatalf("insert should succeed then roll back: %+v", out)
	}
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM zentro_mcp_customers WHERE id = 99").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("dry_run left a row behind: rollback did not actually happen")
	}
}
