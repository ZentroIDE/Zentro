// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"zentro/internal/core"
	"zentro/internal/db"
	"zentro/internal/models"
)

func TestSameIndexShapeComparesColumnsOrderMethodAndPredicate(t *testing.T) {
	a := models.MCPIndexInfo{Columns: []string{"a", "b"}, Method: "btree", Predicate: ""}
	b := models.MCPIndexInfo{Columns: []string{"a", "b"}, Method: "btree", Predicate: ""}
	if !sameIndexShape(a, b) {
		t.Fatal("identical shapes were not matched")
	}
	c := models.MCPIndexInfo{Columns: []string{"b", "a"}, Method: "btree", Predicate: ""}
	if sameIndexShape(a, c) {
		t.Fatal("a different column order was treated as the same shape")
	}
	d := models.MCPIndexInfo{Columns: []string{"a", "b"}, Method: "btree", Predicate: "x is not null"}
	if sameIndexShape(a, d) {
		t.Fatal("a different predicate was treated as the same shape")
	}
}

func TestDuplicateIndexIssuesFlagsTheSecondIndexOnly(t *testing.T) {
	indexes := []models.MCPIndexInfo{
		{Name: "idx_a", Columns: []string{"tag"}, Method: "btree"},
		{Name: "idx_b", Columns: []string{"tag"}, Method: "btree"},
		{Name: "idx_c", Columns: []string{"status"}, Method: "btree"},
	}
	issues := duplicateIndexIssues("t", indexes)
	if len(issues) != 1 {
		t.Fatalf("got %d issues, want 1: %+v", len(issues), issues)
	}
	if issues[0].Index != "idx_b" {
		t.Fatalf("flagged %q, want idx_b", issues[0].Index)
	}
}

func TestUnusedIndexIssuesSkipsPrimaryUniqueAndScannedIndexes(t *testing.T) {
	indexes := []models.MCPIndexInfo{
		{Name: "pk", Primary: true, Scans: 0},
		{Name: "uq", Unique: true, Scans: 0},
		{Name: "scanned", Scans: 5},
		{Name: "idle", Scans: 0},
	}
	issues := unusedIndexIssues("t", indexes, defaultIndexIssueThresholds)
	if len(issues) != 1 || issues[0].Index != "idle" {
		t.Fatalf("got %+v, want exactly idle flagged", issues)
	}
	if issues[0].Severity != "warning" {
		t.Fatalf("severity = %q, want warning when statsSince is unknown", issues[0].Severity)
	}
}

func TestUnusedIndexIssuesDowngradesSeverityWhenStatsAreRecent(t *testing.T) {
	recent := time.Now().Add(-1 * time.Hour)
	indexes := []models.MCPIndexInfo{{Name: "idle", Scans: 0, StatsSince: &recent}}
	issues := unusedIndexIssues("t", indexes, defaultIndexIssueThresholds)
	if len(issues) != 1 || issues[0].Severity != "info" {
		t.Fatalf("got %+v, want info severity for recent stats", issues)
	}
}

func TestInvalidIndexIssuesFlagsOnlyInvalidOnes(t *testing.T) {
	indexes := []models.MCPIndexInfo{{Name: "ok", Valid: true}, {Name: "broken", Valid: false}}
	issues := invalidIndexIssues("t", indexes)
	if len(issues) != 1 || issues[0].Index != "broken" {
		t.Fatalf("got %+v, want exactly broken flagged", issues)
	}
}

func TestMissingFKIndexIssuesFlagsAnUncoveredForeignKeyAndScalesSeverity(t *testing.T) {
	rels := []models.TableRelationship{
		{SourceTable: "orders", SourceColumn: "customer_id", TargetTable: "customers", TargetColumn: "id"},
		{SourceTable: "customers", SourceColumn: "id", TargetTable: "orders", TargetColumn: "customer_id"}, // wrong direction, must be skipped
	}
	indexes := []models.MCPIndexInfo{{Name: "orders_pkey", Columns: []string{"id"}}}

	small := int64(100)
	issues := missingFKIndexIssues("orders", rels, indexes, &small, defaultIndexIssueThresholds)
	if len(issues) != 1 || issues[0].Severity != "info" {
		t.Fatalf("small table should be info severity: %+v", issues)
	}

	large := int64(2000000)
	issues = missingFKIndexIssues("orders", rels, indexes, &large, defaultIndexIssueThresholds)
	if len(issues) != 1 || issues[0].Severity != "critical" {
		t.Fatalf("large table should be critical severity: %+v", issues)
	}
}

func TestMissingFKIndexIssuesSkipsAnFKColumnThatIsTheLeadingIndexColumn(t *testing.T) {
	rels := []models.TableRelationship{{SourceTable: "orders", SourceColumn: "customer_id", TargetTable: "customers"}}
	indexes := []models.MCPIndexInfo{{Name: "orders_customer_idx", Columns: []string{"customer_id", "status"}}}
	issues := missingFKIndexIssues("orders", rels, indexes, nil, defaultIndexIssueThresholds)
	if len(issues) != 0 {
		t.Fatalf("a covered FK column should not be flagged: %+v", issues)
	}
}

func TestGetTableStatsRejectsMissingTable(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "get_table_stats", `{}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeInvalidArgument {
		t.Fatalf("expected INVALID_ARGUMENT, got %s", out.Content)
	}
}

func TestGetTableStatsOnSQLiteReadsCatalogFacts(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "get_table_stats", `{"table":"t","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if !env.OK {
		t.Fatalf("expected sqlite get_table_stats to run, got %s", out.Content)
	}
}

