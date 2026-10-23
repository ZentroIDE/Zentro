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
	"zentro/internal/extensions/license"
	"zentro/internal/models"
)

func readDataFixture(t *testing.T) *AIService {
	t.Helper()
	core.Register(sqlite.New())
	devPath := filepath.Join(t.TempDir(), "dev.db")
	db, err := sql.Open("sqlite", devPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range []string{
		"PRAGMA foreign_keys = ON",
		"CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT, password TEXT, email TEXT)",
		"CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, qty INTEGER)",
		"CREATE TABLE notes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT, body TEXT)",
		"INSERT INTO users (id, status, password, email) VALUES (1, 'ok', 'secret', 'one@example.com'), (2, 'ok', 'secret2', 'two@example.com')",
		"INSERT INTO orders (id, user_id, qty) VALUES (1, 1, 3), (2, 1, 1), (3, 2, 5)",
		"INSERT INTO notes (id, user_id, body) VALUES (1, 2, 'keep')",
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	db.Close()

	connections := []*models.ConnectionProfile{
		{ID: "conn-dev", Name: "Dev DB", Driver: constant.DriverSQLite, DBName: devPath},
	}
	project := &models.Project{
		ID: "proj-1",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: "conn-dev", LastDatabase: devPath, LastSchema: "main"},
			{Key: "sta", Label: "Staging", ConnectionRef: "conn-dev", LastDatabase: devPath, LastSchema: "main"},
			{Key: "pro", Label: "Production", ConnectionRef: "conn-dev", LastDatabase: devPath, LastSchema: "main"},
		},
	}
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return connections, nil }
	svc.environment = func() string { return "dev" }
	// Row values need Data mode, a Pro feature (ADR 0017).
	svc.canUse = func(license.FeatureID) bool { return true }
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowReadData: true, DataMode: true}); err != nil {
		t.Fatal(err)
	}
	return svc
}

func TestRunReadonlyQueryMasksCredentialsAndRejectsWrites(t *testing.T) {
	svc := readDataFixture(t)

	out := svc.runTool(context.Background(), "run_readonly_query", `{"env":"dev","sql":"SELECT id, password, status FROM users ORDER BY id"}`, false)
	var data aiReadonlyQueryDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.RowCount != 2 || data.Truncated {
		t.Fatalf("rows %+v", data)
	}
	if len(data.MaskedColumns) == 0 {
		t.Fatal("password should be listed as masked")
	}
	if data.Rows[0][1] != "***" || data.Rows[1][1] != "***" {
		t.Fatalf("password cells %v", data.Rows)
	}
	if strings.Contains(out.Content, "secret") {
		t.Fatal("a credential leaked into the envelope")
	}

	write := svc.runTool(context.Background(), "run_readonly_query", `{"env":"dev","sql":"INSERT INTO users (id, status) VALUES (9, 'x')"}`, false)
	env := decodeEnvelope(t, write.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeSQLNotAllowed {
		t.Fatalf("insert was not refused: %s", write.Content)
	}
}

func TestEstimateImpactCountsMatchHandWrittenAndRejectsOutOfScope(t *testing.T) {
	svc := readDataFixture(t)
	cases := []struct {
		sql  string
		want int64
	}{
		{"UPDATE users SET status = 'x' WHERE id = 1", 1},
		{"UPDATE users SET status = 'x'", 2},
		{"DELETE FROM orders WHERE user_id = 1", 2},
		{"DELETE FROM orders WHERE id IN (SELECT id FROM orders WHERE qty = 5)", 1},
		{"UPDATE orders SET qty = 0 WHERE qty > 1", 2},
	}
	for _, tc := range cases {
		out := svc.runTool(context.Background(), "estimate_impact", `{"env":"dev","sql":`+jsonString(tc.sql)+`}`, false)
		var data aiImpactDTO
		if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
			t.Fatalf("%s: %v %s", tc.sql, err, out.Content)
		}
		if data.AffectedRows != tc.want {
			t.Fatalf("%s: affected %d want %d", tc.sql, data.AffectedRows, tc.want)
		}
	}

	rejected := []string{
		"WITH x AS (SELECT 1) UPDATE users SET status = 'x' WHERE id = 1",
		"UPDATE users SET status = 'x' FROM orders WHERE users.id = orders.user_id",
		"UPDATE users SET status = $1",
		"SELECT * FROM users",
		"UPDATE users SET status = 'x' WHERE id = 1; UPDATE users SET status = 'y'",
	}
	for _, sql := range rejected {
		out := svc.runTool(context.Background(), "estimate_impact", `{"env":"dev","sql":`+jsonString(sql)+`}`, false)
		env := decodeEnvelope(t, out.Content)
		if env.OK || env.Error == nil {
			t.Fatalf("%s should be refused: %s", sql, out.Content)
		}
		if env.Error.Code != aiCodeSQLUnsupported && env.Error.Code != aiCodeSQLNotAllowed {
			t.Fatalf("%s: %s", sql, env.Error.Code)
		}
	}
}

