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

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

func allDiffKinds() map[string]bool {
	kinds := map[string]bool{}
	for _, k := range aiDiffAllKinds {
		kinds[k] = true
	}
	return kinds
}

func TestDiffSchemaColumnsReportsEachKindOfChange(t *testing.T) {
	from := []models.ColumnDef{
		{Name: "id", DataType: "int", IsPrimaryKey: true},
		{Name: "status", DataType: "text", IsNullable: true, DefaultValue: "'open'::text"},
		{Name: "legacy", DataType: "text"},
	}
	to := []models.ColumnDef{
		{Name: "id", DataType: "bigint", IsPrimaryKey: true},
		{Name: "status", DataType: "text", IsNullable: false, DefaultValue: "'closed'::text"},
		{Name: "email", DataType: "text"},
	}
	changes := diffSchemaColumns(from, to, true)
	got := map[string]aiSchemaChangeDTO{}
	for _, c := range changes {
		got[c.What+":"+c.Column] = c
	}
	for _, want := range []string{"column_added:email", "column_removed:legacy", "type_changed:id", "nullability_changed:status", "default_changed:status"} {
		if _, ok := got[want]; !ok {
			t.Fatalf("missing %s in %+v", want, changes)
		}
	}
	if d := got["default_changed:status"]; strings.Contains(d.From+d.To, "open") || strings.Contains(d.From+d.To, "closed") {
		t.Fatalf("a default's literal leaked: %+v", d)
	}
}

func TestDiffSchemaColumnsOrderOnlyCountsWhenAskedFor(t *testing.T) {
	from := []models.ColumnDef{{Name: "a", DataType: "int"}, {Name: "b", DataType: "int"}}
	to := []models.ColumnDef{{Name: "b", DataType: "int"}, {Name: "a", DataType: "int"}}
	if changes := diffSchemaColumns(from, to, true); len(changes) != 0 {
		t.Fatalf("order was compared although ignored: %+v", changes)
	}
	changes := diffSchemaColumns(from, to, false)
	if len(changes) != 1 || changes[0].What != "column_order_changed" {
		t.Fatalf("got %+v", changes)
	}
}

func TestDiffSchemaBodiesHashOnlyUnlessObjectTextIsOn(t *testing.T) {
	from := models.SchemaSnapshot{SchemaName: "app", Views: []models.SchemaViewSnapshot{{Name: "v", DDL: "CREATE VIEW app.v AS SELECT 'secret-a' FROM app.t"}}}
	to := models.SchemaSnapshot{SchemaName: "app_sta", Views: []models.SchemaViewSnapshot{{Name: "v", DDL: "CREATE VIEW app_sta.v AS SELECT 'secret-b' FROM app_sta.t"}}}
	opts := schemaDiffOptions{Kinds: map[string]bool{"view": true}, Full: true}

	out, _ := diffSchemaSnapshots(from, to, opts)
	if out.Summary.Changed != 1 || len(out.Objects) != 1 {
		t.Fatalf("got %+v", out)
	}
	change := out.Objects[0].Changes[0]
	if change.What != "body_changed" || change.FromHash == "" || change.FromHash == change.ToHash {
		t.Fatalf("change = %+v", change)
	}
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "SELECT") || strings.Contains(string(raw), "secret") {
		t.Fatalf("view text leaked with object text off: %s", raw)
	}

	opts.IncludeBodies = true
	out, _ = diffSchemaSnapshots(from, to, opts)
	if change := out.Objects[0].Changes[0]; !strings.Contains(change.From, "SELECT") || strings.Contains(change.From, "secret-a") {
		t.Fatalf("with object text on, the body should come back with literals replaced: %+v", change)
	}
}

func TestDiffSchemaIgnoresTheSchemaQualifier(t *testing.T) {
	from := models.SchemaSnapshot{SchemaName: "app", Indexes: []models.SchemaIndexSnapshot{{Name: "ix", TableName: "t", DDL: `CREATE INDEX ix ON app.t USING btree (a)`}}}
	to := models.SchemaSnapshot{SchemaName: "app_sta", Indexes: []models.SchemaIndexSnapshot{{Name: "ix", TableName: "t", DDL: `CREATE INDEX ix ON "app_sta".t  USING btree (a)`}}}
	out, _ := diffSchemaSnapshots(from, to, schemaDiffOptions{Kinds: map[string]bool{"index": true}, Full: true})
	if len(out.Objects) != 0 {
		t.Fatalf("the same index in two schemas was reported: %+v", out.Objects)
	}
}

func TestDiffSchemaSummaryOmitsChangesAndCapsObjects(t *testing.T) {
	var from models.SchemaSnapshot
	for i := 0; i < aiDiffMaxObjects+20; i++ {
		from.Tables = append(from.Tables, models.SchemaTableSnapshot{Name: fmt.Sprintf("t%04d", i)})
	}
	out, truncated := diffSchemaSnapshots(from, models.SchemaSnapshot{}, schemaDiffOptions{Kinds: allDiffKinds()})
	if !truncated || len(out.Objects) != aiDiffMaxObjects {
		t.Fatalf("truncated=%v objects=%d", truncated, len(out.Objects))
	}
	if out.Summary.OnlyInFrom != aiDiffMaxObjects+20 {
		t.Fatalf("the summary must count every difference, got %d", out.Summary.OnlyInFrom)
	}
}

