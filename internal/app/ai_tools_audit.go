// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"

	"zentro/internal/extensions/ai"
)

var aiGetAuditLogTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "get_audit_log",
		Description: "Read the local audit log of dangerous runs and every MCP call. Never includes literals or row data.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string"},` +
			`"source":{"type":"string","enum":["ui","mcp","any"]},` +
			`"outcome":{"type":"array","items":{"type":"string"}},` +
			`"since":{"type":"string"},` +
			`"until":{"type":"string"},` +
			`"limit":{"type":"integer","minimum":1,"maximum":200},` +
			`"cursor":{"type":"string"}` +
			`},"additionalProperties":false}`),
	},
	group: aiGroupAudit,
	label: func(json.RawMessage) string { return "Read the audit log" },
	live:  getAuditLogTool,
}

type aiAuditLogEntryDTO struct {
	ID             string `json:"id"`
	At             string `json:"at"`
	Env            string `json:"env"`
	Source         string `json:"source"`
	Actor          string `json:"actor"`
	Action         string `json:"action"`
	Verdict        string `json:"verdict"`
	Outcome        string `json:"outcome"`
	RowsAffected   int64  `json:"rowsAffected"`
	ElapsedMs      int64  `json:"elapsedMs"`
	SQLNormalized  string `json:"sqlNormalized"`
	SQLHash        string `json:"sqlHash"`
	ProposalID     string `json:"proposalId,omitempty"`
	RestorePointID string `json:"restorePointId,omitempty"`
}

type aiAuditLogDTO struct {
	Entries    []aiAuditLogEntryDTO `json:"entries"`
	NextCursor string               `json:"nextCursor,omitempty"`
	ChainValid bool                 `json:"chainValid"`
}

func getAuditLogTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env     string   `json:"env"`
		Source  string   `json:"source"`
		Outcome []string `json:"outcome"`
		Since   string   `json:"since"`
		Until   string   `json:"until"`
		Limit   int      `json:"limit"`
		Cursor  string   `json:"cursor"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	settings, _, err := s.readSettings()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "open a project in Zentro", "")
	}
	if !settings.AllowAudit {
		return nil, failTool(aiCodePermissionDenied, groupDisabledReason(aiGroupAudit), groupDisabledHint)
	}
	if s.mcp.auditLog == nil {
		return nil, failTool(aiCodeInternal, "the audit log is not available", "")
	}
	limit := in.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	entries, err := s.mcp.auditLog.ListAudit(SQLAuditFilter{Limit: 500})
	if err != nil {
		return nil, failTool(aiCodeInternal, "the audit log could not be read", "")
	}
	wantSource := strings.ToLower(strings.TrimSpace(in.Source))
	outcomes := map[string]struct{}{}
	for _, o := range in.Outcome {
		outcomes[strings.ToLower(o)] = struct{}{}
	}
	skip := in.Cursor != ""
	out := make([]aiAuditLogEntryDTO, 0, limit)
	for _, e := range entries {
		if skip {
			if e.ID == in.Cursor {
				skip = false
			}
			continue
		}
		source := e.Source
		if source == "" {
			source = "ui"
		}
		if wantSource != "" && wantSource != "any" && source != wantSource {
			continue
		}
		if in.Env != "" && !strings.EqualFold(e.EnvKey, in.Env) {
			continue
		}
		if in.Since != "" && e.ExecutedAt < in.Since {
			continue
		}
		if in.Until != "" && e.ExecutedAt > in.Until {
			continue
		}
		outcome := e.Outcome
		if outcome == "" {
			if e.Error != "" {
				outcome = "error"
			} else {
				outcome = "ok"
			}
		}
		if len(outcomes) > 0 {
			if _, ok := outcomes[outcome]; !ok {
				continue
			}
		}
		out = append(out, aiAuditLogEntryDTO{
			ID: e.ID, At: isoTime(e.ExecutedAt), Env: e.EnvKey, Source: source,
			Actor: firstNonEmpty(e.Actor, "user"), Action: firstNonEmpty(e.Action, "run_query"),
			Verdict: e.Verdict, Outcome: outcome, RowsAffected: e.RowCount, ElapsedMs: e.DurationMs,
			SQLNormalized: e.SQLNormalized, SQLHash: e.SQLHash,
			ProposalID: e.ProposalID, RestorePointID: e.RestorePointID,
		})
		if len(out) == limit {
			break
		}
	}
	_, valid, _ := s.mcp.auditLog.VerifyChain()
	dto := aiAuditLogDTO{Entries: out, ChainValid: valid}
	if len(out) == limit {
		dto.NextCursor = out[len(out)-1].ID
	}
	return dto, nil
}
