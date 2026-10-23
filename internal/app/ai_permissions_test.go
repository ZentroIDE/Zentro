// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
)

// aiProbeTool builds a fixture tool for the permission table below.
func aiProbeTool(name string, group aiPermissionGroup, needsEnv bool) aiTool {
	return aiTool{
		spec:  ai.ToolSpec{Name: name},
		group: group, needsEnv: needsEnv,
	}
}

func TestGroupEnabledMatchesEachSwitch(t *testing.T) {
	on := ProjectAISettings{
		IncludeBodies:            true,
		IncludeConnectionDetails: true,
		AllowReadData:            true,
		AllowChanges:             true,
		AllowAudit:               true,
	}
	off := ProjectAISettings{}
	cases := []aiPermissionGroup{
		aiGroupMetadata, aiGroupContext, aiGroupObjectText,
		aiGroupConnectionDetails, aiGroupReadData, aiGroupChanges, aiGroupAudit,
	}
	for _, group := range cases {
		alwaysOn := group == aiGroupMetadata || group == aiGroupContext
		if got := groupEnabled(group, off); got != alwaysOn {
			t.Fatalf("%s with every switch off: got %v, want %v", group, got, alwaysOn)
		}
		if !groupEnabled(group, on) {
			t.Fatalf("%s with every switch on: got false", group)
		}
	}
}

