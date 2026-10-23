// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
	"zentro/internal/extensions/license"
	"zentro/internal/models"
)

type decodedEnvelope struct {
	OK       bool            `json:"ok"`
	Data     json.RawMessage `json:"data"`
	Meta     *aiMeta         `json:"meta"`
	Warnings []string        `json:"warnings"`
	Error    *aiError        `json:"error"`
}

func decodeEnvelope(t *testing.T, content string) decodedEnvelope {
	t.Helper()
	if !json.Valid([]byte(content)) {
		t.Fatalf("tool result is not valid JSON: %s", content)
	}
	var env decodedEnvelope
	if err := json.Unmarshal([]byte(content), &env); err != nil {
		t.Fatalf("tool result does not parse: %v\n%s", err, content)
	}
	return env
}

func requireOK(t *testing.T, content string) decodedEnvelope {
	t.Helper()
	env := decodeEnvelope(t, content)
	if !env.OK || env.Error != nil {
		t.Fatalf("expected an ok result, got: %s", content)
	}
	return env
}

func TestEnvelopeForEveryToolIsValidJSONWithOK(t *testing.T) {
	svc := contextService(t)
	args := map[string]string{
		"search_schema":          `{"query":"order"}`,
		"describe_table":         `{"table":"orders"}`,
		"get_definition":         `{"name":"open_orders"}`,
		"list_relations":         `{"table":"orders"}`,
		"get_app_context":        `{}`,
		"list_projects":          `{}`,
		"list_environments":      `{}`,
		"list_connections":       `{}`,
		"list_scripts":           `{}`,
		"list_audit":             `{}`,
		"get_git_status":         `{}`,
		"get_query_stats":        `{}`,
		"classify_sql":           `{"sql":"select 1"}`,
		"validate_sql":           `{"sql":"select 1"}`,
		"explain_plan":           `{"sql":"select 1"}`,
		"get_table_stats":        `{"table":"orders"}`,
		"list_indexes":           `{"table":"orders"}`,
		"find_dependencies":      `{"object":"orders"}`,
		"diff_schema":            `{"from_env":"dev","to_env":"sta"}`,
		"run_readonly_query":     `{"env":"dev","sql":"select 1"}`,
		"estimate_impact":        `{"env":"dev","sql":"update t set x=1"}`,
		"preview_cascade":        `{"env":"dev","sql":"delete from t"}`,
		"dry_run":                `{"env":"dev","sql":"insert into t values (1)"}`,
		"propose_change":         `{"env":"dev","sql":"update t set x=1"}`,
		"get_change_status":      `{"id":"not-an-id"}`,
		"cancel_change":          `{"id":"not-an-id"}`,
		"list_changes":           `{}`,
		"create_restore_point":   `{"env":"dev"}`,
		"list_restore_points":    `{}`,
		"preview_rollback":       `{"id":"not-an-id"}`,
		"check_migration_safety": `{"sql":"alter table t add column y int"}`,
		"generate_migration":     `{"from_env":"dev","to_env":"sta"}`,
		"get_audit_log":          `{}`,
		"remember":               `{"note":"orders.status 3 means shipped"}`,
		"forget":                 `{"id":"note-none"}`,
		"list_notes":             `{}`,
	}
	tools := allAITools()
	if len(tools) != len(args) {
		t.Fatalf("allAITools changed; update this test: got %d tools", len(tools))
	}
	for _, tool := range tools {
		arg, ok := args[tool.spec.Name]
		if !ok {
			t.Fatalf("no fixture arguments for %s", tool.spec.Name)
		}
		out := svc.runTool(context.Background(), tool.spec.Name, arg, true)
		env := decodeEnvelope(t, out.Content)
		if env.OK && env.Error != nil {
			t.Fatalf("%s returned ok:true with an error: %s", tool.spec.Name, out.Content)
		}
		if !env.OK && (env.Error == nil || env.Error.Code == "") {
			t.Fatalf("%s returned ok:false without a coded error: %s", tool.spec.Name, out.Content)
		}
		if env.OK && (env.Meta == nil || env.Meta.Label != "data") {
			t.Fatalf("%s did not label its payload as data: %s", tool.spec.Name, out.Content)
		}
	}
}

func TestToolErrorsCarrySpecCodes(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	cases := []struct {
		tool          string
		args          string
		code          string
		includeBodies bool
	}{
		{"describe_table", `{"table":"prod_users"}`, aiCodeObjectNotFound, false},
		{"get_definition", `{"name":"open_orders"}`, aiCodePermissionDenied, false},
		{"get_definition", `{"name":"prod_users"}`, aiCodeObjectNotFound, true},
		{"list_relations", `{"table":"prod_users"}`, aiCodeObjectNotFound, false},
	}
	for _, tc := range cases {
		out := svc.runTool(context.Background(), tc.tool, tc.args, tc.includeBodies)
		if !out.Failed {
			t.Fatalf("%s %s did not fail", tc.tool, tc.args)
		}
		env := decodeEnvelope(t, out.Content)
		if env.OK || env.Error == nil || env.Error.Code != tc.code {
			t.Fatalf("%s %s: got %+v, want code %s", tc.tool, tc.args, env, tc.code)
		}
	}
}

