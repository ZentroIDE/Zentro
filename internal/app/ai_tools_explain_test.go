// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/core"
	"zentro/internal/models"
)

const fixtureExplainFlagPlan = `[
  {
    "Plan": {
      "Node Type": "Nested Loop",
      "Total Cost": 999,
      "Plan Rows": 1500,
      "Plans": [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Total Cost": 500,
          "Plan Rows": 20000,
          "Filter": "(status = 'open'::text)"
        },
        {
          "Node Type": "Index Scan",
          "Relation Name": "customers",
          "Index Name": "customers_pkey",
          "Total Cost": 1,
          "Plan Rows": 1
        }
      ]
    }
  }
]`

func TestWalkExplainFlagsFindsSeqScanLargeAndNestedLoopLarge(t *testing.T) {
	roots, err := decodeExplainFlagRoots(fixtureExplainFlagPlan)
	if err != nil {
		t.Fatal(err)
	}
	flags := walkExplainFlags(roots[0].Plan, defaultExplainPlanThresholds)
	byType := map[string]aiPlanFlagDTO{}
	for _, f := range flags {
		byType[f.Type] = f
	}
	seq, ok := byType["seq_scan_large"]
	if !ok || seq.Table != "orders" {
		t.Fatalf("seq_scan_large not found or wrong table: %+v", flags)
	}
	nested, ok := byType["nested_loop_large"]
	if !ok || nested.Table != "orders" {
		t.Fatalf("nested_loop_large not found or wrong table: %+v", flags)
	}
}

func TestWalkExplainFlagsIgnoresASmallSeqScanAndASmallNestedLoop(t *testing.T) {
	raw := `[{"Plan":{"Node Type":"Nested Loop","Total Cost":1,"Plan Rows":5,"Plans":[
		{"Node Type":"Seq Scan","Relation Name":"t","Total Cost":1,"Plan Rows":5,"Filter":"(a = 1)"},
		{"Node Type":"Index Scan","Relation Name":"u","Total Cost":1,"Plan Rows":1}
	]}}]`
	roots, err := decodeExplainFlagRoots(raw)
	if err != nil {
		t.Fatal(err)
	}
	flags := walkExplainFlags(roots[0].Plan, defaultExplainPlanThresholds)
	if len(flags) != 0 {
		t.Fatalf("small scans should not flag: %+v", flags)
	}
}

func TestWalkExplainFlagsIgnoresASeqScanWithoutAFilter(t *testing.T) {
	raw := `[{"Plan":{"Node Type":"Seq Scan","Relation Name":"t","Total Cost":1,"Plan Rows":50000}}]`
	roots, err := decodeExplainFlagRoots(raw)
	if err != nil {
		t.Fatal(err)
	}
	flags := walkExplainFlags(roots[0].Plan, defaultExplainPlanThresholds)
	if len(flags) != 0 {
		t.Fatalf("a seq scan with no filter should not flag seq_scan_large: %+v", flags)
	}
}

func TestNormalizePlanJSONStringsRewritesOnlyKnownFilterKeys(t *testing.T) {
	raw := `{"Plan":{"Node Type":"Seq Scan","Relation Name":"orders","Filter":"(status = 'open'::text AND id > 5)","Alias":"orders"}}`
	out := normalizePlanJSONStrings(raw)
	if strings.Contains(out, "'open'") || strings.Contains(out, "> 5") {
		t.Fatalf("Filter literals were not normalized: %s", out)
	}
	if !strings.Contains(out, `"Alias":"orders"`) {
		t.Fatalf("a non-filter key was altered: %s", out)
	}
}

func TestNormalizePlanJSONStringsOnInvalidJSONReturnsItUnchanged(t *testing.T) {
	if got := normalizePlanJSONStrings("not json"); got != "not json" {
		t.Fatalf("got %q", got)
	}
}

