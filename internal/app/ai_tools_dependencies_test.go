// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

// fakeDependencyDriver is SQLite (so resolveEnv and the catalog work on a
// temp file) plus a canned DependencyReader, so the tool's own logic runs
// end to end without a Postgres server.
type fakeDependencyDriver struct {
	*sqlite.SQLiteDriver
	name  string
	graph models.MCPDependencyGraph
	err   error
	got   models.MCPDependencyQuery
}

func (f *fakeDependencyDriver) Name() string { return f.name }

func (f *fakeDependencyDriver) ReadDependencies(_ context.Context, _ *sql.DB, _ string, q models.MCPDependencyQuery) (models.MCPDependencyGraph, error) {
	f.got = q
	return f.graph, f.err
}

func dependencyFixture(t *testing.T, fake *fakeDependencyDriver) *AIService {
	t.Helper()
	fake.SQLiteDriver = sqlite.New()
	fake.name = "fakedeps-" + strings.ReplaceAll(t.Name(), "/", "-")
	core.Register(fake)

	path := filepath.Join(t.TempDir(), "dev.db")
	sqlDB, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range []string{
		"create table customers(id integer primary key, name text)",
		"create table orders(id integer primary key, customer_id integer references customers(id), status text)",
	} {
		if _, err := sqlDB.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	sqlDB.Close()

	profile := &models.ConnectionProfile{ID: "conn-deps", Name: "Deps", Driver: fake.name, DBName: path}
	project := &models.Project{
		ID: "proj-deps",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: profile.ID, LastDatabase: path, LastSchema: "main"},
		},
	}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return []*models.ConnectionProfile{profile}, nil }
	svc.db = func() *sql.DB { return nil }
	return svc
}

func TestFindDependenciesRejectsBadArguments(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	for _, args := range []string{
		`{}`,
		`{"object":"  "}`,
		`{"object":"orders","direction":"sideways"}`,
		`{"object":"orders","depth":0}`,
		`{"object":"orders","depth":6}`,
	} {
		out := svc.runTool(context.Background(), "find_dependencies", args, false)
		env := decodeEnvelope(t, out.Content)
		if env.OK || env.Error == nil || env.Error.Code != aiCodeInvalidArgument {
			t.Fatalf("%s: expected INVALID_ARGUMENT, got %s", args, out.Content)
		}
	}
}

func TestFindDependenciesOnSQLiteWalksTheCatalog(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"t","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if !env.OK {
		t.Fatalf("expected sqlite find_dependencies to run, got %s", out.Content)
	}
}

