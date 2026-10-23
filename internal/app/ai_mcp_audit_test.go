// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"testing"

	"zentro/internal/extensions/license"
)

// startAuditedTestMCP is startTestMCP with a real (tempdir-backed) audit log
// wired in, so a test can read back what a call recorded.
func startAuditedTestMCP(t *testing.T, environment string) (*AIService, AIMCPStatus, *SQLAuditLogService) {
	t.Helper()
	svc, status := startTestMCP(t, environment)
	auditLog, _ := newAuditServiceForTest(t)
	svc.mcp.auditLog = auditLog
	return svc, status, auditLog
}

func lastAuditEntry(t *testing.T, auditLog *SQLAuditLogService) SQLAuditEntry {
	t.Helper()
	entries, err := auditLog.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("no audit entry was written")
	}
	return entries[0] // newest-first
}

func TestMCPAuditRecordsASuccessfulCall(t *testing.T) {
	_, status, auditLog := startAuditedTestMCP(t, "dev")
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"classify_sql","arguments":{"sql":"delete from t where id = 42"}}}`, map[string]string{"User-Agent": "claude-code/1.0"})
	if strings.Contains(string(reply.Result), `"isError":true`) {
		t.Fatalf("the call failed, want success: %s", reply.Result)
	}

	e := lastAuditEntry(t, auditLog)
	if e.Source != "mcp" || e.Action != "classify_sql" || e.Outcome != "ok" {
		t.Fatalf("a successful call was not recorded right: %+v", e)
	}
	if e.Actor != "mcp:claude-code/1.0" {
		t.Fatalf("the actor was not read from User-Agent: %q", e.Actor)
	}
	if e.SQLNormalized == "" || strings.Contains(e.SQLNormalized, "42") {
		t.Fatalf("the SQL was not normalized before it was stored: %q", e.SQLNormalized)
	}
	if e.SQLHash == "" {
		t.Fatal("the SQL hash is empty")
	}
}

func TestMCPAuditRecordsACallRefusedByPermission(t *testing.T) {
	svc, status, auditLog := startAuditedTestMCP(t, "dev")
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: "http://127.0.0.1:1/v1", Model: "local", IncludeBodies: false}); err != nil {
		t.Fatal(err)
	}
	// An explicit empty User-Agent (not just an absent header, which Go's own
	// client fills in with its own default) is what "no client name at all"
	// looks like on the wire.
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_definition","arguments":{"name":"x"}}}`, map[string]string{"User-Agent": ""})
	if !strings.Contains(string(reply.Result), `"isError":true`) {
		t.Fatalf("expected a refusal: %s", reply.Result)
	}

	e := lastAuditEntry(t, auditLog)
	if e.Outcome != "denied" || e.Action != "get_definition" {
		t.Fatalf("a permission refusal was not recorded right: %+v", e)
	}
	if e.Error == "" {
		t.Fatal("the refusal reason was not recorded")
	}
	if e.Actor != "mcp:unknown" {
		t.Fatalf("a request with an empty User-Agent should record mcp:unknown, got %q", e.Actor)
	}
}

func TestMCPAuditRecordsACallRefusedByTheRateLimit(t *testing.T) {
	svc, status, auditLog := startAuditedTestMCP(t, "dev")
	for i := 0; i < aiRateLimitGlobal; i++ {
		callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"classify_sql","arguments":{"sql":"select 1"}}}`, nil)
	}
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"classify_sql","arguments":{"sql":"select 1"}}}`, nil)
	if !strings.Contains(string(reply.Result), aiCodeRateLimited) {
		t.Fatalf("expected a rate-limited refusal: %s", reply.Result)
	}

	e := lastAuditEntry(t, auditLog)
	if e.Outcome != "denied" {
		t.Fatalf("a rate-limited call was not recorded as denied: %+v", e)
	}
	_ = svc
}

func TestMCPAuditRecordsAnUnknownToolCall(t *testing.T) {
	_, status, auditLog := startAuditedTestMCP(t, "dev")
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}`, nil)
	if reply.Error != nil {
		t.Fatalf("an unknown tool became a protocol error, not an envelope: %+v", reply.Error)
	}
	e := lastAuditEntry(t, auditLog)
	if e.Action != "no_such_tool" || e.Outcome != "error" {
		t.Fatalf("an unknown-tool call was not recorded: %+v", e)
	}
}

// A refusal runTool itself produces (not caught earlier by toolBlocked) must
// still be classified "denied", the same as one toolBlocked catches -- both
// carry the PERMISSION_DENIED code. The withheld-result and out-of-plan
// paths are two different runTool refusals that share this code.
func TestMCPAuditClassifiesARunToolRefusalAsDenied(t *testing.T) {
	withContextTools(t) // adds pro_context, a stand-in tool that needs a license feature
	svc, status, auditLog := startAuditedTestMCP(t, "dev")
	svc.canUse = func(license.FeatureID) bool { return false }
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pro_context","arguments":{}}}`, nil)
	if !strings.Contains(string(reply.Result), aiCodePermissionDenied) {
		t.Fatalf("expected a PERMISSION_DENIED envelope: %s", reply.Result)
	}
	e := lastAuditEntry(t, auditLog)
	if e.Outcome != "denied" {
		t.Fatalf("a runTool-level PERMISSION_DENIED was recorded as %q, want denied", e.Outcome)
	}
}

func TestMCPAuditChainStaysValidAcrossMixedOutcomes(t *testing.T) {
	svc, status, auditLog := startAuditedTestMCP(t, "dev")
	callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"classify_sql","arguments":{"sql":"select 1"}}}`, nil)
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: "http://127.0.0.1:1/v1", Model: "local", IncludeBodies: false}); err != nil {
		t.Fatal(err)
	}
	callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_definition","arguments":{"name":"x"}}}`, nil)
	callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}`, nil)

	brokenID, valid, err := auditLog.VerifyChain()
	if err != nil {
		t.Fatal(err)
	}
	if !valid || brokenID != "" {
		t.Fatalf("a mix of ok/denied/error calls broke the chain: id=%q", brokenID)
	}
}
