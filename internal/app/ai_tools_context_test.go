// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/license"
	"zentro/internal/models"
)

// These values sit in the fixtures so a test can prove they never reach a model.
const (
	leakPassword = "s3cret-pw-9f2"
	leakHost     = "db.internal.example"
	leakUser     = "svc_reporting"
	leakPath     = `C:\Users\someone\AppData\Roaming\zentro\projects\shop`
	leakLayout   = "select * from payroll"
	leakNote     = "private note"
)

var leakedStrings = []string{leakPassword, leakHost, leakUser, leakPath, leakLayout, leakNote}

func contextProject() *models.Project {
	return &models.Project{
		ID:           "proj",
		Name:         "Shop",
		Tags:         []string{"retail"},
		Description:  leakNote,
		StoragePath:  leakPath,
		LayoutState:  leakLayout,
		LastOpenedAt: "2026-10-01T10:00:00Z",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: "conn", LastDatabase: "shop", LastSchema: "public"},
			{Key: "pro", Label: "Production", IsProtected: true, ConnectionRef: "conn", LastDatabase: "shop", LastSchema: "public"},
			{Key: "sta", Label: "Staging"},
		},
	}
}

func contextProfile() *models.ConnectionProfile {
	return &models.ConnectionProfile{
		ID: "conn", Name: "Shop DB", Driver: "postgres",
		Host: leakHost, Port: 5432, Username: leakUser, Password: leakPassword,
		DBName: leakPath + `\shop.db`,
	}
}

func contextService(t *testing.T) *AIService {
	t.Helper()
	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return contextProject() }
	svc.profile = func() *models.ConnectionProfile { return contextProfile() }
	svc.canUse = func(license.FeatureID) bool { return true }
	// A tool that calls resolveEnv (validate_sql onward) must not reach the
	// real on-disk connections or a real network during this test; an empty
	// list makes resolveEnv fail fast with NOT_CONNECTED instead of trying to
	// open a connection that does not exist.
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return nil, nil }
	svc.source = &aiContextSource{
		appInfo: func() aiAppInfo {
			return aiAppInfo{Version: "0.9.0", Channel: "stable", OS: "windows/amd64", Plan: "pro", PlanStatus: "active"}
		},
		projects: func() ([]*models.Project, error) { return []*models.Project{contextProject()}, nil },
		// The fixture keeps the password on purpose: a DTO must not copy it.
		connections: func() []*models.ConnectionProfile { return []*models.ConnectionProfile{contextProfile()} },
		policy: func(env string) ExecutionPolicy {
			return ExecutionPolicy{
				SafetyLevel: SafetyLevelStrict, EnvironmentStrictness: "strict", RowCapPerTab: 50000,
				TimeoutSeconds: 45, IsProduction: env == "pro", Locked: env == "pro",
			}
		},
		scriptList: func(projectID, connection string) ([]models.SavedScript, error) {
			return []models.SavedScript{{ID: "s1", ProjectID: projectID, ConnectionName: connection, Name: "month end", UpdatedAt: "2026-09-30T08:15:00Z"},
				{ID: "s2", ProjectID: projectID, ConnectionName: connection, Name: "old", UpdatedAt: "2026-09-30"},
			}, nil
		},
		relationships: func(_ context.Context, schema, table string) ([]models.TableRelationship, error) {
			return []models.TableRelationship{{
				ConstraintName: "orders_customer_fk", SourceSchema: schema, SourceTable: "orders", SourceColumn: "customer_id",
				TargetSchema: schema, TargetTable: "customers", TargetColumn: "id", OnDelete: "NO ACTION", OnUpdate: "NO ACTION",
			}}, nil
		},
	}
	return svc
}

func runContextTool(t *testing.T, svc *AIService, name, args string) aiToolOutcome {
	t.Helper()
	out := svc.runTool(context.Background(), name, args, false)
	if out.Failed || out.Withheld {
		t.Fatalf("%s failed: %+v", name, out)
	}
	return out
}

func TestGetAppContextSaysWhereTheUserIsWorking(t *testing.T) {
	out := runContextTool(t, contextService(t), "get_app_context", `{}`)
	var data aiAppContextDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.Plan != "pro" || data.Environment != "dev" || data.Connection != "Shop DB" ||
		data.Driver != "postgres" || data.Database != "shop" || data.Schema != "public" {
		t.Fatalf("the app context is wrong: %+v", data)
	}
	if data.Project == nil || data.Project.Name != "Shop" {
		t.Fatalf("the project is missing: %+v", data.Project)
	}
	if data.Policy == nil || data.Policy.SafetyLevel != "strict" {
		t.Fatalf("the policy is missing: %+v", data.Policy)
	}
}

func TestGetAppContextWithNothingOpenStillAnswers(t *testing.T) {
	svc := contextService(t)
	svc.project = func() *models.Project { return nil }
	svc.profile = func() *models.ConnectionProfile { return nil }
	svc.environment = func() string { return "" }
	out := runContextTool(t, svc, "get_app_context", `{}`)
	var data aiAppContextDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.Project != nil {
		t.Fatalf("an empty app did not say so: %+v", data.Project)
	}
}

func TestListProjectsHidesPathsAndEditorContent(t *testing.T) {
	out := runContextTool(t, contextService(t), "list_projects", `{}`)
	var data []aiProjectDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data) != 1 || data[0].Name != "Shop" || !data[0].Active {
		t.Fatalf("the project is wrong: %+v", data)
	}
}