func TestFindDependenciesReturnsTheGraphWithSummaryAndWarnings(t *testing.T) {
	fake := &fakeDependencyDriver{graph: models.MCPDependencyGraph{
		Nodes: []models.MCPDependencyNode{
			{Kind: "table", Name: "customers"},
			{Kind: "table", Name: "orders"},
			{Kind: "view", Name: "open_orders"},
			{Kind: "index", Name: "customers_pkey"},
		},
		Edges: []models.MCPDependencyEdge{
			{From: "orders", To: "customers", Via: "fk"},
			{From: "open_orders", To: "orders", Via: "view"},
			{From: "customers_pkey", To: "customers", Via: "index"},
		},
		PossiblyDependent: []models.MCPPossibleDependency{{Kind: "routine", Name: "describe_customer", Confidence: "name_match"}},
	}}
	svc := dependencyFixture(t, fake)

	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"Customers","env":"dev"}`, false)
	env := requireOK(t, out.Content)
	var data aiFindDependenciesDTO
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}

	if fake.got.Object != "customers" {
		t.Fatalf("the object name was not matched to the catalog's spelling: %q", fake.got.Object)
	}
	if fake.got.Direction != "dependents" || fake.got.Depth != aiDependencyDefaultDepth {
		t.Fatalf("defaults not applied: %+v", fake.got)
	}
	if data.Kind != "table" || len(data.Nodes) != 4 || len(data.Edges) != 3 {
		t.Fatalf("graph not carried over: %+v", data)
	}
	want := []aiDependencyCountDTO{{Kind: "index", Count: 1}, {Kind: "table", Count: 1}, {Kind: "view", Count: 1}}
	if fmt.Sprint(data.Summary) != fmt.Sprint(want) {
		t.Fatalf("summary = %+v, want %+v (root excluded, sorted by kind)", data.Summary, want)
	}
	if len(data.PossiblyDependent) != 1 || data.PossiblyDependent[0].Confidence != "name_match" {
		t.Fatalf("possiblyDependent lost: %+v", data.PossiblyDependent)
	}
	for _, e := range data.Edges {
		if e.From == "describe_customer" || e.To == "describe_customer" {
			t.Fatalf("a name-matched routine leaked into edges: %+v", e)
		}
	}
	if len(env.Warnings) == 0 || !strings.Contains(env.Warnings[0], "possiblyDependent") {
		t.Fatalf("the name-match limitation was not stated: %v", env.Warnings)
	}
	if env.Meta == nil || env.Meta.Env != "dev" || env.Meta.Truncated {
		t.Fatalf("meta = %+v", env.Meta)
	}
}

func TestFindDependenciesPassesColumnDirectionAndDepth(t *testing.T) {
	fake := &fakeDependencyDriver{graph: models.MCPDependencyGraph{Nodes: []models.MCPDependencyNode{{Kind: "table", Name: "orders"}}}}
	svc := dependencyFixture(t, fake)

	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"orders","column":"CUSTOMER_ID","direction":"both","depth":4,"env":"dev"}`, false)
	requireOK(t, out.Content)
	if fake.got.Column != "customer_id" || fake.got.Direction != "both" || fake.got.Depth != 4 {
		t.Fatalf("query = %+v", fake.got)
	}
}

func TestFindDependenciesTruncatedGraphSetsMeta(t *testing.T) {
	fake := &fakeDependencyDriver{graph: models.MCPDependencyGraph{
		Nodes:     []models.MCPDependencyNode{{Kind: "table", Name: "orders"}},
		Truncated: true,
	}}
	svc := dependencyFixture(t, fake)

	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"orders","env":"dev"}`, false)
	env := requireOK(t, out.Content)
	if env.Meta == nil || !env.Meta.Truncated {
		t.Fatalf("meta.truncated not set: %s", out.Content)
	}
}

func TestFindDependenciesUnknownObjectSuggestsANearName(t *testing.T) {
	fake := &fakeDependencyDriver{err: fmt.Errorf("no such object: %w", driverport.ErrObjectNotFound)}
	svc := dependencyFixture(t, fake)

	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"ordrs","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeObjectNotFound {
		t.Fatalf("expected OBJECT_NOT_FOUND, got %s", out.Content)
	}
	if !strings.Contains(env.Error.Hint, "orders") {
		t.Fatalf("didYouMean missing from hint: %q", env.Error.Hint)
	}
}

func TestFindDependenciesUnknownColumnSuggestsAColumn(t *testing.T) {
	fake := &fakeDependencyDriver{err: fmt.Errorf("no such column: %w", driverport.ErrObjectNotFound)}
	svc := dependencyFixture(t, fake)

	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"orders","column":"custmer_id","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeObjectNotFound {
		t.Fatalf("expected OBJECT_NOT_FOUND, got %s", out.Content)
	}
	if !strings.Contains(env.Error.Message, "column") || !strings.Contains(env.Error.Hint, "customer_id") {
		t.Fatalf("column error not specific: %+v", env.Error)
	}
}

func TestFindDependenciesHidesARawDatabaseError(t *testing.T) {
	fake := &fakeDependencyDriver{err: fmt.Errorf("dial tcp 10.0.0.5:5432: refused")}
	svc := dependencyFixture(t, fake)

	out := svc.runTool(context.Background(), "find_dependencies", `{"object":"orders","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeInternal {
		t.Fatalf("expected INTERNAL, got %s", out.Content)
	}
	if strings.Contains(out.Content, "10.0.0.5") {
		t.Fatalf("the raw error leaked a host: %s", out.Content)
	}
}
