// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
	"zentro/internal/extensions/license"
)

// The chat used to call runTool directly, so it ran any tool in the plan
// whatever the project's switches said. A model could read rows with the
// read-data switch off.
func TestChatRefusesRowReadsWithDataModeOff(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.canUse = func(license.FeatureID) bool { return true }
	out := svc.chatToolCall(context.Background(), ai.ToolCall{Name: "run_readonly_query", Arguments: `{"env":"dev","sql":"select 1"}`}, false)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodePermissionDenied || !strings.Contains(env.Error.Message, "Data mode is off") {
		t.Fatalf("the chat ran a row read with Data mode off: %s", out.Content)
	}
}

// Data mode is a switch, not a plan feature: the assistant is free on every
// plan (ADR 0019). With the switch on, a free plan is offered the tool and the
// call is not refused for its plan.
func TestFreePlanCanReadRowsWhenDataModeIsOn(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.canUse = func(license.FeatureID) bool { return false }
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, DataMode: true}); err != nil {
		t.Fatal(err)
	}
	out := svc.chatToolCall(context.Background(), ai.ToolCall{Name: "run_readonly_query", Arguments: `{"env":"dev","sql":"select 1"}`}, false)
	if env := decodeEnvelope(t, out.Content); env.Error != nil && env.Error.Code == aiCodePermissionDenied {
		t.Fatalf("a free plan was refused the row read: %s", out.Content)
	}
	offered := false
	for _, spec := range svc.toolSpecs(ProjectAISettings{Enabled: true, DataMode: true}) {
		offered = offered || spec.Name == "run_readonly_query"
	}
	if !offered {
		t.Fatal("run_readonly_query was not offered with Data mode on")
	}
}

func TestChatStillRunsMetadataTools(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.chatToolCall(context.Background(), ai.ToolCall{Name: "search_schema", Arguments: `{"query":"customer"}`}, false)
	requireOK(t, out.Content)
}

func TestChatDoesNotOfferToolsWhoseGroupIsOff(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	names := func(settings ProjectAISettings) map[string]bool {
		out := map[string]bool{}
		for _, spec := range svc.toolSpecs(settings) {
			out[spec.Name] = true
		}
		return out
	}
	off := names(ProjectAISettings{Enabled: true})
	for _, name := range []string{"run_readonly_query", "estimate_impact", "propose_change", "get_definition", "get_audit_log", "list_audit"} {
		if off[name] {
			t.Fatalf("%s was offered with its switch off", name)
		}
	}
	if !off["search_schema"] {
		t.Fatal("metadata tools must always be offered")
	}
	// The chat saves notes with the <remember> tag, so the note tools stay
	// out of its tool list (MCP still has them).
	if off["remember"] || off["forget"] || off["list_notes"] {
		t.Fatal("note tools were offered to the chat")
	}
	svc.canUse = func(license.FeatureID) bool { return true }
	on := names(ProjectAISettings{Enabled: true, AllowReadData: true, DataMode: true, AllowChanges: true})
	if !on["run_readonly_query"] || !on["propose_change"] {
		t.Fatal("a switched-on group was not offered")
	}
}

func TestDryRunErrorCarriesNoDatabaseText(t *testing.T) {
	msg := dryRunErrorMessage("23505", "users_email_key")
	if strings.Contains(msg, "@") || !strings.Contains(msg, "users_email_key") || !strings.Contains(msg, "23505") {
		t.Fatalf("unexpected message %q", msg)
	}
	if got := dryRunErrorMessage("", ""); got != "the statement failed" {
		t.Fatalf("bare message %q", got)
	}
}
