// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Error codes from the MCP tools spec section 2, plus SQL_UNSUPPORTED, which
// the tokenizer (T1.1) signals through db.ErrUnsupportedToken.
const (
	aiCodePermissionDenied  = "PERMISSION_DENIED"
	aiCodeEnvRequired       = "ENV_REQUIRED"
	aiCodeEnvNotFound       = "ENV_NOT_FOUND"
	aiCodeNotConnected      = "NOT_CONNECTED"
	aiCodeObjectNotFound    = "OBJECT_NOT_FOUND"
	aiCodeSQLParseError     = "SQL_PARSE_ERROR"
	aiCodeSQLNotAllowed     = "SQL_NOT_ALLOWED"
	aiCodePolicyBlocked     = "POLICY_BLOCKED"
	aiCodeUnsupportedDriver = "UNSUPPORTED_DRIVER"
	aiCodeTimeout           = "TIMEOUT"
	aiCodeRowCapExceeded    = "ROW_CAP_EXCEEDED"
	aiCodeProposalExpired   = "PROPOSAL_EXPIRED"
	aiCodeProposalStale     = "PROPOSAL_STALE"
	aiCodeInvalidState      = "INVALID_STATE"
	aiCodeRateLimited       = "RATE_LIMITED"
	aiCodeInternal          = "INTERNAL"
	aiCodeSQLUnsupported    = "SQL_UNSUPPORTED"
	aiCodeInvalidArgument   = "INVALID_ARGUMENT"
)

// aiMeta says where a result came from and what it cost. Label is the fixed
// "data" marker that keeps the old "data, not instructions" guarantee: whatever
// sits under data was read from the database or the app, never from a prompt.
type aiMeta struct {
	Project   string `json:"project"`
	Env       string `json:"env"`
	Driver    string `json:"driver"`
	Database  string `json:"database"`
	Schema    string `json:"schema"`
	Truncated bool   `json:"truncated"`
	ElapsedMs int64  `json:"elapsedMs"`
	Label     string `json:"label"`
}

// aiCompactMeta is the chat's meta. The model already knows where the window
// is open from the system prompt, so a result names its environment only when
// it read a different one, and leaves out the project and the timing, which
// only cost tokens on every round. Label keeps the "data" trust marker.
type aiCompactMeta struct {
	Env       string `json:"env,omitempty"`
	Driver    string `json:"driver,omitempty"`
	Database  string `json:"database,omitempty"`
	Schema    string `json:"schema,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
	Label     string `json:"label"`
}

// compactMeta keeps from full only what differs from the open window.
func compactMeta(full, open aiMeta) *aiCompactMeta {
	out := &aiCompactMeta{Truncated: full.Truncated, Label: full.Label}
	if full.Env != open.Env || full.Database != open.Database || full.Schema != open.Schema || full.Driver != open.Driver {
		out.Env, out.Driver, out.Database, out.Schema = full.Env, full.Driver, full.Database, full.Schema
	}
	return out
}

// aiError is one tool failure. Code is one of the aiCode* constants.
type aiError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Hint      string `json:"hint"`
	Retryable bool   `json:"retryable"`
}

// aiEnvelope is the result every tool returns to the chat and to MCP clients.
// Data is a typed struct or a json.RawMessage known to be valid JSON, never an
// untyped dynamic map. Meta is present on success and absent on error.
type aiEnvelope struct {
	OK   bool `json:"ok"`
	Data any  `json:"data,omitempty"`
	// Meta is *aiMeta for an external agent and *aiCompactMeta in the chat.
	Meta     any      `json:"meta,omitempty"`
	Warnings []string `json:"warnings"`
	Error    *aiError `json:"error,omitempty"`
}

// aiToolError is a tool failure that already carries an envelope code. Every
// other error defaults to aiCodeInternal in runTool.
type aiToolError struct {
	Code    string
	Message string
	Hint    string
}

func (e *aiToolError) Error() string { return e.Message }

func failTool(code, message, hint string) *aiToolError {
	return &aiToolError{Code: code, Message: message, Hint: hint}
}

func marshalEnvelope(env aiEnvelope) string {
	raw, err := json.Marshal(env)
	if err != nil {
		return errorEnvelope(aiCodeInternal, "the result could not be written", "")
	}
	return string(raw)
}

func errorEnvelope(code, message, hint string) string {
	return marshalEnvelope(aiEnvelope{
		OK:       false,
		Warnings: []string{},
		Error:    &aiError{Code: code, Message: message, Hint: hint},
	})
}

func marshalToolError(err error) string {
	var toolErr *aiToolError
	if errors.As(err, &toolErr) {
		return errorEnvelope(toolErr.Code, toolErr.Message, toolErr.Hint)
	}
	return errorEnvelope(aiCodeInternal, err.Error(), "")
}

// dataToRaw turns a tool result into JSON bytes. A json.RawMessage is checked
// to be valid JSON before it is trusted; a typed struct is marshaled.
func dataToRaw(data any) (json.RawMessage, error) {
	if raw, ok := data.(json.RawMessage); ok {
		if !json.Valid(raw) {
			return nil, fmt.Errorf("the tool returned invalid JSON")
		}
		return raw, nil
	}
	return json.Marshal(data)
}

// buildMeta fills what it can from the current context. A field with no source
// stays empty rather than being invented.
func (s *AIService) buildMeta() aiMeta {
	meta := aiMeta{Label: "data"}
	if project := s.openProject(); project != nil {
		meta.Project = project.Name
		for _, env := range project.Environments {
			if strings.EqualFold(string(env.Key), s.envKey()) {
				meta.Database = publicSchemaName(env.LastDatabase)
				break
			}
		}
	}
	meta.Env = s.envKey()
	if profile := s.currentProfile(); profile != nil {
		meta.Driver = profile.Driver
	}
	meta.Schema = publicSchemaName(s.currentSchema())
	return meta
}