func TestDiffSchemaRejectsBadArguments(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	cases := map[string]string{
		`{"from_env":"dev"}`:                                 aiCodeEnvRequired,
		`{"from_env":"dev","to_env":"DEV"}`:                  aiCodeInvalidArgument,
		`{"from_env":"dev","to_env":"sta","detail":"all"}`:   aiCodeInvalidArgument,
		`{"from_env":"dev","to_env":"sta","kinds":["rows"]}`: aiCodeInvalidArgument,
	}
	for args, code := range cases {
		out := svc.runTool(context.Background(), "diff_schema", args, false)
		env := decodeEnvelope(t, out.Content)
		if env.OK || env.Error == nil || env.Error.Code != code {
			t.Fatalf("%s: want %s, got %s", args, code, out.Content)
		}
	}
}

func TestDiffSchemaNamesTheSideThatFailed(t *testing.T) {
	svc, _ := envResolverFixture(t) // "pro" exists but has no connection
	out := svc.runTool(context.Background(), "diff_schema", `{"from_env":"dev","to_env":"pro"}`, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeNotConnected || !strings.Contains(env.Error.Message, "to_env (pro)") {
		t.Fatalf("got %s", out.Content)
	}
	out = svc.runTool(context.Background(), "diff_schema", `{"from_env":"qa","to_env":"dev"}`, false)
	env = decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeEnvNotFound || !strings.Contains(env.Error.Message, "from_env (qa)") {
		t.Fatalf("got %s", out.Content)
	}
}

// diffFixture is two SQLite environments whose schemas differ in exactly
// five places: a column added, a column type changed, a view body changed,
// an index missing on one side, and a table missing on one side.
func diffFixture(t *testing.T) *AIService {
	t.Helper()
	core.Register(sqlite.New())
	build := func(name string, stmts []string) string {
		path := filepath.Join(t.TempDir(), name+".db")
		sqlDB, err := sql.Open("sqlite", path)
		if err != nil {
			t.Fatal(err)
		}
		defer sqlDB.Close()
		for _, stmt := range stmts {
			if _, err := sqlDB.Exec(stmt); err != nil {
				t.Fatalf("%s: %s: %v", name, stmt, err)
			}
		}
		return path
	}
	devPath := build("dev", []string{
		"create table customers(id integer primary key, name text)",
		"create table orders(id integer primary key, customer_id integer, status text)",
		"create table legacy(id integer primary key)",
		"create index idx_orders_status on orders(status)",
		"create view v_orders as select id from orders",
	})
	staPath := build("sta", []string{
		"create table customers(id integer primary key, name text, email text)",
		"create table orders(id integer primary key, customer_id integer, status integer)",
		"create view v_orders as select id, status from orders",
	})
	connections := []*models.ConnectionProfile{
		{ID: "conn-dev", Name: "Dev DB", Driver: constant.DriverSQLite, DBName: devPath},
		{ID: "conn-sta", Name: "Staging DB", Driver: constant.DriverSQLite, DBName: staPath},
	}
	project := &models.Project{
		ID: "proj-diff",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: "conn-dev", LastDatabase: devPath, LastSchema: "main"},
			{Key: "sta", Label: "Staging", ConnectionRef: "conn-sta", LastDatabase: staPath, LastSchema: "main"},
		},
	}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return connections, nil }
	svc.db = func() *sql.DB { return nil }
	return svc
}

func TestDiffSchemaFindsExactlyTheFiveDifferences(t *testing.T) {
	svc := diffFixture(t)
	out := svc.runTool(context.Background(), "diff_schema", `{"from_env":"dev","to_env":"sta","detail":"full"}`, false)
	env := requireOK(t, out.Content)
	var data aiSchemaDiffDTO
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}

	got := map[string]aiSchemaDiffObjectDTO{}
	for _, o := range data.Objects {
		got[o.Kind+":"+o.Name] = o
	}
	want := map[string]string{
		"table:customers":         "changed",
		"table:orders":            "changed",
		"table:legacy":            "only_in_from",
		"view:v_orders":           "changed",
		"index:idx_orders_status": "only_in_from",
	}
	if len(data.Objects) != len(want) {
		t.Fatalf("want exactly %d differences, got %d: %+v", len(want), len(data.Objects), data.Objects)
	}
	for key, status := range want {
		if got[key].Status != status {
			t.Fatalf("%s: status %q, want %q (all: %+v)", key, got[key].Status, status, data.Objects)
		}
	}
	if data.Summary != (aiSchemaDiffSummaryDTO{OnlyInFrom: 2, OnlyInTo: 0, Changed: 3}) {
		t.Fatalf("summary = %+v", data.Summary)
	}
	if c := got["table:customers"].Changes; len(c) != 1 || c[0].What != "column_added" || c[0].Column != "email" {
		t.Fatalf("customers changes = %+v", c)
	}
	if c := got["table:orders"].Changes; len(c) != 1 || c[0].What != "type_changed" || c[0].Column != "status" {
		t.Fatalf("orders changes = %+v", c)
	}
	if env.Meta == nil || env.Meta.Env != "dev -> sta" {
		t.Fatalf("meta = %+v", env.Meta)
	}
}

func TestDiffSchemaSummaryDetailAndKindsNarrowTheResult(t *testing.T) {
	svc := diffFixture(t)
	out := svc.runTool(context.Background(), "diff_schema", `{"from_env":"dev","to_env":"sta","kinds":["table"]}`, false)
	env := requireOK(t, out.Content)
	var data aiSchemaDiffDTO
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Objects) != 3 {
		t.Fatalf("kinds:[table] should give the three table differences, got %+v", data.Objects)
	}
	for _, o := range data.Objects {
		if o.Kind != "table" || len(o.Changes) != 0 {
			t.Fatalf("summary detail or kinds not applied: %+v", o)
		}
	}
}
