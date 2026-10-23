// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
)

// withNumericProbeTool installs one context tool whose result is a large
// number next to a string value, so a test can tell runTool's scanner apart
// from the old ScanText-on-the-whole-JSON-text behavior.
func withNumericProbeTool(t *testing.T) {
	t.Helper()
	saved := aiContextTools
	type numericData struct {
		EstRows int64  `json:"estRows"`
		Note    string `json:"note"`
	}
	aiContextTools = []aiTool{{
		spec:  ai.ToolSpec{Name: "numeric_probe", Description: "d", Parameters: json.RawMessage(`{"type":"object"}`)},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "probe" },
		live: func(context.Context, *AIService, ai.Catalog, json.RawMessage) (any, error) {
			return numericData{EstRows: 1234567890, Note: "structural metadata only"}, nil
		},
	}}
	t.Cleanup(func() { aiContextTools = saved })
}

func TestRunToolDoesNotWithholdALargeNumberInTheResult(t *testing.T) {
	withNumericProbeTool(t)
	svc := toolService(t, "http://127.0.0.1:1")

	out := svc.runTool(context.Background(), "numeric_probe", `{}`, false)
	if out.Failed || out.Withheld {
		t.Fatalf("a large numeric field was withheld as if it were a phone number: %+v", out)
	}
	env := requireOK(t, out.Content)
	if !strings.Contains(string(env.Data), "1234567890") {
		t.Fatalf("the number did not survive in the result: %s", out.Content)
	}
}

func TestRunToolStillWithholdsAGenuineSensitiveStringNextToANumber(t *testing.T) {
	saved := aiContextTools
	t.Cleanup(func() { aiContextTools = saved })
	type numericData struct {
		EstRows int64  `json:"estRows"`
		Note    string `json:"note"`
	}
	aiContextTools = []aiTool{{
		spec:  ai.ToolSpec{Name: "numeric_probe", Description: "d", Parameters: json.RawMessage(`{"type":"object"}`)},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "probe" },
		live: func(context.Context, *AIService, ai.Catalog, json.RawMessage) (any, error) {
			return numericData{EstRows: 1234567890, Note: "contact admin@example.com for access"}, nil
		},
	}}
	svc := toolService(t, "http://127.0.0.1:1")

	out := svc.runTool(context.Background(), "numeric_probe", `{}`, false)
	if !out.Withheld {
		t.Fatalf("a genuine email next to a large number was not withheld: %+v", out)
	}
	if strings.Contains(out.Content, "admin@example.com") {
		t.Fatalf("the sensitive value leaked: %s", out.Content)
	}
}