func TestExplainPlanRejectsASQLStartingWithExplain(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "explain_plan", `{"sql":"explain select 1"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeSQLNotAllowed {
		t.Fatalf("expected SQL_NOT_ALLOWED, got %s", out.Content)
	}
}

func TestExplainPlanRejectsMultipleStatements(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "explain_plan", `{"sql":"select 1; select 2"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeSQLUnsupported {
		t.Fatalf("expected SQL_UNSUPPORTED, got %s", out.Content)
	}
}

func TestExplainPlanRejectsAnUnsupportedLeadingKeyword(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "explain_plan", `{"sql":"create table t(id int)"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeSQLUnsupported {
		t.Fatalf("expected SQL_UNSUPPORTED, got %s", out.Content)
	}
}

func TestExplainPlanOnSQLiteRuns(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "explain_plan", `{"sql":"select 1 from t","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if !env.OK {
		t.Fatalf("expected sqlite explain_plan to run, got %s", out.Content)
	}
}

// --- Live Postgres: the full explain_plan tool, end to end ---

func TestExplainPlanToolEndToEndFlagsAStaleTable(t *testing.T) {
	profile := testPostgresProfile(t)
	drv, _ := core.Get(profile.Driver)
	sqlDB, err := drv.Open(profile)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	schema := "zentro_mcp_app_explain_test"
	ctx := context.Background()
	for _, stmt := range []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".orders (id int primary key, status text)",
		"insert into " + schema + ".orders select g, 'open' from generate_series(1,50) g",
	} {
		if _, err := sqlDB.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("setup: %s: %v", stmt, err)
		}
	}
	t.Cleanup(func() { _, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade") })

	project := &models.Project{
		ID: "proj-pg-explain",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: profile.ID, LastDatabase: profile.DBName, LastSchema: schema},
		},
	}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return []*models.ConnectionProfile{profile}, nil }
	svc.db = func() *sql.DB { return nil }

	args, _ := json.Marshal(map[string]string{
		"sql":    "select * from orders where status = 'open'",
		"env":    "dev",
		"schema": schema,
	})
	out := svc.runTool(context.Background(), "explain_plan", string(args), false)
	data := requireOK(t, out.Content)
	var result aiExplainPlanDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	if result.TopNode == "" {
		t.Fatal("TopNode is empty")
	}
	found := false
	for _, f := range result.Flags {
		if f.Type == "stale_stats" && f.Table == "orders" {
			found = true
		}
	}
	if !found {
		t.Fatalf("a never-analyzed table was not flagged stale_stats: %+v", result.Flags)
	}
	if len(data.Warnings) == 0 {
		t.Fatal("no warning that flags are heuristic")
	}
}

func TestExplainPlanToolEndToEndRawFormatIncludesNormalizedPlan(t *testing.T) {
	profile := testPostgresProfile(t)
	drv, _ := core.Get(profile.Driver)
	sqlDB, err := drv.Open(profile)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	schema := "zentro_mcp_app_explain_raw_test"
	ctx := context.Background()
	for _, stmt := range []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".t1 (id int primary key, name text)",
	} {
		if _, err := sqlDB.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("setup: %s: %v", stmt, err)
		}
	}
	t.Cleanup(func() { _, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade") })

	project := &models.Project{
		ID: "proj-pg-explain-raw",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: profile.ID, LastDatabase: profile.DBName, LastSchema: schema},
		},
	}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return []*models.ConnectionProfile{profile}, nil }
	svc.db = func() *sql.DB { return nil }

	args, _ := json.Marshal(map[string]string{
		"sql":    "select * from t1 where name = 'alice'",
		"env":    "dev",
		"schema": schema,
		"format": "raw",
	})
	out := svc.runTool(context.Background(), "explain_plan", string(args), false)
	data := requireOK(t, out.Content)
	var result aiExplainPlanDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	if result.RawPlan == "" {
		t.Fatal("format raw did not include rawPlan")
	}
	if strings.Contains(result.RawPlan, "'alice'") {
		t.Fatalf("a literal value leaked into rawPlan unnormalized: %s", result.RawPlan)
	}

	var before int
	if err := sqlDB.QueryRow("select count(*) from " + schema + ".t1").Scan(&before); err != nil {
		t.Fatal(err)
	}
	if before != 0 {
		t.Fatalf("explain_plan should never insert rows; got %d", before)
	}
}
