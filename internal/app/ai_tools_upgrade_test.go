// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

// T2.7: the four existing tools gained optional parameters and fields. These
// tests cover the new ones; the older tests in ai_tools_test.go and
// ai_tools_context_test.go still pass unchanged, which is the "an old call
// gives the same result" check.

func TestClassifySQLAddsVerdictForTheNamedEnv(t *testing.T) {
	svc := contextService(t)
	svc.environment = func() string { return "dev" }

	var dev, pro aiSQLRiskDTO
	if err := json.Unmarshal(requireOK(t, runContextTool(t, svc, "classify_sql", `{"sql":"delete from orders where id = 1"}`).Content).Data, &dev); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(requireOK(t, runContextTool(t, svc, "classify_sql", `{"sql":"delete from orders where id = 1","env":"pro"}`).Content).Data, &pro); err != nil {
		t.Fatal(err)
	}
	if dev.Env != "dev" || dev.Verdict != classifyAllowed {
		t.Fatalf("dev = %+v", dev)
	}
	if pro.Env != "pro" || pro.Verdict != classifyNeedsConfirmation || len(pro.Reasons) == 0 {
		t.Fatalf("pro = %+v", pro)
	}
	if !dev.HasWrite || dev.Statements != 1 || len(dev.Operations) != 1 {
		t.Fatalf("the old fields are gone: %+v", dev)
	}

	out := svc.runTool(context.Background(), "classify_sql", `{"sql":"select 1","env":"qa"}`, false)
	if env := decodeEnvelope(t, out.Content); env.OK || env.Error.Code != aiCodeEnvNotFound {
		t.Fatalf("an unknown env should be ENV_NOT_FOUND: %s", out.Content)
	}
}

func TestClassifySQLInProductionIsNotBlockedByTheProductionRule(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.environment = func() string { return "pro" }
	tool, _ := findAITool("classify_sql")
	if reason, _ := svc.toolBlocked(tool, svc.toolTargetEnvs(tool, json.RawMessage(`{"sql":"select 1","env":"pro"}`))...); reason != "" {
		t.Fatalf("classify_sql never touches a database and must keep working in pro: %q", reason)
	}
}

func TestSearchSchemaLimitTruncatedAndDidYouMean(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")

	var limited aiSchemaSearchData
	if err := json.Unmarshal(requireOK(t, svc.runTool(context.Background(), "search_schema", `{"query":"o","limit":1}`, false).Content).Data, &limited); err != nil {
		t.Fatal(err)
	}
	if len(limited.Hits) != 1 || !limited.Truncated || limited.More == 0 {
		t.Fatalf("limit 1: %+v", limited)
	}

	var none aiSchemaSearchData
	if err := json.Unmarshal(requireOK(t, svc.runTool(context.Background(), "search_schema", `{"query":"ordrs"}`, false).Content).Data, &none); err != nil {
		t.Fatal(err)
	}
	if len(none.Hits) != 0 || !contains(none.DidYouMean, "orders") {
		t.Fatalf("didYouMean = %v", none.DidYouMean)
	}

	var found aiSchemaSearchData
	if err := json.Unmarshal(requireOK(t, svc.runTool(context.Background(), "search_schema", `{"query":"orders"}`, false).Content).Data, &found); err != nil {
		t.Fatal(err)
	}
	if found.DidYouMean != nil || found.Truncated {
		t.Fatalf("a matching search has no didYouMean: %+v", found)
	}
}

// upgradeFixture is two SQLite environments; the open one is dev, and sta
// holds a table dev does not, so a result from sta proves env was honored.
func upgradeFixture(t *testing.T) *AIService {
	t.Helper()
	core.Register(sqlite.New())
	build := func(name string, stmts ...string) string {
		path := filepath.Join(t.TempDir(), name+".db")
		sqlDB, err := sql.Open("sqlite", path)
		if err != nil {
			t.Fatal(err)
		}
		defer sqlDB.Close()
		for _, s := range stmts {
			if _, err := sqlDB.Exec(s); err != nil {
				t.Fatalf("%s: %v", s, err)
			}
		}
		return path
	}
	devPath := build("dev", "create table customers(id integer primary key)")
	staPath := build("sta",
		"create table regions(id integer primary key)",
		"create table customers(id integer primary key, region_id integer references regions(id))",
		"create table staging_orders(id integer primary key, customer_id integer references customers(id))",
	)
	connections := []*models.ConnectionProfile{
		{ID: "conn-dev", Name: "Dev", Driver: constant.DriverSQLite, DBName: devPath},
		{ID: "conn-sta", Name: "Sta", Driver: constant.DriverSQLite, DBName: staPath},
	}
	project := &models.Project{ID: "proj-upgrade", Environments: []models.ProjectEnvironment{
		{Key: "dev", Label: "Development", ConnectionRef: "conn-dev", LastDatabase: devPath, LastSchema: "main"},
		{Key: "sta", Label: "Staging", ConnectionRef: "conn-sta", LastDatabase: staPath, LastSchema: "main"},
	}}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.environment = func() string { return "dev" }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return connections, nil }
	svc.db = func() *sql.DB { return nil }
	return svc
}

