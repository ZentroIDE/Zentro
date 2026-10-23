// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"zentro/internal/db"
	"zentro/internal/extensions/ai"
)

// The MCP server lets an external agent (Claude Code, Codex CLI, an IDE) call
// the same schema tools as the in-app chat. It is the Model Context Protocol
// over Streamable HTTP, with JSON replies and no server-sent stream.
//
// It is off until the user starts it. It listens on 127.0.0.1 only, needs a
// bearer token kept in the OS keyring, and refuses a request whose Host or
// Origin is not loopback, so a web page cannot reach it. Every call is checked
// against the same policy as the chat at the moment it runs: the assistant on
// for the project and the connection, no production environment, no airgap
// license. The agent may send what it reads to any model, so Zentro treats it
// as a cloud destination.
const (
	aiMCPDefaultPort = 47391
	aiMCPPath        = "/mcp"
	aiMCPLatest      = "2025-06-18"
	aiMCPMaxBody     = 1 << 20
	aiMCPKeyProject  = "zentro-mcp"
	aiMCPKeyHost     = "loopback"
)

var aiMCPVersions = []string{"2025-06-18", "2025-03-26", "2024-11-05"}

// AIMCPStatus is what Settings shows about the MCP server. The token is shown
// so the user can paste it into an agent's configuration.
type AIMCPStatus struct {
	Running  bool   `json:"running"`
	URL      string `json:"url"`
	Token    string `json:"token"`
	Calls    int    `json:"calls"`
	LastCall string `json:"lastCall"`
	// Blocked says why a call would be refused right now, or is empty.
	Blocked string `json:"blocked"`
	// AutoStart starts the server with Zentro, so agents set up once keep working.
	AutoStart bool `json:"autoStart"`
	// What is installed and set up on this computer, for the connect buttons.
	ClaudeDesktopFound      bool `json:"claudeDesktopFound"`
	ClaudeDesktopConfigured bool `json:"claudeDesktopConfigured"`
	ClaudeCodeFound         bool `json:"claudeCodeFound"`
	NodeFound               bool `json:"nodeFound"`
	// Clients is the catalog Settings renders. A new agent is another row
	// here; the boolean fields above stay filled for older clients.
	Clients []AIMCPClientPresence `json:"clients"`
}

// AIMCPClientPresence is one row of the MCP client catalog.
type AIMCPClientPresence struct {
	ID         string `json:"id"`
	Found      bool   `json:"found"`
	Configured bool   `json:"configured"`
	Removable  bool   `json:"removable"`
}

type aiMCPServer struct {
	mu       sync.Mutex
	server   *http.Server
	url      string
	token    string
	calls    int
	lastCall time.Time
	// limiter throttles tools/call. Created lazily by mcpLimiter in
	// ai_ratelimit.go, so it exists whether or not StartMCPServer ran.
	limiter *aiRateLimiter
	// auditLog is where a call is recorded (AppendMCPAudit). Wired once in
	// app.go, like AIService.viewMode; nil in a test that never sets it, in
	// which case writeMCPAudit is a no-op.
	auditLog *SQLAuditLogService
}

// StartMCPServer starts the server, or returns its status when it runs.
func (s *AIService) StartMCPServer() (AIMCPStatus, error) {
	if err := s.requireAllowed(); err != nil {
		return AIMCPStatus{}, err
	}
	if s.airgap != nil && s.airgap() {
		return AIMCPStatus{}, fmt.Errorf("this license keeps the assistant on this computer, so external agents cannot read the schema")
	}
	s.mcp.mu.Lock()
	running := s.mcp.server != nil
	s.mcp.mu.Unlock()
	if running {
		return s.MCPStatus(), nil
	}

	token, err := s.mcpToken()
	if err != nil {
		return AIMCPStatus{}, err
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", aiMCPDefaultPort))
	if err != nil {
		// The usual port is taken. Any free port works; the status shows which.
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return AIMCPStatus{}, fmt.Errorf("the MCP server could not open a port on this computer")
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc(aiMCPPath, s.handleMCP)
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	s.mcp.mu.Lock()
	s.mcp.server = server
	s.mcp.token = token
	s.mcp.url = "http://" + listener.Addr().String() + aiMCPPath
	s.mcp.mu.Unlock()

	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) && s.logger != nil {
			s.logger.Warn("mcp server stopped", "err", err)
		}
	}()
	if s.logger != nil {
		s.logger.Info("mcp server started", "addr", listener.Addr().String())
	}
	return s.MCPStatus(), nil
}