// TestPermissionTable is the group x switch x environment table the plan asks
// for. Each row names what a call to a fixture tool in that group should do.
func TestPermissionTable(t *testing.T) {
	type row struct {
		name       string
		tool       aiTool
		settings   ProjectAISettings
		env        string
		wantBlock  bool
		wantReason string
	}
	rows := []row{
		{
			name:      "metadata in dev, assistant on",
			tool:      aiProbeTool("probe", aiGroupMetadata, true),
			settings:  ProjectAISettings{Enabled: true},
			env:       "dev",
			wantBlock: false,
		},
		{
			name:      "metadata in production needs no switch (ADR 0017)",
			tool:      aiProbeTool("probe", aiGroupMetadata, true),
			settings:  ProjectAISettings{Enabled: true},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:       "object_text off",
			tool:       aiProbeTool("probe", aiGroupObjectText, true),
			settings:   ProjectAISettings{Enabled: true, IncludeBodies: false},
			env:        "dev",
			wantBlock:  true,
			wantReason: "object text is off",
		},
		{
			name:      "object_text on",
			tool:      aiProbeTool("probe", aiGroupObjectText, true),
			settings:  ProjectAISettings{Enabled: true, IncludeBodies: true},
			env:       "dev",
			wantBlock: false,
		},
		{
			name:      "object_text in production follows its own switch only",
			tool:      aiProbeTool("probe", aiGroupObjectText, true),
			settings:  ProjectAISettings{Enabled: true, IncludeBodies: true},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:       "read_data off",
			tool:       aiProbeTool("probe", aiGroupReadData, true),
			settings:   ProjectAISettings{Enabled: true, AllowReadData: false},
			env:        "dev",
			wantBlock:  true,
			wantReason: "reading data is off",
		},
		{
			name:      "read_data on, dev",
			tool:      aiProbeTool("probe", aiGroupReadData, true),
			settings:  ProjectAISettings{Enabled: true, AllowReadData: true},
			env:       "dev",
			wantBlock: false,
		},
		{
			name:      "read_data on, production: allowed here, the chat asks per round",
			tool:      aiProbeTool("probe", aiGroupReadData, true),
			settings:  ProjectAISettings{Enabled: true, AllowReadData: true, AllowProduction: false},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:      "read_data on, production, AllowProduction on",
			tool:      aiProbeTool("probe", aiGroupReadData, true),
			settings:  ProjectAISettings{Enabled: true, AllowReadData: true, AllowProduction: true},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:       "changes off",
			tool:       aiProbeTool("probe", aiGroupChanges, true),
			settings:   ProjectAISettings{Enabled: true, AllowChanges: false},
			env:        "dev",
			wantBlock:  true,
			wantReason: "proposing changes is off",
		},
		{
			name:       "changes on, production, AllowProduction off",
			tool:       aiProbeTool("probe", aiGroupChanges, true),
			settings:   ProjectAISettings{Enabled: true, AllowChanges: true},
			env:        "pro",
			wantBlock:  true,
			wantReason: "production",
		},
		{
			name:      "changes on, production, AllowProduction on",
			tool:      aiProbeTool("probe", aiGroupChanges, true),
			settings:  ProjectAISettings{Enabled: true, AllowChanges: true, AllowProduction: true},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:       "audit off",
			tool:       aiProbeTool("probe", aiGroupAudit, true),
			settings:   ProjectAISettings{Enabled: true, AllowAudit: false},
			env:        "dev",
			wantBlock:  true,
			wantReason: "audit log is off",
		},
		{
			name:      "audit on in production follows its own switch only",
			tool:      aiProbeTool("probe", aiGroupAudit, true),
			settings:  ProjectAISettings{Enabled: true, AllowAudit: true},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:      "context always on, production does not touch it",
			tool:      aiProbeTool("probe", aiGroupContext, false),
			settings:  ProjectAISettings{Enabled: true},
			env:       "pro",
			wantBlock: false,
		},
		{
			name:      "context tool with needsEnv false ignores connection-disabled too",
			tool:      aiProbeTool("probe", aiGroupContext, false),
			settings:  ProjectAISettings{Enabled: true, DisabledConnectionIDs: []string{"conn"}},
			env:       "dev",
			wantBlock: false,
		},
		{
			name:       "metadata blocked when this connection is off",
			tool:       aiProbeTool("probe", aiGroupMetadata, true),
			settings:   ProjectAISettings{Enabled: true, DisabledConnectionIDs: []string{"conn"}},
			env:        "dev",
			wantBlock:  true,
			wantReason: "off for this connection",
		},
		{
			name:       "assistant off for the project blocks every group",
			tool:       aiProbeTool("probe", aiGroupContext, false),
			settings:   ProjectAISettings{Enabled: false},
			env:        "dev",
			wantBlock:  true,
			wantReason: "off for this project",
		},
	}

	for _, tc := range rows {
		t.Run(tc.name, func(t *testing.T) {
			svc := toolService(t, "http://127.0.0.1:1")
			if _, err := svc.SetSettings(tc.settings); err != nil {
				t.Fatalf("SetSettings: %v", err)
			}
			svc.environment = func() string { return tc.env }
			reason, _ := svc.toolBlocked(tc.tool, tc.env)
			blocked := reason != ""
			if blocked != tc.wantBlock {
				t.Fatalf("got blocked=%v (reason %q), want blocked=%v", blocked, reason, tc.wantBlock)
			}
			if tc.wantReason != "" && !strings.Contains(reason, tc.wantReason) {
				t.Fatalf("reason %q does not mention %q", reason, tc.wantReason)
			}
		})
	}
}

func TestMcpBlockedGroupOffCarriesTheSettingsHint(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowChanges: false}); err != nil {
		t.Fatal(err)
	}
	tool := aiProbeTool("probe", aiGroupChanges, true)
	reason, hint := svc.toolBlocked(tool, "dev")
	if reason == "" || hint != groupDisabledHint {
		t.Fatalf("got reason=%q hint=%q, want the settings hint", reason, hint)
	}
}