func TestListEnvironmentsShowsBindingsAndPolicy(t *testing.T) {
	out := runContextTool(t, contextService(t), "list_environments", `{}`)
	var data []aiEnvironmentDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	byKey := map[string]aiEnvironmentDTO{}
	for _, env := range data {
		byKey[env.Key] = env
	}
	if dev := byKey["dev"]; dev.Key != "dev" || dev.Connection != "Shop DB" || !dev.Bound {
		t.Fatalf("dev environment wrong: %+v", dev)
	}
	if sta := byKey["sta"]; sta.Bound {
		t.Fatalf("an unbound environment is bound: %+v", sta)
	}
	if pro := byKey["pro"]; !pro.Policy.Production {
		t.Fatalf("production is not flagged: %+v", pro)
	}
}

func TestListEnvironmentsRejectsAnUnknownProject(t *testing.T) {
	out := contextService(t).runTool(context.Background(), "list_environments", `{"project":"nope"}`, false)
	if !out.Failed || !strings.Contains(out.Content, "list_projects") {
		t.Fatalf("an unknown project was accepted: %+v", out)
	}
}

func TestListScriptsGivesNamesNotText(t *testing.T) {
	out := runContextTool(t, contextService(t), "list_scripts", `{}`)
	var data []aiScriptDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data) != 2 || data[0].Name != "month end" || data[0].Connection != "Shop DB" {
		t.Fatalf("the script list is wrong: %+v", data)
	}
	// A date in another shape is dropped instead of tripping the result scanner.
	if data[1].Name != "old" || data[1].UpdatedAt != "" {
		t.Fatalf("an odd timestamp was passed on or the script was lost: %+v", data)
	}
}

func TestClassifySQLUsesTheWriteSafetyRules(t *testing.T) {
	svc := contextService(t)
	risky := runContextTool(t, svc, "classify_sql", `{"sql":"delete from orders"}`)
	var riskyData aiSQLRiskDTO
	if err := json.Unmarshal(requireOK(t, risky.Content).Data, &riskyData); err != nil {
		t.Fatal(err)
	}
	if !riskyData.HasDeleteNoWhere || !riskyData.HasDestructive {
		t.Fatalf("a delete without WHERE was not flagged: %+v", riskyData)
	}
	safe := runContextTool(t, svc, "classify_sql", `{"sql":"select id from orders where status = :status"}`)
	var safeData aiSQLRiskDTO
	if err := json.Unmarshal(requireOK(t, safe.Content).Data, &safeData); err != nil {
		t.Fatal(err)
	}
	if safeData.HasWrite {
		t.Fatalf("a select was flagged: %+v", safeData)
	}
	if out := svc.runTool(context.Background(), "classify_sql", `{"sql":"  "}`, false); !out.Failed {
		t.Fatal("an empty statement was classified")
	}
}

func TestListRelationsNeedsARealTable(t *testing.T) {
	svc := contextService(t)
	out := runContextTool(t, svc, "list_relations", `{"table":"orders"}`)
	var data []aiRelationDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data) != 1 || data[0].Constraint != "orders_customer_fk" || !data[0].TableIsChild {
		t.Fatalf("the relation is missing: %+v", data)
	}
	if missing := svc.runTool(context.Background(), "list_relations", `{"table":"prod_users"}`, false); !missing.Failed {
		t.Fatal("a table that is not in the catalog was read")
	}
}

// The check that matters most: whatever a tool is asked, none of the values
// that must stay inside Zentro appear in what a model receives.
func TestNoContextToolReturnsASecretOrALocalDetail(t *testing.T) {
	svc := contextService(t)
	calls := map[string]string{
		"get_app_context":   `{}`,
		"list_projects":     `{}`,
		"list_environments": `{}`,
		"list_connections":  `{}`,
		"list_scripts":      `{}`,
		"list_relations":    `{"table":"orders"}`,
		"classify_sql":      `{"sql":"update orders set status = :s"}`,
	}
	for name, args := range calls {
		out := runContextTool(t, svc, name, args)
		for _, secret := range leakedStrings {
			if strings.Contains(out.Content, secret) {
				t.Fatalf("%s returned %q:\n%s", name, secret, out.Content)
			}
		}
	}
}

func TestListConnectionsHidesTheServerUntilTheUserAllowsIt(t *testing.T) {
	svc := contextService(t)
	off := runContextTool(t, svc, "list_connections", `{}`)
	var offData []aiConnectionDTO
	if err := json.Unmarshal(requireOK(t, off.Content).Data, &offData); err != nil {
		t.Fatal(err)
	}
	if len(offData) != 1 || offData[0].Name != "Shop DB" || offData[0].Details != nil {
		t.Fatalf("the connection is wrong with the switch off: %+v", offData)
	}

	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: "http://127.0.0.1:1/v1", Model: "local", IncludeConnectionDetails: true}); err != nil {
		t.Fatal(err)
	}
	on := runContextTool(t, svc, "list_connections", `{}`)
	var onData []aiConnectionDTO
	if err := json.Unmarshal(requireOK(t, on.Content).Data, &onData); err != nil {
		t.Fatal(err)
	}
	details := onData[0].Details
	if details == nil || details.Host != leakHost || details.Username != leakUser || details.Port != 5432 {
		t.Fatalf("the allowed details are wrong: %+v", details)
	}
	// Even then: never the password, never a folder.
	for _, secret := range []string{leakPassword, leakPath} {
		if strings.Contains(on.Content, secret) {
			t.Fatalf("list_connections returned %q:\n%s", secret, on.Content)
		}
	}
}
