// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver/postgres"
	"zentro/internal/models"
)

func TestNearestNamesFindsCloseMatchesAndExcludesExactOnes(t *testing.T) {
	candidates := []string{"customers", "orders", "order_items", "products"}
	got := nearestNames("custmer", candidates, 3)
	if len(got) == 0 || got[0] != "customers" {
		t.Fatalf("nearestNames did not find customers first: %v", got)
	}
	// An exact (case-insensitive) match is not "unknown", so it must never
	// be suggested as its own correction.
	if got2 := nearestNames("Customers", candidates, 3); contains(got2, "customers") || contains(got2, "Customers") {
		t.Fatalf("an exact match was suggested as a correction: %v", got2)
	}
}

func TestNearestNamesReturnsAtMostThreeNearestFirst(t *testing.T) {
	candidates := []string{"ord", "orde", "order", "orders", "ordering"}
	got := nearestNames("ordr", candidates, 5)
	if len(got) > 3 {
		t.Fatalf("got %d suggestions, want at most 3: %v", len(got), got)
	}
	for i := 1; i < len(got); i++ {
		if levenshtein("ordr", got[i-1]) > levenshtein("ordr", got[i]) {
			t.Fatalf("suggestions are not nearest-first: %v", got)
		}
	}
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func TestLevenshteinKnownDistances(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"abc", "abc", 0},
		{"", "abc", 3},
		{"kitten", "sitting", 3},
		{"orders", "order", 1},
	}
	for _, tc := range cases {
		if got := levenshtein(tc.a, tc.b); got != tc.want {
			t.Errorf("levenshtein(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestValidateSQLRejectsMissingSQL(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "validate_sql", `{}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeInvalidArgument {
		t.Fatalf("expected INVALID_ARGUMENT, got %s", out.Content)
	}
}

func TestValidateSQLOnSQLiteChecksAgainstTheDatabase(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "validate_sql", `{"sql":"select 1 from t","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if !env.OK {
		t.Fatalf("expected sqlite validate_sql to run, got %s", out.Content)
	}
}

func TestValidateSQLFailsClosedOnAnUnsupportedToken(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "validate_sql", `{"sql":"select U&\"\\0061\" from t","env":"dev"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeSQLUnsupported {
		t.Fatalf("expected SQL_UNSUPPORTED, got %s", out.Content)
	}
}

func TestValidateSQLOnAnUnboundEnvironmentIsNotConnected(t *testing.T) {
	svc, _ := envResolverFixture(t)
	out := svc.runTool(context.Background(), "validate_sql", `{"sql":"select 1","env":"pro"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeNotConnected {
		t.Fatalf("expected NOT_CONNECTED, got %s", out.Content)
	}
}

// --- Live Postgres: the full validate_sql tool, end to end ---

// testPostgresProfile parses ZENTRO_TEST_PG_DSN (the same variable the
// postgres driver's own tests use) into a ConnectionProfile resolveEnv can
// open, so this exercises the real app-layer tool, not just the driver port.
func testPostgresProfile(t *testing.T) *models.ConnectionProfile {
	t.Helper()
	dsn := os.Getenv("ZENTRO_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("ZENTRO_TEST_PG_DSN is not set; skipping a test that needs a live Postgres")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("ZENTRO_TEST_PG_DSN is not a valid URL: %v", err)
	}
	port, _ := strconv.Atoi(u.Port())
	if port == 0 {
		port = 5432
	}
	password, _ := u.User.Password()
	db := strings.TrimPrefix(u.Path, "/")
	core.Register(postgres.New())
	return &models.ConnectionProfile{
		ID: "pg-conn", Name: "pg", Driver: constant.DriverPostgres,
		Host: u.Hostname(), Port: port, Username: u.User.Username(), Password: password,
		DBName: db, SSLMode: "disable",
	}
}

func setupAppValidateSchema(t *testing.T, profile *models.ConnectionProfile) string {
	t.Helper()
	drv, _ := core.Get(profile.Driver)
	sqlDB, err := drv.Open(profile)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	schema := "zentro_mcp_app_validate_test"
	ctx := context.Background()
	stmts := []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".customers (id int primary key, name text)",
	}
	for _, s := range stmts {
		if _, err := sqlDB.ExecContext(ctx, s); err != nil {
			t.Fatalf("setup: %s: %v", s, err)
		}
	}
	t.Cleanup(func() {
		db2, err := drv.Open(profile)
		if err != nil {
			return
		}
		defer db2.Close()
		_, _ = db2.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade")
	})
	return schema
}

func appValidateFixture(t *testing.T) (*AIService, string) {
	t.Helper()
	profile := testPostgresProfile(t)
	schema := setupAppValidateSchema(t, profile)
	project := &models.Project{
		ID: "proj-pg",
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

func TestValidateSQLToolEndToEndFindsUnknownColumnWithASuggestion(t *testing.T) {
	svc, schema := appValidateFixture(t)
	args, _ := json.Marshal(map[string]string{
		"sql":    "select id, nam from customers",
		"env":    "dev",
		"schema": schema,
	})
	out := svc.runTool(context.Background(), "validate_sql", string(args), false)
	data := requireOK(t, out.Content)
	var result aiValidateSQLDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	if result.Valid {
		t.Fatal("a statement with an unknown column was reported valid")
	}
	if len(result.Statements) != 1 {
		t.Fatalf("got %d statements, want 1: %+v", len(result.Statements), result.Statements)
	}
	stmt := result.Statements[0]
	if stmt.CheckedBy != "database" {
		t.Fatalf("CheckedBy = %q, want database", stmt.CheckedBy)
	}
	if len(stmt.UnknownObjects) != 1 || stmt.UnknownObjects[0].Name != "nam" {
		t.Fatalf("unknownObjects did not name the typo: %+v", stmt.UnknownObjects)
	}
	if !contains(stmt.UnknownObjects[0].DidYouMean, "name") {
		t.Fatalf("didYouMean did not suggest name: %+v", stmt.UnknownObjects[0].DidYouMean)
	}
	if data.Meta.Env != "dev" || data.Meta.Schema != schema {
		t.Fatalf("meta did not reflect the resolved environment: %+v", data.Meta)
	}
}

func TestValidateSQLToolEndToEndAcceptsAValidStatement(t *testing.T) {
	svc, schema := appValidateFixture(t)
	args, _ := json.Marshal(map[string]string{
		"sql":    "select id, name from customers where id = 1; select count(*) from customers",
		"env":    "dev",
		"schema": schema,
	})
	out := svc.runTool(context.Background(), "validate_sql", string(args), false)
	data := requireOK(t, out.Content)
	var result aiValidateSQLDTO
	if err := json.Unmarshal(data.Data, &result); err != nil {
		t.Fatal(err)
	}
	if !result.Valid {
		t.Fatalf("two valid statements were rejected: %+v", result)
	}
	if len(result.Statements) != 2 {
		t.Fatalf("got %d statements, want 2 (one per ;-separated statement): %+v", len(result.Statements), result.Statements)
	}
}

func TestValidateSQLToolEndToEndWarnsOnDDL(t *testing.T) {
	svc, schema := appValidateFixture(t)
	args, _ := json.Marshal(map[string]string{
		"sql":    "alter table customers add column extra int",
		"env":    "dev",
		"schema": schema,
	})
	out := svc.runTool(context.Background(), "validate_sql", string(args), false)
	data := requireOK(t, out.Content)
	found := false
	for _, w := range data.Warnings {
		if strings.Contains(w, "token level") {
			found = true
		}
	}
	if !found {
		t.Fatalf("no warning about token-only DDL checking: %+v", data.Warnings)
	}

	var exists bool
	sqlDB, err := func() (*sql.DB, error) {
		profile := testPostgresProfile(t)
		drv, _ := core.Get(profile.Driver)
		return drv.Open(profile)
	}()
	if err == nil {
		defer sqlDB.Close()
		_ = sqlDB.QueryRow(`select exists(select 1 from information_schema.columns where table_schema = $1 and table_name = 'customers' and column_name = 'extra')`, schema).Scan(&exists)
	}
	if exists {
		t.Fatal("validate_sql executed the DDL it was only supposed to check")
	}
}