func TestMcpBlockedViewModeStopsChangesAndDryRunOnly(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowChanges: true, AllowReadData: true}); err != nil {
		t.Fatal(err)
	}
	svc.viewMode = func() bool { return true }

	changes := aiProbeTool("propose_change", aiGroupChanges, true)
	if reason, _ := svc.toolBlocked(changes, "dev"); !strings.Contains(reason, "view mode") {
		t.Fatalf("a changes tool ran in view mode: %q", reason)
	}

	dryRun := aiProbeTool("dry_run", aiGroupReadData, true)
	if reason, _ := svc.toolBlocked(dryRun, "dev"); !strings.Contains(reason, "view mode") {
		t.Fatalf("dry_run ran in view mode: %q", reason)
	}

	// read_data under a different name is unaffected: it only reads.
	readOnly := aiProbeTool("run_readonly_query", aiGroupReadData, true)
	if reason, _ := svc.toolBlocked(readOnly, "dev"); reason != "" {
		t.Fatalf("a plain read_data tool was blocked by view mode: %q", reason)
	}

	svc.viewMode = func() bool { return false }
	if reason, _ := svc.toolBlocked(changes, "dev"); reason != "" {
		t.Fatalf("view mode off still blocked changes: %q", reason)
	}
}

func TestMcpBlockedWithNoViewModeClosureIsNotBlocked(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowChanges: true}); err != nil {
		t.Fatal(err)
	}
	svc.viewMode = nil
	tool := aiProbeTool("propose_change", aiGroupChanges, true)
	if reason, _ := svc.toolBlocked(tool, "dev"); reason != "" {
		t.Fatalf("an unset viewMode closure blocked a call: %q", reason)
	}
}

func TestGetDefinitionStaysListedWhenObjectTextIsOff(t *testing.T) {
	svc, status := startTestMCP(t, "dev")
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: "http://127.0.0.1:1/v1", Model: "local", IncludeBodies: false}); err != nil {
		t.Fatal(err)
	}
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, nil)
	if !strings.Contains(string(reply.Result), "get_definition") {
		t.Fatalf("get_definition was removed from tools/list while its switch was off: %s", reply.Result)
	}

	_, called := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_definition","arguments":{"name":"open_orders"}}}`, nil)
	var out mcpToolResult
	if err := json.Unmarshal(called.Result, &out); err != nil {
		t.Fatal(err)
	}
	if !out.IsError || !strings.Contains(out.Content[0].Text, "object text is off") {
		t.Fatalf("get_definition did not refuse by its own switch: %+v", out)
	}
}

func TestToolTargetEnvsReadsEachEnvArgumentAndDefaultsToTheOpenOne(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.environment = func() string { return "dev" }
	tool := aiTool{spec: ai.ToolSpec{Name: "probe"}, group: aiGroupMetadata, envArgs: []string{"from_env", "to_env"}}

	got := svc.toolTargetEnvs(tool, json.RawMessage(`{"from_env":"sta","to_env":" pro "}`))
	if strings.Join(got, ",") != "sta,pro" {
		t.Fatalf("got %v", got)
	}
	got = svc.toolTargetEnvs(tool, json.RawMessage(`{"to_env":5}`))
	if strings.Join(got, ",") != "dev,dev" {
		t.Fatalf("a missing or non-string env must mean the open one, got %v", got)
	}
	open := aiTool{spec: ai.ToolSpec{Name: "probe"}, group: aiGroupMetadata, needsEnv: true}
	if got := svc.toolTargetEnvs(open, json.RawMessage(`{"env":"pro"}`)); strings.Join(got, ",") != "dev" {
		t.Fatalf("a tool without envArgs only targets the open environment, got %v", got)
	}
}

