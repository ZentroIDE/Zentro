// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func testSQLiteDB(t *testing.T) *sql.DB {
	t.Helper()
	name := strings.ReplaceAll(t.Name(), "/", "_")
	db, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestValidateStatementAcceptsKnownSelectAndRejectsMissingTable(t *testing.T) {
	db := testSQLiteDB(t)
	if _, err := db.Exec(`CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT)`); err != nil {
		t.Fatal(err)
	}
	d := New()
	ctx := context.Background()
	ok, err := d.ValidateStatement(ctx, db, "main", "SELECT id FROM customers")
	if err != nil {
		t.Fatal(err)
	}
	if !ok.Valid || ok.CheckedBy != "database" {
		t.Fatalf("%+v", ok)
	}
	bad, err := d.ValidateStatement(ctx, db, "main", "SELECT id FROM missing_table")
	if err != nil {
		t.Fatal(err)
	}
	if bad.Valid || len(bad.UnknownObjects) == 0 || bad.UnknownObjects[0].Kind != "table" {
		t.Fatalf("missing table should be unknown: %+v", bad)
	}
}

func TestValidateStatementCatchesUnbalancedDDL(t *testing.T) {
	d := New()
	got, err := d.ValidateStatement(context.Background(), testSQLiteDB(t), "main", "CREATE TABLE t(id int")
	if err != nil {
		t.Fatal(err)
	}
	if got.Valid || got.CheckedBy != "tokens" {
		t.Fatalf("%+v", got)
	}
}

func TestExplainStatementReportsAScanWithoutCost(t *testing.T) {
	db := testSQLiteDB(t)
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER)`); err != nil {
		t.Fatal(err)
	}
	d := New()
	plan, err := d.ExplainStatement(context.Background(), db, "main", "SELECT * FROM t")
	if err != nil {
		t.Fatal(err)
	}
	if plan.TotalCost != 0 || plan.EstRows != 0 {
		t.Fatalf("SQLite has no cost/rows: %+v", plan)
	}
	if len(plan.TablesTouched) == 0 {
		t.Fatalf("expected a table access: %+v", plan)
	}
}

func TestReadTableStatsLeavesEstRowsNilUntilAnalyze(t *testing.T) {
	db := testSQLiteDB(t)
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER, name TEXT)`); err != nil {
		t.Fatal(err)
	}
	d := New()
	before, err := d.ReadTableStats(context.Background(), db, "main", "t", true)
	if err != nil {
		t.Fatal(err)
	}
	if before.EstRows != nil {
		t.Fatalf("estRows should be nil before ANALYZE: %+v", before)
	}
	if _, err := db.Exec(`INSERT INTO t VALUES (1, 'a')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`ANALYZE`); err != nil {
		t.Fatal(err)
	}
	after, err := d.ReadTableStats(context.Background(), db, "main", "t", true)
	if err != nil {
		t.Fatal(err)
	}
	if after.EstRows == nil || *after.EstRows < 1 {
		t.Fatalf("estRows after ANALYZE: %+v", after)
	}
}

func TestReadIndexesListsUniqueIndexAndDoesNotClaimScans(t *testing.T) {
	db := testSQLiteDB(t)
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE UNIQUE INDEX t_name ON t(name)`); err != nil {
		t.Fatal(err)
	}
	d := New()
	idx, err := d.ReadIndexes(context.Background(), db, "main", "t")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, i := range idx {
		if i.Name == "t_name" {
			found = true
			if !i.Unique || i.Scans != -1 {
				t.Fatalf("scans must be unknown on SQLite: %+v", i)
			}
		}
	}
	if !found {
		t.Fatalf("missing t_name: %+v", idx)
	}
}

func TestReadDependenciesWalksForeignKeys(t *testing.T) {
	db := testSQLiteDB(t)
	stmts := []string{
		`CREATE TABLE customers (id INTEGER PRIMARY KEY)`,
		`CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id))`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatal(err)
		}
	}
	d := New()
	graph, err := d.ReadDependencies(context.Background(), db, "main", models.MCPDependencyQuery{
		Object: "customers", Direction: "dependents", Depth: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range graph.Edges {
		if e.From == "orders" && e.To == "customers" && e.Via == "fk" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected orders -> customers fk: %+v", graph)
	}
}

func TestReadTableDetailsIncludesTriggerNames(t *testing.T) {
	db := testSQLiteDB(t)
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER t_ins AFTER INSERT ON t BEGIN SELECT 1; END`); err != nil {
		t.Fatal(err)
	}
	d := New()
	det, err := d.ReadTableDetails(context.Background(), db, "main", "t")
	if err != nil {
		t.Fatal(err)
	}
	if len(det.Triggers) != 1 || det.Triggers[0].Name != "t_ins" {
		t.Fatalf("%+v", det)
	}
}

func TestReadOnlyQueryStillRollsBack(t *testing.T) {
	db := testSQLiteDB(t)
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER)`); err != nil {
		t.Fatal(err)
	}
	d := New()
	out, err := d.RunReadOnly(context.Background(), db, models.MCPReadOnlyQuery{
		SQL: "SELECT 1 AS n", MaxRows: 10, Timeout: 5 * time.Second, Schema: "main",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 1 {
		t.Fatalf("%+v", out)
	}
}

var _ driver.SQLValidator = (*SQLiteDriver)(nil)
var _ driver.PlanExplainer = (*SQLiteDriver)(nil)
var _ driver.TableStatsReader = (*SQLiteDriver)(nil)
var _ driver.IndexReader = (*SQLiteDriver)(nil)
var _ driver.DependencyReader = (*SQLiteDriver)(nil)
var _ driver.TableDetailsReader = (*SQLiteDriver)(nil)
