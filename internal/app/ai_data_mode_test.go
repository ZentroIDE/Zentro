// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/license"
)

func TestRowCapIsTen(t *testing.T) {
	if got := clampMaxRows(0, ExecutionPolicy{}); got != aiMaxDataRows {
		t.Fatalf("default %d", got)
	}
	if got := clampMaxRows(500, ExecutionPolicy{}); got != aiMaxDataRows {
		t.Fatalf("cap %d", got)
	}
	if got := clampMaxRows(3, ExecutionPolicy{}); got != 3 {
		t.Fatalf("a smaller request was changed to %d", got)
	}
}

func TestExternalAgentsAreNotOfferedRowTools(t *testing.T) {
	svc, status := startTestMCP(t, "dev")
	svc.canUse = func(license.FeatureID) bool { return true }
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowReadData: true, DataMode: true}); err != nil {
		t.Fatal(err)
	}
	_, list := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, nil)
	if strings.Contains(string(list.Result), "run_readonly_query") {
		t.Fatalf("tools/list offered a row tool: %s", list.Result)
	}
	_, call := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_readonly_query","arguments":{"env":"dev","sql":"select 1"}}}`, nil)
	if !strings.Contains(string(call.Result), `"isError":true`) || !strings.Contains(string(call.Result), "row values") {
		t.Fatalf("an external agent ran a row tool: %s", call.Result)
	}
}

func TestKeySamplesNeedDataModeAndNeverGoToAnExternalAgent(t *testing.T) {
	svc := readDataFixture(t)
	args := `{"env":"dev","sql":"UPDATE users SET status = 'x' WHERE id = 1","sample_keys":50}`

	inApp := svc.runTool(context.Background(), "estimate_impact", args, false)
	var data aiImpactDTO
	if err := json.Unmarshal(requireOK(t, inApp.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.KeySamples == nil || len(*data.KeySamples) > aiMaxDataRows {
		t.Fatalf("in-app key samples %+v", data.KeySamples)
	}

	external := svc.runTool(withExternalAgent(context.Background()), "estimate_impact", args, false)
	env := requireOK(t, external.Content)
	var ext aiImpactDTO
	if err := json.Unmarshal(env.Data, &ext); err != nil {
		t.Fatal(err)
	}
	if ext.KeySamples != nil {
		t.Fatalf("an external agent got key samples: %s", external.Content)
	}
	if !strings.Contains(external.Content, "Data mode") {
		t.Fatalf("the agent was not told why: %s", external.Content)
	}

	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowReadData: true}); err != nil {
		t.Fatal(err)
	}
	off := svc.runTool(context.Background(), "estimate_impact", args, false)
	var offData aiImpactDTO
	if err := json.Unmarshal(requireOK(t, off.Content).Data, &offData); err != nil {
		t.Fatal(err)
	}
	if offData.KeySamples != nil {
		t.Fatal("key samples were read with Data mode off")
	}
}

// A value that looks like personal data is hidden cell by cell, whatever the
// column is called, and the rest of the result still goes to the model.
func TestShapeLikeCellsAreHiddenEvenUnderAnAlias(t *testing.T) {
	svc := readDataFixture(t)
	out := svc.runTool(context.Background(), "run_readonly_query", `{"env":"dev","sql":"SELECT id, 'alice@example.com' AS contact, status FROM users ORDER BY id"}`, false)
	var data aiReadonlyQueryDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.Content, "alice@example.com") {
		t.Fatal("an email went out under an alias")
	}
	if data.Rows[0][1] != "***" || data.Rows[0][0] == "***" {
		t.Fatalf("rows %v", data.Rows)
	}
}