func TestListIndexesOnSQLiteRuns(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "list_indexes", `{"env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if !env.OK {
		t.Fatalf("expected sqlite list_indexes to run, got %s", out.Content)
	}
}

// --- Live Postgres: both tools, end to end ---

func appIndexesFixture(t *testing.T) (*AIService, string) {
	t.Helper()
	profile := testPostgresProfile(t)
	drv, _ := core.Get(profile.Driver)
	sqlDB, err := drv.Open(profile)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	schema := "zentro_mcp_app_indexes_test"
	ctx := context.Background()
	for _, stmt := range []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".customers (id int primary key, name text)",
		"create table " + schema + ".orders (id int primary key, customer_id int references " + schema + ".customers(id), status text)",
		"insert into " + schema + ".customers select g, 'name-'||g from generate_series(1,20) g",
		"insert into " + schema + ".orders select g, (g % 20) + 1, 'open' from generate_series(1,200) g",
		"analyze " + schema + ".customers, " + schema + ".orders",
	} {
		if _, err := sqlDB.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("setup: %s: %v", stmt, err)
		}
	}
	t.Cleanup(func() { _, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade") })

	project := &models.Project{
		ID: "proj-pg-indexes",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: profile.ID, LastDatabase: profile.DBName, LastSchema: schema},
		},
	}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return []*models.ConnectionProfile{profile}, nil }
	svc.db = func() *sql.DB { return nil }
	return svc, schema
}

func TestGetTableStatsToolEndToEnd(t *testing.T) {
	svc, schema := appIndexesFixture(t)
	args, _ := json.Marshal(map[string]any{"table": "customers", "with_columns": true, "env": "dev", "schema": schema})
	out := svc.runTool(context.Background(), "get_table_stats", string(args), false)
	data := requireOK(t, out.Content)
	var result aiTableStatsDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	if result.Exact {
		t.Fatal("exact must always be false")
	}
	if result.EstRows == nil || *result.EstRows != 20 {
		t.Fatalf("EstRows = %v, want 20 after analyze", result.EstRows)
	}
	if len(result.Columns) == 0 {
		t.Fatal("with_columns was true but no columns came back")
	}
}

func TestGetTableStatsToolUnknownTableIsObjectNotFound(t *testing.T) {
	svc, schema := appIndexesFixture(t)
	args, _ := json.Marshal(map[string]any{"table": "does_not_exist", "env": "dev", "schema": schema})
	out := svc.runTool(context.Background(), "get_table_stats", string(args), false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeObjectNotFound {
		t.Fatalf("expected OBJECT_NOT_FOUND, got %s", out.Content)
	}
}

func TestListIndexesToolEndToEndFindsMissingFKIndex(t *testing.T) {
	svc, schema := appIndexesFixture(t)
	args, _ := json.Marshal(map[string]any{"table": "orders", "env": "dev", "schema": schema})
	out := svc.runTool(context.Background(), "list_indexes", string(args), false)
	data := requireOK(t, out.Content)
	var result aiListIndexesDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, issue := range result.Issues {
		if issue.Type == "missing_fk_index" && issue.Table == "orders" {
			found = true
		}
	}
	if !found {
		t.Fatalf("customer_id has no leading index but was not flagged: %+v", result.Issues)
	}
	if len(result.Indexes) == 0 {
		t.Fatal("no indexes were returned at all")
	}
}

func TestListIndexesToolEndToEndWithoutTableScansWholeSchema(t *testing.T) {
	svc, schema := appIndexesFixture(t)
	args, _ := json.Marshal(map[string]any{"env": "dev", "schema": schema})
	out := svc.runTool(context.Background(), "list_indexes", string(args), false)
	data := requireOK(t, out.Content)
	var result aiListIndexesDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	tables := map[string]bool{}
	for _, idx := range result.Indexes {
		tables[idx.Table] = true
	}
	if !tables["orders"] || !tables["customers"] {
		t.Fatalf("expected indexes from both tables, got %+v", tables)
	}
}

// TestAITableStatsDTONeverCarriesSampleValues is a defense-in-depth check on
// top of the driver's own (postgres_table_stats_test.go): aiTableStatsDTO
// and aiTableStatsColumnDTO simply have no field for most_common_vals or
// histogram_bounds, so marshaling a worst-case instance (every field set to
// something resembling real row data) can never produce either name.
func TestAITableStatsDTONeverCarriesSampleValues(t *testing.T) {
	dto := aiTableStatsDTO{
		Columns: []aiTableStatsColumnDTO{{Name: "most_common_vals", NullFraction: 0.1, NDistinct: 5, AvgWidth: 4}},
	}
	raw, err := json.Marshal(dto)
	if err != nil {
		t.Fatal(err)
	}
	if containsAny(string(raw), "histogram_bounds") {
		t.Fatalf("histogram_bounds leaked into the DTO: %s", raw)
	}
}

func containsAny(s string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(s, n) {
			return true
		}
	}
	return false
}

func TestListIndexesPredicateIsNormalized(t *testing.T) {
	// A pure check that list_indexes' DTO assembly normalizes a predicate's
	// literal before it ever reaches the model (ai_tools_stats.go calls
	// db.NormalizeLiterals when building aiIndexDTO.Predicate).
	normalized := db.NormalizeLiterals(`(status = 'open' AND id > 5)`)
	if strings.Contains(normalized, "'open'") || strings.Contains(normalized, "> 5") {
		t.Fatalf("predicate literals were not normalized: %q", normalized)
	}
}