// StopMCPServer stops the server. It is safe to call when it is not running.
func (s *AIService) StopMCPServer() AIMCPStatus {
	s.mcp.mu.Lock()
	server := s.mcp.server
	s.mcp.server = nil
	s.mcp.url = ""
	s.mcp.mu.Unlock()
	if server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
		if s.logger != nil {
			s.logger.Info("mcp server stopped")
		}
	}
	return s.MCPStatus()
}

func (s *AIService) MCPStatus() AIMCPStatus {
	s.mcp.mu.Lock()
	status := AIMCPStatus{
		Running: s.mcp.server != nil,
		URL:     s.mcp.url,
		Calls:   s.mcp.calls,
	}
	if status.Running {
		status.Token = s.mcp.token
	}
	if !s.mcp.lastCall.IsZero() {
		status.LastCall = s.mcp.lastCall.UTC().Format(time.RFC3339)
	}
	s.mcp.mu.Unlock()
	status.Blocked, _ = s.toolBlocked(aiStatusProbe, s.envKey())
	s.mcpClientStatus(&status)
	return status
}

// mcpToken reads the token from the keyring, or makes and stores one. It stays
// the same across restarts so an agent's configuration keeps working.
func (s *AIService) mcpToken() (string, error) {
	if s.mcpTokenFn != nil {
		return s.mcpTokenFn()
	}
	if token, err := ai.LoadProviderKey(aiMCPKeyProject, aiMCPKeyHost); err == nil && strings.TrimSpace(token) != "" {
		return token, nil
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	if err := ai.SaveProviderKey(aiMCPKeyProject, aiMCPKeyHost, token); err != nil {
		return "", fmt.Errorf("the MCP token could not be saved in the OS keyring")
	}
	return token, nil
}

// aiStatusProbe stands in for "a schema tool", the strictest case, so
// AIMCPStatus.Blocked can show whether a call would be refused right now
// without naming one real tool.
var aiStatusProbe = aiTool{group: aiGroupMetadata, needsEnv: true}

// toolBlocked applies the project's permissions to a tool call, at call time,
// for the in-app chat and for an external agent alike. It returns a reason to
// show the user and, when the reason is that a group's own switch is off, a
// hint for where to turn it on. Two empty strings mean the call may proceed.
//
// targetEnvs are the environments the tool would act on (toolTargetEnvs):
// the open one for a tool that reads the open connection, or each env the
// tool resolves itself from its arguments. Every one must pass.
func (s *AIService) toolBlocked(tool aiTool, targetEnvs ...string) (reason, hint string) {
	if err := s.requireAllowed(); err != nil {
		return err.Error(), ""
	}
	if s.airgap != nil && s.airgap() {
		return "this license keeps the assistant on this computer", ""
	}
	settings, _, err := s.readSettings()
	if err != nil {
		return "open a project in Zentro", ""
	}
	if !settings.Enabled {
		return "the assistant is off for this project", ""
	}
	if !groupEnabled(tool.group, settings) {
		return groupDisabledReason(tool.group), groupDisabledHint
	}
	// View mode only reads; a tool that proposes or runs a change has nothing
	// to do here, named individually because dry_run sits in aiGroupReadData
	// (it only reads data back) even though it runs statements to do it.
	if s.viewMode != nil && s.viewMode() && (tool.group == aiGroupChanges || tool.spec.Name == "dry_run") {
		return "view mode only reads; it proposes and runs nothing", ""
	}
	if tool.spec.Name == "dry_run" {
		for _, targetEnv := range targetEnvs {
			if environmentIsProduction(targetEnv) {
				return "dry_run is not allowed in production", "Use estimate_impact instead."
			}
		}
	}
	if !tool.needsEnv && len(tool.envArgs) == 0 {
		return "", ""
	}
	for _, targetEnv := range targetEnvs {
		if s.envConnectionDisabled(settings, targetEnv) {
			return "the assistant is off for this connection", ""
		}
		if !environmentIsProduction(targetEnv) {
			continue
		}
		// ADR 0017: production follows the same rules as any environment for
		// reads, since blocking it only moves the user to staging, where the
		// same schema lives. Rows read in production always ask the user in the
		// chat. Proposing a change there still needs AllowProduction.
		if tool.group != aiGroupChanges || settings.AllowProduction {
			continue
		}
		if strings.EqualFold(targetEnv, s.envKey()) {
			return "the active environment is production", ""
		}
		return "the target environment is production", ""
	}
	return "", ""
}

// toolTargetEnvs lists the environments a call would act on: the open one
// for a tool that reads the open connection, plus the value of each of the
// tool's envArgs, where a blank value also means the open one. An argument
// that is not a string is left to the tool itself to reject.
func (s *AIService) toolTargetEnvs(tool aiTool, arguments json.RawMessage) []string {
	var out []string
	if tool.needsEnv {
		out = append(out, s.envKey())
	}
	if len(tool.envArgs) == 0 {
		return out
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(arguments, &fields)
	for _, name := range tool.envArgs {
		var value string
		_ = json.Unmarshal(fields[name], &value)
		if strings.TrimSpace(value) == "" {
			value = s.envKey()
		}
		out = append(out, strings.TrimSpace(value))
	}
	return out
}

// envConnectionDisabled reports whether the connection behind envKey is one
// the user switched the assistant off for. The open environment is checked
// through the open profile; any other through the project's binding.
func (s *AIService) envConnectionDisabled(settings ProjectAISettings, envKey string) bool {
	if envKey == "" || strings.EqualFold(envKey, s.envKey()) {
		return s.connectionDisabled(settings)
	}
	project := s.project()
	if project == nil {
		return false
	}
	for _, env := range project.Environments {
		if !strings.EqualFold(string(env.Key), envKey) || env.ConnectionRef == "" {
			continue
		}
		for _, id := range settings.DisabledConnectionIDs {
			if id == env.ConnectionRef {
				return true
			}
		}
	}
	return false
}

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type mcpError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *mcpError       `json:"error,omitempty"`
}

type mcpInitializeResult struct {
	ProtocolVersion string          `json:"protocolVersion"`
	Capabilities    mcpCapabilities `json:"capabilities"`
	ServerInfo      mcpServerInfo   `json:"serverInfo"`
	Instructions    string          `json:"instructions"`
}

type mcpCapabilities struct {
	Tools mcpToolsCapability `json:"tools"`
}

type mcpToolsCapability struct {
	ListChanged bool `json:"listChanged"`
}

type mcpServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type mcpEmpty struct{}

type mcpTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

type mcpToolList struct {
	Tools []mcpTool `json:"tools"`
}

type mcpContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpToolResult struct {
	Content []mcpContent `json:"content"`
	IsError bool         `json:"isError"`
}

func (s *AIService) handleMCP(w http.ResponseWriter, r *http.Request) {
	if !loopbackHost(r.Host) || !loopbackOrigin(r.Header.Get("Origin")) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.mcp.mu.Lock()
	token := s.mcp.token
	s.mcp.mu.Unlock()
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+token)) != 1 {
		w.Header().Set("WWW-Authenticate", "Bearer")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, aiMCPMaxBody))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req mcpRequest
	if err := json.Unmarshal(raw, &req); err != nil || req.JSONRPC != "2.0" || req.Method == "" {
		writeMCP(w, nil, nil, &mcpError{Code: -32700, Message: "not a JSON-RPC 2.0 request"})
		return
	}
	// A notification has no id and gets no reply.
	if len(req.ID) == 0 || string(req.ID) == "null" {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	result, rpcErr := s.dispatchMCP(r.Context(), req.Method, req.Params, mcpActor(r))
	writeMCP(w, req.ID, result, rpcErr)
}

