// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func TestRoutineBodyMentionsFindsAnIdentifierButNotAStringOrComment(t *testing.T) {
	src := `
	begin
		-- orders is just a comment here, not a real reference
		insert into log_table(msg) values ('orders mentioned in a string too');
		update customers set last_seen = now();
		return;
	end;
	`
	if routineBodyMentions(src, "orders") {
		t.Fatal("a comment and a string literal were both treated as a real reference")
	}
	if !routineBodyMentions(src, "customers") {
		t.Fatal("a genuine identifier reference was not found")
	}
}

func TestRoutineBodyMentionsIsCaseInsensitiveAndMatchesQuotedIdentifiers(t *testing.T) {
	if !routineBodyMentions(`update "Orders" set x = 1`, "orders") {
		t.Fatal("a quoted, differently-cased identifier was not matched")
	}
	if !routineBodyMentions(`UPDATE Orders SET x = 1`, "orders") {
		t.Fatal("an unquoted, differently-cased identifier was not matched")
	}
}

func TestRoutineBodyMentionsOnAnUnsupportedTokenIsNoMatch(t *testing.T) {
	if routineBodyMentions(`select U&"\0061"`, "orders") {
		t.Fatal("an unparseable body should report no match, not panic or guess")
	}
}

func TestUnquoteForMatchStripsDoubledQuotes(t *testing.T) {
	if got := unquoteForMatch(`"My ""Table"""`); got != `My "Table"` {
		t.Fatalf("got %q", got)
	}
	if got := unquoteForMatch("orders"); got != "orders" {
		t.Fatalf("an already-unquoted identifier was changed: %q", got)
	}
}

// --- Live Postgres: ReadDependencies end to end ---

func setupDependenciesSchema(t *testing.T, sqlDB *sql.DB) string {
	t.Helper()
	schema := "zentro_mcp_deps_test"
	ctx := context.Background()
	stmts := []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".customers (id int primary key, name text)",
		"create table " + schema + ".orders (id serial primary key, customer_id int references " + schema + ".customers(id), status text)",
		"create view " + schema + ".open_orders as select * from " + schema + ".orders where status = 'open'",
		"create function " + schema + ".touch_orders() returns trigger as $$ begin return new; end; $$ language plpgsql",
		"create trigger orders_touch before update on " + schema + ".orders for each row execute function " + schema + ".touch_orders()",
		"create index orders_status_idx on " + schema + ".orders (status)",
		"create function " + schema + ".describe_order(p_id int) returns text as $$ begin return 'order ' || p_id::text || ' in orders'; end; $$ language plpgsql",
	}
	for _, s := range stmts {
		if _, err := sqlDB.ExecContext(ctx, s); err != nil {
			t.Fatalf("setup: %s: %v", s, err)
		}
	}
	t.Cleanup(func() {
		_, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade")
	})
	return schema
}

func TestReadDependencies_DependentsOfCustomersIncludesOrdersByFK(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "customers", Direction: "dependents", Depth: 2})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	if !hasEdge(graph.Edges, "orders", "customers", "fk") {
		t.Fatalf("orders -> customers (fk) not found: %+v", graph.Edges)
	}
	if !hasNode(graph.Nodes, "table", "orders") {
		t.Fatalf("orders node not found: %+v", graph.Nodes)
	}
}

func TestReadDependencies_DependentsOfOrdersIncludesTheViewAndTrigger(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "orders", Direction: "dependents", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	if !hasEdge(graph.Edges, "open_orders", "orders", "view") {
		t.Fatalf("open_orders -> orders (view) not found: %+v", graph.Edges)
	}
	if !hasEdge(graph.Edges, "orders_touch", "orders", "trigger") {
		t.Fatalf("orders_touch -> orders (trigger) not found: %+v", graph.Edges)
	}
	if !hasEdge(graph.Edges, "orders_touch", "touch_orders", "trigger") {
		t.Fatalf("orders_touch -> touch_orders (trigger) not found: %+v", graph.Edges)
	}
	if !hasNode(graph.Nodes, "routine", "touch_orders") {
		t.Fatalf("touch_orders routine node not found: %+v", graph.Nodes)
	}
}

func TestReadDependencies_DependenciesOfOrdersIsCustomers(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "orders", Direction: "dependencies", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	if !hasEdge(graph.Edges, "orders", "customers", "fk") {
		t.Fatalf("orders -> customers (fk) not found: %+v", graph.Edges)
	}
}