func TestPreviewCascadeCountsChildrenAndBlockers(t *testing.T) {
	svc := readDataFixture(t)
	out := svc.runTool(context.Background(), "preview_cascade", `{"env":"dev","sql":"DELETE FROM users WHERE id = 1"}`, false)
	var data aiCascadeDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(out.Content, err)
	}
	if data.Root.AffectedRows != 1 {
		t.Fatalf("root %+v", data.Root)
	}
	var sawOrders bool
	for _, effect := range data.Effects {
		if effect.Table == "orders" && effect.Action == "delete" && effect.Rows == 2 {
			sawOrders = true
		}
	}
	if !sawOrders {
		t.Fatalf("expected orders cascade 2, got %+v", data.Effects)
	}
	for _, b := range data.Blockers {
		if b.Table == "notes" && b.Rows != 0 {
			t.Fatalf("user 1 should not block on notes: %+v", data.Blockers)
		}
	}

	blocked := svc.runTool(context.Background(), "preview_cascade", `{"env":"dev","sql":"DELETE FROM users WHERE id = 2"}`, false)
	var data2 aiCascadeDTO
	if err := json.Unmarshal(requireOK(t, blocked.Content).Data, &data2); err != nil {
		t.Fatal(blocked.Content, err)
	}
	if len(data2.Blockers) == 0 {
		t.Fatalf("expected a restrict blocker for notes, got %+v", data2)
	}
}

func TestDryRunRollsBackAndRefusesProduction(t *testing.T) {
	svc := readDataFixture(t)
	out := svc.runTool(context.Background(), "dry_run", `{"env":"dev","sql":"INSERT INTO users (id, status) VALUES (9, 'new')"}`, false)
	var data aiDryRunDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(out.Content, err)
	}
	if !data.RolledBack || len(data.Statements) != 1 || data.Statements[0].Status != "ok" {
		t.Fatalf("dry_run %+v", data)
	}

	count := svc.runTool(context.Background(), "run_readonly_query", `{"env":"dev","sql":"SELECT count(*) AS n FROM users"}`, false)
	var rows aiReadonlyQueryDTO
	if err := json.Unmarshal(requireOK(t, count.Content).Data, &rows); err != nil {
		t.Fatal(count.Content, err)
	}
	if len(rows.Rows) != 1 || rows.Rows[0][0] != "2" {
		t.Fatalf("data changed after dry_run: %+v", rows)
	}

	pro := svc.runTool(context.Background(), "dry_run", `{"env":"pro","sql":"INSERT INTO users (id, status) VALUES (9, 'new')"}`, false)
	env := decodeEnvelope(t, pro.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodePermissionDenied {
		t.Fatalf("dry_run on pro: %s", pro.Content)
	}

	fk := svc.runTool(context.Background(), "dry_run", `{"env":"dev","sql":"INSERT INTO notes (id, user_id, body) VALUES (2, 99, 'x')"}`, false)
	var fail aiDryRunDTO
	if err := json.Unmarshal(requireOK(t, fk.Content).Data, &fail); err != nil {
		t.Fatal(fk.Content, err)
	}
	if len(fail.Statements) == 0 || fail.Statements[0].Status != "error" {
		t.Fatalf("constraint should be data, got %+v", fail)
	}
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