// mcpActor names who is calling, for the audit trail. Each request is its
// own HTTP call with no session kept between them, so the client's own
// clientInfo (sent once, in initialize) is not available later; the
// User-Agent header is, and is what the spec falls back to.
func mcpActor(r *http.Request) string {
	ua := strings.TrimSpace(r.Header.Get("User-Agent"))
	if ua == "" {
		return "mcp:unknown"
	}
	return "mcp:" + ua
}

func (s *AIService) dispatchMCP(ctx context.Context, method string, params json.RawMessage, actor string) (any, *mcpError) {
	switch method {
	case "initialize":
		var in struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(params, &in)
		version := aiMCPLatest
		for _, supported := range aiMCPVersions {
			if in.ProtocolVersion == supported {
				version = supported
			}
		}
		return mcpInitializeResult{
			ProtocolVersion: version,
			Capabilities:    mcpCapabilities{Tools: mcpToolsCapability{ListChanged: false}},
			ServerInfo:      mcpServerInfo{Name: "zentro", Version: "1"},
			Instructions:    "Schema and app context, plus row counts when the user allowed them: estimate_impact and preview_cascade count a write without running it, and dry_run runs a write on development or staging and always rolls it back. Row values are never returned over MCP, and nothing is committed through it. Call get_app_context first, and search before naming an object.",
		}, nil
	case "ping":
		return mcpEmpty{}, nil
	case "tools/list":
		available := s.mcpTools()
		tools := make([]mcpTool, 0, len(available))
		for _, tool := range available {
			tools = append(tools, mcpTool{Name: tool.spec.Name, Description: tool.spec.Description, InputSchema: tool.spec.Parameters})
		}
		return mcpToolList{Tools: tools}, nil
	case "tools/call":
		var in struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(params, &in); err != nil || in.Name == "" {
			return nil, &mcpError{Code: -32602, Message: "tools/call needs a tool name"}
		}
		return s.callMCPTool(ctx, in.Name, in.Arguments, actor), nil
	default:
		return nil, &mcpError{Code: -32601, Message: "method not found: " + method}
	}
}

