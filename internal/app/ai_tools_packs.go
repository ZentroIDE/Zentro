// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"zentro/internal/extensions/ai"
)

// The chat offers the model a small core of tools on every request and keeps
// the rest in packs it loads only when a question needs them. Every tool
// definition is sent again on every round, so a long list costs tokens on
// each one, and most questions use four or five tools. The two pack tools
// never change, which keeps the tool list identical for a whole chat and the
// request prefix cacheable. External agents over MCP still see every tool.
const (
	aiPackApp          = "app"
	aiPackPerformance  = "performance"
	aiPackSchemaChange = "schema_change"
	aiPackProposals    = "proposals"
	aiPackAudit        = "audit"

	aiMoreToolsName = "more_tools"
	aiUseToolName   = "use_tool"
)

// aiToolPacks names the pack of every tool outside the core. A tool not listed
// here is core: offered on every request when its group is on.
var aiToolPacks = map[string]string{
	"get_app_context":   aiPackApp,
	"list_projects":     aiPackApp,
	"list_environments": aiPackApp,
	"list_connections":  aiPackApp,
	"list_scripts":      aiPackApp,
	"list_audit":        aiPackApp,
	"get_git_status":    aiPackApp,
	"get_query_stats":   aiPackApp,

	"explain_plan":    aiPackPerformance,
	"get_table_stats": aiPackPerformance,
	"list_indexes":    aiPackPerformance,

	"classify_sql":           aiPackSchemaChange,
	"find_dependencies":      aiPackSchemaChange,
	"check_migration_safety": aiPackSchemaChange,
	"diff_schema":            aiPackSchemaChange,
	"generate_migration":     aiPackSchemaChange,
	"preview_cascade":        aiPackSchemaChange,
	"dry_run":                aiPackSchemaChange,
	"create_restore_point":   aiPackSchemaChange,
	"list_restore_points":    aiPackSchemaChange,
	"preview_rollback":       aiPackSchemaChange,

	"get_change_status": aiPackProposals,
	"cancel_change":     aiPackProposals,
	"list_changes":      aiPackProposals,

	"get_audit_log": aiPackAudit,
}

var aiMoreToolsSpec = ai.ToolSpec{
	Name:        aiMoreToolsName,
	Description: "Load a pack of extra tools: their names, what they do, and their parameters. Call one with use_tool. Packs: app (where the user works: projects, environments, connections, saved scripts, run history), performance (query plans, table statistics, indexes), schema_change (risk of SQL, dependencies, migration safety, diffs between environments, cascades, dry runs, restore points), proposals (the state of proposed changes), audit (the audit log).",
	Parameters: json.RawMessage(`{"type":"object","properties":{` +
		`"pack":{"type":"string","enum":["app","performance","schema_change","proposals","audit"]}` +
		`},"required":["pack"],"additionalProperties":false}`),
}

var aiUseToolSpec = ai.ToolSpec{
	Name:        aiUseToolName,
	Description: "Call one tool from a pack that more_tools loaded, with the arguments its parameters describe.",
	Parameters: json.RawMessage(`{"type":"object","properties":{` +
		`"name":{"type":"string","description":"The tool name more_tools listed."},` +
		`"arguments":{"type":"object","description":"The tool's arguments."}` +
		`},"required":["name"],"additionalProperties":false}`),
}

type aiPackToolDTO struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

type aiPackDTO struct {
	Pack  string          `json:"pack"`
	Tools []aiPackToolDTO `json:"tools"`
}

// chatCoreTool reports whether the chat offers a tool on every request.
func chatCoreTool(tool aiTool) bool {
	_, packed := aiToolPacks[tool.spec.Name]
	return !packed && !tool.chatHidden
}

// packTools lists the tools of one pack the plan includes and the project's
// switches allow, in a fixed order.
func (s *AIService) packTools(pack string, settings ProjectAISettings) []aiTool {
	var out []aiTool
	for _, tool := range s.toolsFor() {
		if aiToolPacks[tool.spec.Name] != pack || tool.chatHidden || !groupEnabled(tool.group, settings) {
			continue
		}
		out = append(out, tool)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].spec.Name < out[j].spec.Name })
	return out
}

// moreTools answers more_tools: the definitions of one pack, as data.
func (s *AIService) moreTools(call ai.ToolCall) aiToolOutcome {
	var in struct {
		Pack string `json:"pack"`
	}
	_ = json.Unmarshal([]byte(call.Arguments), &in)
	pack := strings.TrimSpace(in.Pack)
	outcome := aiToolOutcome{Name: call.Name, Label: "Loaded the " + pack + " tools"}
	known := false
	for _, name := range []string{aiPackApp, aiPackPerformance, aiPackSchemaChange, aiPackProposals, aiPackAudit} {
		if pack == name {
			known = true
		}
	}
	if !known {
		outcome.Content = errorEnvelope(aiCodeInvalidArgument, "There is no pack named "+pack+".", "Use app, performance, schema_change, proposals, or audit.")
		outcome.Failed = true
		return outcome
	}
	settings, _, _ := s.readSettings()
	dto := aiPackDTO{Pack: pack, Tools: []aiPackToolDTO{}}
	for _, tool := range s.packTools(pack, settings) {
		dto.Tools = append(dto.Tools, aiPackToolDTO{Name: tool.spec.Name, Description: tool.spec.Description, Parameters: tool.spec.Parameters})
	}
	raw, err := json.Marshal(dto)
	if err != nil {
		outcome.Content = errorEnvelope(aiCodeInternal, "The pack could not be listed.", "")
		outcome.Failed = true
		return outcome
	}
	outcome.Content = marshalEnvelope(aiEnvelope{OK: true, Data: json.RawMessage(raw), Meta: &aiCompactMeta{Label: "data"}, Warnings: []string{}})
	return outcome
}

// useTool answers use_tool by running the named pack tool through the same
// gate as any chat tool call. It never runs a hidden tool, another use_tool,
// or a tool outside the packs.
func (s *AIService) useTool(ctx context.Context, call ai.ToolCall, includeBodies bool) aiToolOutcome {
	var in struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal([]byte(call.Arguments), &in); err != nil || strings.TrimSpace(in.Name) == "" {
		return aiToolOutcome{Name: call.Name, Label: "Called a pack tool", Content: errorEnvelope(aiCodeInvalidArgument, "Pass the tool name and its arguments.", ""), Failed: true}
	}
	if _, packed := aiToolPacks[in.Name]; !packed {
		return aiToolOutcome{Name: in.Name, Label: "Called " + in.Name, Content: errorEnvelope(aiCodeInvalidArgument, in.Name+" is not a pack tool.", "Call it directly if it is in your tool list, or load its pack with more_tools."), Failed: true}
	}
	args := "{}"
	if len(in.Arguments) > 0 && string(in.Arguments) != "null" {
		args = string(in.Arguments)
	}
	return s.chatToolCall(ctx, ai.ToolCall{ID: call.ID, Name: in.Name, Arguments: args}, includeBodies)
}
