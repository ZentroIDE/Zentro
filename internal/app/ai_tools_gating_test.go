// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
	"zentro/internal/extensions/license"
)

// withContextTools installs two stand-in context tools for one test: one for
// every plan, one that needs a license feature (the mechanism a paid tool would
// use; no shipped tool needs one today, the assistant is free).
func withContextTools(t *testing.T) {
	t.Helper()
	saved := aiContextTools
	run := func(ai.Catalog, json.RawMessage, bool) (any, error) { return "app context", nil }
	label := func(json.RawMessage) string { return "Read app context" }
	aiContextTools = []aiTool{
		{
			spec:  ai.ToolSpec{Name: "free_context", Description: "d", Parameters: json.RawMessage(`{"type":"object"}`)},
			group: aiGroupContext, label: label, run: run,
		},
		{
			spec:    ai.ToolSpec{Name: "pro_context", Description: "d", Parameters: json.RawMessage(`{"type":"object"}`)},
			group:   aiGroupContext,
			feature: license.FeatureID("test.pro_context"),
			label:   label, run: run,
		},
	}
	t.Cleanup(func() { aiContextTools = saved })
}

func toolNames(tools []aiTool) []string {
	names := make([]string, 0, len(tools))
	for _, tool := range tools {
		names = append(names, tool.spec.Name)
	}
	return names
}

func TestToolsFollowThePlan(t *testing.T) {
	withContextTools(t)
	svc := toolService(t, "http://127.0.0.1:1")

	svc.canUse = func(license.FeatureID) bool { return false }
	free := strings.Join(toolNames(svc.toolsFor()), ",")
	if !strings.Contains(free, "free_context") || strings.Contains(free, "pro_context") {
		t.Fatalf("the free plan was offered %s", free)
	}

	svc.canUse = func(id license.FeatureID) bool { return id == license.FeatureID("test.pro_context") }
	pro := strings.Join(toolNames(svc.toolsFor()), ",")
	if !strings.Contains(pro, "pro_context") {
		t.Fatalf("the pro plan was offered %s", pro)
	}

	svc.canUse = nil
	if strings.Contains(strings.Join(toolNames(svc.toolsFor()), ","), "pro_context") {
		t.Fatal("a tool that needs a feature was offered with no license check")
	}
}

func TestAToolOutsideThePlanDoesNotRun(t *testing.T) {
	withContextTools(t)
	svc := toolService(t, "http://127.0.0.1:1")
	svc.canUse = func(license.FeatureID) bool { return false }

	out := svc.runTool(context.Background(), "pro_context", `{}`, false)
	if !out.Failed || !strings.Contains(out.Content, "not part of this plan") {
		t.Fatalf("a tool outside the plan ran: %+v", out)
	}
	svc.canUse = func(license.FeatureID) bool { return true }
	if out := svc.runTool(context.Background(), "pro_context", `{}`, false); out.Failed {
		t.Fatalf("a tool inside the plan failed: %+v", out)
	}
}

func TestMCPListsOnlyThePlansTools(t *testing.T) {
	withContextTools(t)
	svc, status := startTestMCP(t, "dev")
	svc.canUse = func(license.FeatureID) bool { return false }

	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, nil)
	if strings.Contains(string(reply.Result), "pro_context") || !strings.Contains(string(reply.Result), "free_context") {
		t.Fatalf("tools/list ignored the plan: %s", reply.Result)
	}
	// Out-of-plan is a tool result (isError:true, like runTool gives the
	// chat), not a JSON-RPC protocol error, so it is auditable and carries a
	// proper envelope code.
	_, reply = callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pro_context","arguments":{}}}`, nil)
	if reply.Error != nil {
		t.Fatalf("an out-of-plan call became a protocol error: %+v", reply.Error)
	}
	if !strings.Contains(string(reply.Result), `"isError":true`) || !strings.Contains(string(reply.Result), aiCodePermissionDenied) {
		t.Fatalf("a tool outside the plan was not refused by envelope: %s", reply.Result)
	}
}

func TestProductionServesSchemaAndContextTools(t *testing.T) {
	withContextTools(t)
	svc, status := startTestMCP(t, "pro")
	svc.canUse = func(license.FeatureID) bool { return true }

	_, schema := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_schema","arguments":{"query":"order"}}}`, nil)
	if strings.Contains(string(schema.Result), `"isError":true`) {
		t.Fatalf("a schema tool was refused in production: %s", schema.Result)
	}
	_, appContext := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"free_context","arguments":{}}}`, nil)
	if strings.Contains(string(appContext.Result), `"isError":true`) || !strings.Contains(string(appContext.Result), "app context") {
		t.Fatalf("a context tool was refused in production: %s", appContext.Result)
	}
}

func TestContextToolsStillNeedTheAssistantOn(t *testing.T) {
	withContextTools(t)
	svc, status := startTestMCP(t, "pro")
	svc.canUse = func(license.FeatureID) bool { return true }
	svc.airgap = func() bool { return true }

	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"free_context","arguments":{}}}`, nil)
	if !strings.Contains(string(reply.Result), `"isError":true`) {
		t.Fatalf("an airgap license still served a context tool: %s", reply.Result)
	}
}