func (s *AIService) callMCPTool(ctx context.Context, name string, arguments json.RawMessage, actor string) mcpToolResult {
	s.mcp.mu.Lock()
	s.mcp.calls++
	s.mcp.lastCall = time.Now()
	s.mcp.mu.Unlock()

	text := func(content string, isError bool) mcpToolResult {
		return mcpToolResult{Content: []mcpContent{{Type: "text", Text: content}}, IsError: isError}
	}
	// An unknown or out-of-plan name is not resolved to a group, so it skips
	// straight to runTool below, which already turns either case into the
	// right envelope (the same one the chat gets); it is still audited.
	tool, known := findAITool(name)
	if known {
		if allowed, scope, retryAfter := s.mcpLimiter().allow(tool.group); !allowed {
			outcome := aiToolOutcome{Name: name, Failed: true}
			s.logToolUse("mcp", outcome)
			s.writeMCPAudit(actor, name, arguments, "denied", rateLimitMessage(scope))
			envelope := marshalEnvelope(aiEnvelope{
				OK:       false,
				Warnings: []string{},
				Error: &aiError{
					Code:      aiCodeRateLimited,
					Message:   rateLimitMessage(scope),
					Hint:      fmt.Sprintf("Wait %d seconds and try again.", retryAfter),
					Retryable: true,
				},
			})
			return text(envelope, true)
		}
		if tool.rows {
			outcome := aiToolOutcome{Name: name, Failed: true}
			s.logToolUse("mcp", outcome)
			reason := "this tool returns row values, which are never sent to an external agent"
			s.writeMCPAudit(actor, name, arguments, "denied", reason)
			return text(errorEnvelope(aiCodePermissionDenied, "Zentro refused this call: "+reason+".", "Ask in the Zentro assistant, where Data mode shows each sample before it is sent."), true)
		}
		if reason, hint := s.toolBlocked(tool, s.toolTargetEnvs(tool, arguments)...); reason != "" {
			outcome := aiToolOutcome{Name: name, Failed: true}
			s.logToolUse("mcp", outcome)
			s.writeMCPAudit(actor, name, arguments, "denied", reason)
			return text(errorEnvelope(aiCodePermissionDenied, "Zentro refused this call: "+reason+".", hint), true)
		}
	}
	settings, _, err := s.readSettings()
	if err != nil {
		s.writeMCPAudit(actor, name, arguments, "error", "could not read settings")
		return text(errorEnvelope(aiCodeInternal, "Zentro could not read its settings.", ""), true)
	}
	outcome := s.runTool(withExternalAgent(ctx), name, string(arguments), settings.IncludeBodies)
	s.logToolUse("mcp", outcome)
	s.writeMCPAudit(actor, name, arguments, outcomeStatus(outcome), "")
	return text(outcome.Content, outcome.Failed)
}