func TestUnknownToolAndOutOfPlanToolReturnErrorEnvelope(t *testing.T) {
	withContextTools(t) // adds pro_context, a stand-in tool that needs a license feature
	svc := contextService(t)
	svc.canUse = func(license.FeatureID) bool { return false }

	unknown := svc.runTool(context.Background(), "no_such_tool", `{}`, false)
	env := decodeEnvelope(t, unknown.Content)
	if !unknown.Failed || env.OK || env.Error == nil || env.Error.Code != aiCodeObjectNotFound {
		t.Fatalf("an unknown tool did not return OBJECT_NOT_FOUND: %s", unknown.Content)
	}

	outOfPlan := svc.runTool(context.Background(), "pro_context", `{}`, false)
	plan := decodeEnvelope(t, outOfPlan.Content)
	if !outOfPlan.Failed || plan.OK || plan.Error == nil || plan.Error.Code != aiCodePermissionDenied {
		t.Fatalf("a tool outside the plan did not return a permission error: %s", outOfPlan.Content)
	}
}

func TestWithheldResultIsAnErrorEnvelope(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.catalogFn = func(context.Context, string, bool, bool) (ai.Catalog, error) {
		catalog := toolCatalog()
		catalog.Tables = append(catalog.Tables, ai.Table{Name: "contact_person_at_example_com", Columns: []ai.Column{{Name: "admin@example.com", DataType: "text"}}})
		return catalog, nil
	}
	out := svc.runTool(context.Background(), "search_schema", `{"query":"example"}`, false)
	if !out.Withheld {
		t.Fatalf("a sensitive result was not withheld: %+v", out)
	}
	env := decodeEnvelope(t, out.Content)
	if !out.Failed || env.OK || env.Error == nil || env.Error.Code == "" {
		t.Fatalf("a withheld result is not an error envelope: %s", out.Content)
	}
	if strings.Contains(out.Content, "admin@example.com") {
		t.Fatalf("the sensitive value leaked: %s", out.Content)
	}
}

func TestMCPIsErrorMatchesOK(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")

	ok := svc.callMCPTool(context.Background(), "describe_table", json.RawMessage(`{"table":"orders"}`), "test-actor")
	if ok.IsError {
		t.Fatalf("a successful call is an error: %+v", ok)
	}
	if !strings.Contains(ok.Content[0].Text, `"ok":true`) {
		t.Fatalf("a successful call did not carry ok:true: %s", ok.Content[0].Text)
	}

	bad := svc.callMCPTool(context.Background(), "describe_table", json.RawMessage(`{"table":"nope"}`), "test-actor")
	if !bad.IsError {
		t.Fatalf("a failed call was not an error: %+v", bad)
	}
	if !strings.Contains(bad.Content[0].Text, `"ok":false`) {
		t.Fatalf("a failed call did not carry ok:false: %s", bad.Content[0].Text)
	}
}

func TestBadArgumentsReturnInvalidArgument(t *testing.T) {
	svc := contextService(t)
	cases := []struct{ tool, args string }{
		{"search_schema", `{"query":""}`},
		{"describe_table", `{"table": 5}`},
		{"classify_sql", `{"sql":"  "}`},
		{"list_environments", `{"project": 5}`},
		{"list_scripts", `{"connection": 5}`},
		{"search_schema", `{not json`},
	}
	for _, tc := range cases {
		out := svc.runTool(context.Background(), tc.tool, tc.args, false)
		env := decodeEnvelope(t, out.Content)
		if !out.Failed || env.OK || env.Error == nil || env.Error.Code != aiCodeInvalidArgument {
			t.Fatalf("%s %s: want INVALID_ARGUMENT, got %s", tc.tool, tc.args, out.Content)
		}
	}
}

func TestNoProjectOpenIsNotConnected(t *testing.T) {
	svc := contextService(t)
	svc.project = func() *models.Project { return nil }
	for _, tool := range []string{"list_environments", "list_scripts"} {
		out := svc.runTool(context.Background(), tool, `{}`, false)
		env := decodeEnvelope(t, out.Content)
		if env.OK || env.Error == nil || env.Error.Code != aiCodeNotConnected {
			t.Fatalf("%s with no project: want NOT_CONNECTED, got %s", tool, out.Content)
		}
	}
	unknown := svc.runTool(context.Background(), "list_environments", `{"project":"nope"}`, false)
	if env := decodeEnvelope(t, unknown.Content); env.Error == nil || env.Error.Code != aiCodeObjectNotFound {
		t.Fatalf("an unknown project id: want OBJECT_NOT_FOUND, got %s", unknown.Content)
	}
}

func TestOversizedDataIsMarkedTruncated(t *testing.T) {
	raw := make([]byte, 0, aiToolResultLimit+200)
	raw = append(raw, '[')
	for len(raw) < aiToolResultLimit+100 {
		raw = append(raw, []byte(`"mã khách hàng",`)...)
	}
	raw = append(raw[:len(raw)-1], ']')
	cut := truncatedData(raw)
	if !json.Valid(cut) {
		t.Fatalf("a truncated result is not valid JSON")
	}
	var wrapped aiTruncatedData
	if err := json.Unmarshal(cut, &wrapped); err != nil || wrapped.Partial == "" {
		t.Fatalf("a truncated result lost its text: %v", err)
	}
}

func TestMCPRefusalAndSettingsFailureAreEnvelopes(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.airgap = func() bool { return true }
	out := svc.callMCPTool(context.Background(), "describe_table", json.RawMessage(`{"table":"orders"}`), "test-actor")
	if !out.IsError {
		t.Fatalf("a refused call is not an error: %+v", out)
	}
	env := decodeEnvelope(t, out.Content[0].Text)
	if env.OK || env.Error == nil || env.Error.Code != aiCodePermissionDenied {
		t.Fatalf("a refusal is not a PERMISSION_DENIED envelope: %s", out.Content[0].Text)
	}
}
