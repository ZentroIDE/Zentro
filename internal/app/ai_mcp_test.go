// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"zentro/internal/models"
)

func startTestMCP(t *testing.T, environment string) (*AIService, AIMCPStatus) {
	t.Helper()
	svc := toolService(t, "http://127.0.0.1:1")
	svc.environment = func() string { return environment }
	svc.mcpTokenFn = func() (string, error) { return "test-token", nil }
	status, err := svc.StartMCPServer()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { svc.StopMCPServer() })
	return svc, status
}

type mcpReply struct {
	Result json.RawMessage `json:"result"`
	Error  *mcpError       `json:"error"`
}

func callMCP(t *testing.T, status AIMCPStatus, token, body string, header map[string]string) (int, mcpReply) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, status.URL, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for key, value := range header {
		if key == "Host" {
			req.Host = value
			continue
		}
		req.Header.Set(key, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var reply mcpReply
	_ = json.Unmarshal(raw, &reply)
	return resp.StatusCode, reply
}

func TestMCPServerListensOnLoopbackOnly(t *testing.T) {
	_, status := startTestMCP(t, "dev")
	if !status.Running || !strings.HasPrefix(status.URL, "http://127.0.0.1:") || !strings.HasSuffix(status.URL, "/mcp") {
		t.Fatalf("status %+v", status)
	}
	if status.Token != "test-token" {
		t.Fatal("the token is not shown while the server runs")
	}
}

func TestMCPHandshakeListAndCall(t *testing.T) {
	_, status := startTestMCP(t, "dev")

	code, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`, nil)
	if code != http.StatusOK || reply.Error != nil || !strings.Contains(string(reply.Result), `"protocolVersion":"2025-03-26"`) {
		t.Fatalf("initialize %d %s %+v", code, reply.Result, reply.Error)
	}

	code, _ = callMCP(t, status, "test-token", `{"jsonrpc":"2.0","method":"notifications/initialized"}`, nil)
	if code != http.StatusAccepted {
		t.Fatalf("a notification got %d", code)
	}

	_, reply = callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, nil)
	for _, name := range []string{"search_schema", "describe_table", "get_definition", "inputSchema"} {
		if !strings.Contains(string(reply.Result), name) {
			t.Fatalf("tools/list missing %s: %s", name, reply.Result)
		}
	}

	_, reply = callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"describe_table","arguments":{"table":"orders"}}}`, nil)
	var result struct {
		Content []struct{ Text string } `json:"content"`
		IsError bool                    `json:"isError"`
	}
	_ = json.Unmarshal(reply.Result, &result)
	if result.IsError || len(result.Content) != 1 || !strings.Contains(result.Content[0].Text, `"ok":true`) || !strings.Contains(result.Content[0].Text, `"name":"customer_id"`) {
		t.Fatalf("tools/call %s", reply.Result)
	}

	_, reply = callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":4,"method":"resources/list"}`, nil)
	if reply.Error == nil || reply.Error.Code != -32601 {
		t.Fatalf("an unknown method was answered: %+v", reply)
	}
}

func TestMCPRefusesWithoutTheTokenOrFromAPage(t *testing.T) {
	_, status := startTestMCP(t, "dev")
	body := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	if code, _ := callMCP(t, status, "", body, nil); code != http.StatusUnauthorized {
		t.Fatalf("no token got %d", code)
	}
	if code, _ := callMCP(t, status, "wrong", body, nil); code != http.StatusUnauthorized {
		t.Fatalf("a wrong token got %d", code)
	}
	if code, _ := callMCP(t, status, "test-token", body, map[string]string{"Host": "evil.example:47391"}); code != http.StatusForbidden {
		t.Fatalf("a foreign Host got %d", code)
	}
	if code, _ := callMCP(t, status, "test-token", body, map[string]string{"Origin": "https://evil.example"}); code != http.StatusForbidden {
		t.Fatalf("a foreign Origin got %d", code)
	}
	resp, err := http.Get(status.URL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed && resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("GET got %d", resp.StatusCode)
	}
}