// outcomeStatus maps a tool's result to the audit Outcome enum. runTool's own
// refusals (an out-of-plan tool, get_definition with object text off, a
// result the scanner withheld) all carry the PERMISSION_DENIED code, same as
// a refusal caught earlier by toolBlocked, so they are "denied" here too, not
// a plain "error" -- which stays for a tool that ran and failed on its own
// terms (a name not found, bad arguments).
func outcomeStatus(outcome aiToolOutcome) string {
	if !outcome.Failed {
		return "ok"
	}
	var decoded struct {
		Error *struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(outcome.Content), &decoded); err == nil &&
		decoded.Error != nil && decoded.Error.Code == aiCodePermissionDenied {
		return "denied"
	}
	return "error"
}

// writeMCPAudit records one MCP call attempt, success or refusal. Only
// normalized SQL and its hash are kept from arguments, through
// mcpAuditSQLFields; never a literal value from the call.
func (s *AIService) writeMCPAudit(actor, action string, arguments json.RawMessage, status, reason string) {
	auditLog := s.mcp.auditLog
	if auditLog == nil {
		return
	}
	sqlNormalized, sqlHash := mcpAuditSQLFields(arguments)
	entry := SQLAuditEntry{
		Actor:         actor,
		Action:        action,
		Outcome:       status,
		SQLNormalized: sqlNormalized,
		SQLHash:       sqlHash,
		Error:         reason,
	}
	if profile := s.currentProfile(); profile != nil {
		entry.Profile = profile.Name
		entry.Driver = profile.Driver
	}
	entry.EnvKey = s.envKey()
	if s.project != nil {
		if project := s.project(); project != nil {
			entry.ProjectID = project.ID
		}
	}
	if err := auditLog.AppendMCPAudit(entry); err != nil && s.logger != nil {
		s.logger.Warn("mcp audit: append failed", "err", err)
	}
}

// mcpAuditSQLFields pulls a generic "sql" string argument out of a call, when
// the tool took one (classify_sql today; later packets add more). Normalized
// text and its hash are kept; the literal value never is.
func mcpAuditSQLFields(arguments json.RawMessage) (normalized, hash string) {
	var in struct {
		SQL string `json:"sql"`
	}
	if err := json.Unmarshal(arguments, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return "", ""
	}
	normalized = db.NormalizeLiterals(in.SQL)
	sum := sha256.Sum256([]byte(normalized))
	return normalized, hex.EncodeToString(sum[:])
}

func writeMCP(w http.ResponseWriter, id json.RawMessage, result any, rpcErr *mcpError) {
	reply := mcpResponse{JSONRPC: "2.0", ID: id, Result: result, Error: rpcErr}
	if len(reply.ID) == 0 {
		reply.ID = json.RawMessage("null")
	}
	if rpcErr != nil {
		reply.Result = nil
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(reply)
}

// loopbackHost accepts the Host header of a request made to 127.0.0.1 or
// localhost, on any port. Anything else is a page that resolved its own name
// to this computer.
func loopbackHost(host string) bool {
	name := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		name = h
	}
	name = strings.Trim(strings.ToLower(name), "[]")
	return name == "127.0.0.1" || name == "localhost" || name == "::1"
}

// loopbackOrigin accepts no Origin (an agent, not a browser) or a loopback one.
func loopbackOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return loopbackHost(parsed.Host)
}

// mcpTools is what an external agent is offered: the plan's tools minus any
// that return row values (ADR 0017).
func (s *AIService) mcpTools() []aiTool {
	all := s.toolsFor()
	out := make([]aiTool, 0, len(all))
	for _, tool := range all {
		if !tool.rows {
			out = append(out, tool)
		}
	}
	return out
}