// The production rule is judged on the environment a tool resolves, not the
// one open in the window: env:"pro" from a dev window is still production.
// Since ADR 0017 only proposing a change there needs AllowProduction.
func TestToolBlockedAppliesTheProductionRuleToTheTargetEnv(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowReadData: true, AllowChanges: true}); err != nil {
		t.Fatal(err)
	}
	svc.environment = func() string { return "dev" }
	changes := aiTool{spec: ai.ToolSpec{Name: "probe"}, group: aiGroupChanges, envArgs: []string{"env"}}
	if reason, _ := svc.toolBlocked(changes, svc.toolTargetEnvs(changes, json.RawMessage(`{"env":"pro"}`))...); !strings.Contains(reason, "target environment is production") {
		t.Fatalf("a change for env:pro from a dev window was not refused: %q", reason)
	}
	if reason, _ := svc.toolBlocked(changes, svc.toolTargetEnvs(changes, json.RawMessage(`{"env":"sta"}`))...); reason != "" {
		t.Fatalf("a change for env:sta was refused: %q", reason)
	}
	metadata := aiTool{spec: ai.ToolSpec{Name: "probe"}, group: aiGroupMetadata, envArgs: []string{"env"}}
	if reason, _ := svc.toolBlocked(metadata, svc.toolTargetEnvs(metadata, json.RawMessage(`{"env":"pro"}`))...); reason != "" {
		t.Fatalf("a schema read of env:pro was refused: %q", reason)
	}
	dryRun := aiProbeTool("dry_run", aiGroupReadData, true)
	if reason, hint := svc.toolBlocked(dryRun, "pro"); !strings.Contains(reason, "not allowed in production") || !strings.Contains(hint, "estimate_impact") {
		t.Fatalf("dry_run must stay refused on pro: %q %q", reason, hint)
	}
	both := aiTool{spec: ai.ToolSpec{Name: "probe"}, group: aiGroupChanges, envArgs: []string{"from_env", "to_env"}}
	if reason, _ := svc.toolBlocked(both, svc.toolTargetEnvs(both, json.RawMessage(`{"from_env":"dev","to_env":"pro"}`))...); reason == "" {
		t.Fatal("a two-env change with one side in production was not refused")
	}
}

func TestMcpBlockedChecksTheTargetEnvsOwnConnection(t *testing.T) {
	svc, _ := envResolverFixture(t)
	svc.environment = func() string { return "dev" }
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, DisabledConnectionIDs: []string{"conn-sta"}}); err != nil {
		t.Fatal(err)
	}
	tool := aiTool{spec: ai.ToolSpec{Name: "probe"}, group: aiGroupMetadata, envArgs: []string{"env"}}
	if reason, _ := svc.toolBlocked(tool, "STA"); !strings.Contains(reason, "off for this connection") {
		t.Fatalf("the staging connection is switched off but the call passed: %q", reason)
	}
	if reason, _ := svc.toolBlocked(tool, "dev"); reason != "" {
		t.Fatalf("dev was refused: %q", reason)
	}
}

func TestEveryToolThatResolvesItsOwnEnvDeclaresIt(t *testing.T) {
	for _, tool := range allAITools() {
		props := string(tool.spec.Parameters)
		// classify_sql only picks a policy by env; it never opens a connection.
		if strings.Contains(props, `"env":`) && len(tool.envArgs) == 0 && !tool.needsEnv && tool.spec.Name != "classify_sql" && tool.spec.Name != "get_audit_log" && tool.spec.Name != "list_changes" && tool.spec.Name != "list_restore_points" {
			t.Fatalf("%s takes env but declares no envArgs, so toolBlocked would judge the open environment instead", tool.spec.Name)
		}
	}
}

// The Run history switch in Settings promises the run history stays off until
// the project allows it, so every tool that returns it is behind that switch.
func TestRunHistoryToolsStayOffUntilAllowed(t *testing.T) {
	for _, name := range []string{"get_audit_log", "list_audit"} {
		tool, ok := findAITool(name)
		if !ok {
			t.Fatalf("%s is not a tool", name)
		}
		if tool.group != aiGroupAudit {
			t.Fatalf("%s is in group %q, not the run-history group", name, tool.group)
		}
		if groupEnabled(tool.group, ProjectAISettings{Enabled: true}) {
			t.Fatalf("%s is on without the Run history switch", name)
		}
		if !groupEnabled(tool.group, ProjectAISettings{Enabled: true, AllowAudit: true}) {
			t.Fatalf("%s is still off with the Run history switch on", name)
		}
	}
}