func TestSearchSchemaReadsAnotherEnvironment(t *testing.T) {
	svc := upgradeFixture(t)
	out := svc.runTool(context.Background(), "search_schema", `{"query":"staging","env":"sta"}`, false)
	env := requireOK(t, out.Content)
	var data aiSchemaSearchData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Hits) == 0 || data.Hits[0].Name != "staging_orders" {
		t.Fatalf("sta's table was not found: %+v", data)
	}
	if env.Meta == nil || env.Meta.Env != "sta" || env.Meta.Schema != "main" {
		t.Fatalf("meta = %+v", env.Meta)
	}
}

func TestDescribeTableReadsAnotherEnvironmentAndSaysWhatItCannotRead(t *testing.T) {
	svc := upgradeFixture(t)
	out := svc.runTool(context.Background(), "describe_table", `{"table":"staging_orders","env":"sta"}`, false)
	env := requireOK(t, out.Content)
	var data aiDescribeTableData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.Table != "staging_orders" || len(data.Columns) != 2 {
		t.Fatalf("data = %+v", data)
	}
	for _, w := range env.Warnings {
		if strings.Contains(w, "not read on sqlite") {
			t.Fatalf("sqlite now implements TableDetailsReader: %v", env.Warnings)
		}
	}

	missing := svc.runTool(context.Background(), "describe_table", `{"table":"staging_ordrs","env":"sta"}`, false)
	if e := decodeEnvelope(t, missing.Content); e.OK || e.Error.Code != aiCodeObjectNotFound || !strings.Contains(e.Error.Hint, "staging_orders") {
		t.Fatalf("got %s", missing.Content)
	}
}

func TestListRelationsDepthBuildsAGraphFromAnotherEnvironment(t *testing.T) {
	svc := upgradeFixture(t)
	out := svc.runTool(context.Background(), "list_relations", `{"table":"staging_orders","env":"sta","depth":2}`, false)
	env := requireOK(t, out.Content)
	var data aiRelationsDepthDTO
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatalf("%v: %s", err, env.Data)
	}
	if len(data.Relations) != 1 || data.Relations[0].ToTable != "customers" {
		t.Fatalf("relations = %+v", data.Relations)
	}
	for _, want := range []string{"staging_orders", "customers", "regions"} {
		if !contains(data.Graph.Nodes, want) {
			t.Fatalf("graph nodes %v miss %s", data.Graph.Nodes, want)
		}
	}
	if len(data.Graph.Edges) != 2 {
		t.Fatalf("edges = %+v", data.Graph.Edges)
	}
	if data.Relations[0].Deferrable != nil {
		t.Fatalf("SQLite does not report deferrable; it must be null: %+v", data.Relations[0])
	}
}

func TestListRelationsDepthOneKeepsTheOldArrayAndRejectsBadDepth(t *testing.T) {
	svc := contextService(t)
	out := runContextTool(t, svc, "list_relations", `{"table":"orders"}`)
	var rels []aiRelationDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &rels); err != nil {
		t.Fatalf("depth 1 must still be an array: %v", err)
	}
	if !strings.Contains(string(requireOK(t, out.Content).Data), `"deferrable":null`) {
		t.Fatalf("deferrable should be present as null: %s", out.Content)
	}
	for _, depth := range []string{"0", "4"} {
		bad := svc.runTool(context.Background(), "list_relations", `{"table":"orders","depth":`+depth+`}`, false)
		if e := decodeEnvelope(t, bad.Content); e.OK || e.Error.Code != aiCodeInvalidArgument {
			t.Fatalf("depth %s: %s", depth, bad.Content)
		}
	}
}

func TestRelationsWalkStopsAtTheNodeCap(t *testing.T) {
	hub := make([]models.TableRelationship, 0, aiRelationsMaxNodes+10)
	for i := 0; i < aiRelationsMaxNodes+10; i++ {
		hub = append(hub, models.TableRelationship{ConstraintName: "fk", SourceSchema: "s", SourceTable: "child" + string(rune('a'+i%26)) + strings.Repeat("x", i/26), TargetSchema: "s", TargetTable: "hub"})
	}
	fetch := func(context.Context, string, string) ([]models.TableRelationship, error) { return nil, nil }
	graph, truncated, err := walkRelations(context.Background(), fetch, "s", "hub", hub, 2)
	if err != nil || !truncated || len(graph.Nodes) != aiRelationsMaxNodes {
		t.Fatalf("err=%v truncated=%v nodes=%d", err, truncated, len(graph.Nodes))
	}
}