func TestReadDependencies_PossiblyDependentFindsTheNameMatchRoutine(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "orders", Direction: "dependents", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	found := false
	for _, p := range graph.PossiblyDependent {
		if p.Name == "describe_order" {
			found = true
			if p.Confidence != "name_match" {
				t.Fatalf("confidence = %q, want name_match", p.Confidence)
			}
		}
	}
	if !found {
		t.Fatalf("describe_order was not surfaced as possibly dependent: %+v", graph.PossiblyDependent)
	}
	// It must never appear in edges: that would claim a real dependency
	// Postgres never recorded.
	for _, e := range graph.Edges {
		if e.From == "describe_order" || e.To == "describe_order" {
			t.Fatalf("a name-matched routine leaked into edges: %+v", e)
		}
	}
}

func TestReadDependencies_UnknownObjectIsAnError(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	if _, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "zentro_mcp_does_not_exist", Direction: "dependents", Depth: 1}); err == nil {
		t.Fatal("expected an error for an unknown object")
	}
}

func hasEdge(edges []models.MCPDependencyEdge, from, to, via string) bool {
	for _, e := range edges {
		if e.From == from && e.To == to && e.Via == via {
			return true
		}
	}
	return false
}

func hasNode(nodes []models.MCPDependencyNode, kind, name string) bool {
	for _, n := range nodes {
		if n.Kind == kind && n.Name == name {
			return true
		}
	}
	return false
}

func TestReadDependencies_RootTableGetsItsIndexesAndOwnedSequence(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "orders", Direction: "dependents", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	for _, ix := range []string{"orders_pkey", "orders_status_idx"} {
		if !hasEdge(graph.Edges, ix, "orders", "index") {
			t.Fatalf("%s -> orders (index) not found: %+v", ix, graph.Edges)
		}
	}
	if !hasEdge(graph.Edges, "orders_id_seq", "orders", "ownership") {
		t.Fatalf("orders_id_seq -> orders (ownership) not found: %+v", graph.Edges)
	}
}

func TestReadDependencies_ColumnNarrowsTheRootsEdges(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "orders", Column: "status", Direction: "dependents", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	if !hasEdge(graph.Edges, "orders_status_idx", "orders", "index") {
		t.Fatalf("the index on status is missing: %+v", graph.Edges)
	}
	if !hasEdge(graph.Edges, "open_orders", "orders", "view") {
		t.Fatalf("open_orders reads status but is missing: %+v", graph.Edges)
	}
	if hasEdge(graph.Edges, "orders_pkey", "orders", "index") || hasEdge(graph.Edges, "orders_id_seq", "orders", "ownership") {
		t.Fatalf("edges on other columns leaked in: %+v", graph.Edges)
	}
	if hasEdge(graph.Edges, "orders_touch", "orders", "trigger") {
		t.Fatalf("a trigger with no column list does not depend on status: %+v", graph.Edges)
	}

	fk, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "customers", Column: "name", Direction: "dependents", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	if hasEdge(fk.Edges, "orders", "customers", "fk") {
		t.Fatalf("the fk references customers.id, not name: %+v", fk.Edges)
	}
}

func TestReadDependencies_UnknownColumnIsObjectNotFound(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	_, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "orders", Column: "nope", Direction: "dependents", Depth: 1})
	if !errors.Is(err, driver.ErrObjectNotFound) {
		t.Fatalf("want ErrObjectNotFound, got %v", err)
	}
	_, err = drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "zentro_mcp_does_not_exist", Direction: "dependents", Depth: 1})
	if !errors.Is(err, driver.ErrObjectNotFound) {
		t.Fatalf("want ErrObjectNotFound for an unknown object, got %v", err)
	}
}

func TestReadDependencies_RoutineRootListsTheTriggersThatCallIt(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupDependenciesSchema(t, sqlDB)
	drv := New()

	graph, err := drv.ReadDependencies(context.Background(), sqlDB, schema, models.MCPDependencyQuery{Object: "touch_orders", Direction: "dependents", Depth: 1})
	if err != nil {
		t.Fatalf("ReadDependencies: %v", err)
	}
	if !hasEdge(graph.Edges, "orders_touch", "touch_orders", "trigger") || !hasEdge(graph.Edges, "orders_touch", "orders", "trigger") {
		t.Fatalf("the calling trigger is missing: %+v", graph.Edges)
	}
}
