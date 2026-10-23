// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

// A real EXPLAIN (FORMAT JSON) output for a seq scan feeding a nested loop
// into an index scan, trimmed to the fields parseExplainPlanJSON reads.
const fixtureSeqScanJoinIndexScan = `[
  {
    "Plan": {
      "Node Type": "Nested Loop",
      "Total Cost": 847.50,
      "Plan Rows": 1200,
      "Plans": [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Alias": "orders",
          "Total Cost": 230.00,
          "Plan Rows": 1200,
          "Filter": "(status = 'open'::text)"
        },
        {
          "Node Type": "Index Scan",
          "Relation Name": "customers",
          "Alias": "customers",
          "Index Name": "customers_pkey",
          "Total Cost": 0.29,
          "Plan Rows": 1,
          "Index Cond": "(id = orders.customer_id)"
        }
      ]
    }
  }
]`

func TestParseExplainPlanJSONReadsTheRootAndEachScan(t *testing.T) {
	summary, err := parseExplainPlanJSON(fixtureSeqScanJoinIndexScan)
	if err != nil {
		t.Fatalf("parseExplainPlanJSON: %v", err)
	}
	if summary.TopNode != "Nested Loop" {
		t.Fatalf("TopNode = %q, want Nested Loop", summary.TopNode)
	}
	if summary.TotalCost != 847.50 {
		t.Fatalf("TotalCost = %v, want 847.50", summary.TotalCost)
	}
	if summary.EstRows != 1200 {
		t.Fatalf("EstRows = %d, want 1200", summary.EstRows)
	}
	if summary.RawPlanJSON != fixtureSeqScanJoinIndexScan {
		t.Fatal("RawPlanJSON was not kept verbatim")
	}
	if len(summary.TablesTouched) != 2 {
		t.Fatalf("got %d tables touched, want 2: %+v", len(summary.TablesTouched), summary.TablesTouched)
	}
	byTable := map[string]string{}
	for _, tt := range summary.TablesTouched {
		byTable[tt.Table] = tt.Access
	}
	if byTable["orders"] != "seq_scan" {
		t.Fatalf("orders access = %q, want seq_scan", byTable["orders"])
	}
	if byTable["customers"] != "index_scan" {
		t.Fatalf("customers access = %q, want index_scan", byTable["customers"])
	}
}

func TestParseExplainPlanJSONIgnoresNonScanNodes(t *testing.T) {
	raw := `[{"Plan":{"Node Type":"Aggregate","Total Cost":10,"Plan Rows":1,"Plans":[{"Node Type":"Sort","Total Cost":9,"Plan Rows":5}]}}]`
	summary, err := parseExplainPlanJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.TablesTouched) != 0 {
		t.Fatalf("a non-scan node was reported as a table access: %+v", summary.TablesTouched)
	}
}

func TestParseExplainPlanJSONDedupsTheSameAccessOnTheSameTable(t *testing.T) {
	raw := `[{"Plan":{"Node Type":"Append","Total Cost":10,"Plan Rows":2,"Plans":[
		{"Node Type":"Seq Scan","Relation Name":"orders","Total Cost":5,"Plan Rows":1},
		{"Node Type":"Seq Scan","Relation Name":"orders","Total Cost":5,"Plan Rows":1}
	]}}]`
	summary, err := parseExplainPlanJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.TablesTouched) != 1 {
		t.Fatalf("the same table/access pair was not deduped: %+v", summary.TablesTouched)
	}
}

func TestParseExplainPlanJSONOnInvalidJSON(t *testing.T) {
	if _, err := parseExplainPlanJSON("not json"); err == nil {
		t.Fatal("expected an error for invalid plan JSON")
	}
}

func TestExplainAccessKindMapsKnownNodeTypes(t *testing.T) {
	cases := map[string]string{
		"Seq Scan":          "seq_scan",
		"Index Scan":        "index_scan",
		"Index Only Scan":   "index_only",
		"Bitmap Heap Scan":  "bitmap",
		"Bitmap Index Scan": "bitmap",
		"Hash Join":         "",
		"Nested Loop":       "",
	}
	for nodeType, want := range cases {
		if got := explainAccessKind(nodeType); got != want {
			t.Errorf("explainAccessKind(%q) = %q, want %q", nodeType, got, want)
		}
	}
}

// --- Live Postgres: ExplainStatement end to end ---

func TestExplainStatement_SeqScanOnARealTable(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupExplainSchema(t, sqlDB)
	drv := New()

	summary, err := drv.ExplainStatement(context.Background(), sqlDB, schema, "select * from zentro_mcp_explain_t1 where id = 1")
	if err != nil {
		t.Fatalf("ExplainStatement: %v", err)
	}
	if summary.TopNode == "" {
		t.Fatal("TopNode is empty")
	}
	found := false
	for _, tt := range summary.TablesTouched {
		if tt.Table == "zentro_mcp_explain_t1" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the table was not reported as touched: %+v", summary.TablesTouched)
	}
}

func TestExplainStatement_NothingIsEverExecuted(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupExplainSchema(t, sqlDB)
	drv := New()

	var before int
	if err := sqlDB.QueryRow("select count(*) from " + schema + ".zentro_mcp_explain_t1").Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := drv.ExplainStatement(context.Background(), sqlDB, schema, "delete from zentro_mcp_explain_t1"); err != nil {
		t.Fatal(err)
	}
	var after int
	if err := sqlDB.QueryRow("select count(*) from " + schema + ".zentro_mcp_explain_t1").Scan(&after); err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatalf("explain_plan changed the table: before=%d after=%d", before, after)
	}
}

func TestExplainStatement_RejectsNestedExplain(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupExplainSchema(t, sqlDB)
	drv := New()

	// The tool layer (T2.3) is the real guard; this confirms the fallback
	// safety property this file's doc comment describes: a nested EXPLAIN
	// is a syntax error, never a run of ANALYZE.
	_, err := drv.ExplainStatement(context.Background(), sqlDB, schema, "explain analyze delete from zentro_mcp_explain_t1")
	if err == nil {
		t.Fatal("expected a syntax error from nesting EXPLAIN")
	}
	if strings.Contains(strings.ToLower(err.Error()), "password") {
		t.Fatalf("an unexpected secret leaked into the error: %v", err)
	}
}

func setupExplainSchema(t *testing.T, sqlDB *sql.DB) string {
	t.Helper()
	schema := "zentro_mcp_explain_test"
	ctx := context.Background()
	if _, err := sqlDB.ExecContext(ctx, "drop schema if exists "+schema+" cascade"); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.ExecContext(ctx, "create schema "+schema); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.ExecContext(ctx, "create table "+schema+".zentro_mcp_explain_t1 (id int primary key, name text)"); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.ExecContext(ctx, "insert into "+schema+".zentro_mcp_explain_t1 (id, name) values (1, 'a'), (2, 'b')"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade")
	})
	return schema
}