func TestMCPCallsFollowThePolicyAtTheTimeTheyRun(t *testing.T) {
	svc, status := startTestMCP(t, string(models.EnvironmentProduction))
	// ADR 0017: reading the schema in production is allowed like anywhere else.
	if status.Blocked != "" {
		t.Fatalf("status says production is blocked: %q", status.Blocked)
	}
	_, reply := callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_schema","arguments":{"query":"order"}}}`, nil)
	if strings.Contains(string(reply.Result), `"isError":true`) {
		t.Fatalf("a schema read in production was refused: %s", reply.Result)
	}

	svc.environment = func() string { return "dev" }
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: false}); err != nil {
		t.Fatal(err)
	}
	_, reply = callMCP(t, status, "test-token", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_schema","arguments":{"query":"order"}}}`, nil)
	if !strings.Contains(string(reply.Result), "off for this project") {
		t.Fatalf("a call went through with the assistant off: %s", reply.Result)
	}

	svc.profile = func() *models.ConnectionProfile { return &models.ConnectionProfile{ID: "conn"} }
	if svc.MCPStatus().Calls != 2 {
		t.Fatalf("calls were not counted: %+v", svc.MCPStatus())
	}
}

func TestMCPStopsCleanly(t *testing.T) {
	svc, status := startTestMCP(t, "dev")
	stopped := svc.StopMCPServer()
	if stopped.Running || stopped.Token != "" {
		t.Fatalf("status after stop %+v", stopped)
	}
	if _, err := http.Post(status.URL, "application/json", strings.NewReader("{}")); err == nil {
		t.Fatal("the server still answers after stop")
	}
}

func TestMCPIsRefusedUnderAnAirgapLicense(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.airgap = func() bool { return true }
	svc.mcpTokenFn = func() (string, error) { return "t", nil }
	if _, err := svc.StartMCPServer(); err == nil {
		svc.StopMCPServer()
		t.Fatal("the server started under an airgap license")
	}
}

func TestMCPAutoStartIsRememberedAndUsed(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.mcpTokenFn = func() (string, error) { return "t", nil }
	status, err := svc.SetMCPAutoStart(true)
	if err != nil || !status.AutoStart {
		t.Fatalf("auto start not saved: %+v %v", status, err)
	}
	svc.AutoStartMCP()
	t.Cleanup(func() { svc.StopMCPServer() })
	if !svc.MCPStatus().Running {
		t.Fatal("the server did not start with auto start on")
	}
}

func TestRotatingTheTokenLocksOutTheOldOne(t *testing.T) {
	svc, status := startTestMCP(t, "dev")
	svc.mcpTokenFn = func() (string, error) { return "new-token", nil }
	rotated, err := svc.RotateMCPToken()
	if err != nil || rotated.Token != "new-token" {
		t.Fatalf("rotate %+v %v", rotated, err)
	}
	body := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	if code, _ := callMCP(t, status, "test-token", body, nil); code != http.StatusUnauthorized {
		t.Fatalf("the old token still works: %d", code)
	}
	if code, _ := callMCP(t, rotated, "new-token", body, nil); code != http.StatusOK {
		t.Fatalf("the new token does not work: %d", code)
	}
}

func TestConnectingAnAgentNeedsTheServerAndAKnownAgent(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.ConnectMCPClient(context.Background(), "claude-desktop"); err == nil || !strings.Contains(err.Error(), "start the MCP server") {
		t.Fatalf("connected with the server off: %v", err)
	}
	svc.mcpTokenFn = func() (string, error) { return "t", nil }
	if _, err := svc.StartMCPServer(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { svc.StopMCPServer() })
	if _, err := svc.ConnectMCPClient(context.Background(), "unknown"); err == nil {
		t.Fatal("an unknown agent was accepted")
	}
	if _, err := svc.DisconnectMCPClient("claude-code"); err == nil || !strings.Contains(err.Error(), "claude mcp remove") {
		t.Fatalf("disconnect for Claude Code should point to its own command: %v", err)
	}
}
