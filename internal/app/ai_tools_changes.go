// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

var aiProposeChangeTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "propose_change",
		Description: "Create a write proposal for a person to review in Zentro. Never executes SQL. env is required.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string","description":"dev, sta, or pro. Required; never inferred."},` +
			`"sql":{"type":"string","description":"One or more statements, at most 20 and 50 KB."},` +
			`"params":{"type":"array","description":"Placeholder values. null means the reviewer types it."},` +
			`"title":{"type":"string","description":"At most 80 characters."},` +
			`"rationale":{"type":"string","description":"At most 500 characters."},` +
			aiExplanationSchema +
			`},"required":["env","sql","explanation"],"additionalProperties":false}`),
	},
	group:   aiGroupChanges,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Propose a change" },
	live:    proposeChangeTool,
}

var aiGetChangeStatusTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "get_change_status",
		Description: "Read the current state of one write proposal.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"id":{"type":"string","description":"The id propose_change returned."}` +
			`},"required":["id"],"additionalProperties":false}`),
	},
	group: aiGroupChanges,
	label: func(json.RawMessage) string { return "Check a proposal" },
	live:  getChangeStatusTool,
}

var aiCancelChangeTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "cancel_change",
		Description: "Withdraw a pending write proposal. Already-approved proposals cannot be cancelled.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"id":{"type":"string","description":"The proposal id."}` +
			`},"required":["id"],"additionalProperties":false}`),
	},
	group: aiGroupChanges,
	label: func(json.RawMessage) string { return "Cancel a proposal" },
	live:  cancelChangeTool,
}

var aiListChangesTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "list_changes",
		Description: "List write proposals of the open project.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"state":{"type":"string","description":"Filter by state. Defaults to pending."},` +
			`"env":{"type":"string"},` +
			`"since":{"type":"string"},` +
			`"limit":{"type":"integer","minimum":1,"maximum":50}` +
			`},"additionalProperties":false}`),
	},
	group:   aiGroupChanges,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "List proposals" },
	live:    listChangesTool,
}

type aiProposeChangeDTO struct {
	ID                   string                `json:"id"`
	State                string                `json:"state"`
	ExpiresAt            string                `json:"expiresAt"`
	Title                string                `json:"title"`
	Statements           []AIProposalStatement `json:"statements"`
	Verdict              string                `json:"verdict"`
	RequiresTypedConfirm bool                  `json:"requiresTypedConfirm"`
	CooldownSeconds      int                   `json:"cooldownSeconds"`
	Analysis             *AIProposalAnalysis   `json:"analysis,omitempty"`
	Deduplicated         bool                  `json:"deduplicated"`
}

type aiChangeStatusDTO struct {
	ID                string                 `json:"id"`
	State             string                 `json:"state"`
	Title             string                 `json:"title"`
	Env               string                 `json:"env"`
	CreatedAt         string                 `json:"createdAt"`
	ExpiresAt         string                 `json:"expiresAt"`
	DecidedAt         string                 `json:"decidedAt,omitempty"`
	ExecutedAt        string                 `json:"executedAt,omitempty"`
	PerStatement      []AIProposalExecResult `json:"perStatement"`
	RestorePointID    string                 `json:"restorePointId,omitempty"`
	RejectionNote     string                 `json:"rejectionNote,omitempty"`
	RetryAfterSeconds int                    `json:"retryAfterSeconds"`
}

type aiChangeListItemDTO struct {
	ID                   string   `json:"id"`
	Title                string   `json:"title"`
	Env                  string   `json:"env"`
	State                string   `json:"state"`
	CreatedAt            string   `json:"createdAt"`
	StatementKinds       []string `json:"statementKinds"`
	RequiresTypedConfirm bool     `json:"requiresTypedConfirm"`
	SQLPreview           string   `json:"sqlPreview"`
}

func proposeChangeTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env       string              `json:"env"`
		SQL       string              `json:"sql"`
		Params    []json.RawMessage   `json:"params"`
		Title     string              `json:"title"`
		Rationale string              `json:"rationale"`
		Explain   *aiExplanationInput `json:"explanation"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass env and the SQL to propose", "")
	}
	if strings.TrimSpace(in.Env) == "" {
		return nil, failTool(aiCodeEnvRequired, "env is required and is never inferred", "Pass env: dev, sta, or pro.")
	}
	if utf8.RuneCountInString(in.Title) > 80 {
		return nil, failTool(aiCodeInvalidArgument, "title must be at most 80 characters", "")
	}
	if utf8.RuneCountInString(in.Rationale) > 500 {
		return nil, failTool(aiCodeInvalidArgument, "rationale must be at most 500 characters", "")
	}
	if len(in.SQL) > aiMaxChangeSQLBytes {
		return nil, failTool(aiCodeInvalidArgument, "the SQL is larger than 50 KB", "")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}

	if g := db.GuardChange(in.SQL); g != nil {
		return nil, guardToToolError(g)
	}
	tokens, tokErr := db.Tokenize("", in.SQL)
	if tokErr != nil {
		return nil, failTool(aiCodeSQLUnsupported, "this SQL uses a form propose_change cannot analyze", "Rewrite it without U&-escaped identifiers.")
	}
	stmts := db.SplitTokens(tokens)
	if len(stmts) == 0 {
		return nil, failTool(aiCodeInvalidArgument, "no statement was found in sql", "")
	}
	if len(stmts) > aiMaxChangeStatements {
		return nil, failTool(aiCodeInvalidArgument, "a proposal may hold at most 20 statements", "")
	}

	// The refusals above need no explanation to be right; this one comes before
	// any database work so an agent that skipped it learns that first.
	explanation, err := validateExplanation(in.Explain)
	if err != nil {
		return nil, err
	}

	env, err := s.resolveEnv(ctx, in.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()

	if err := s.validateProposedSQL(ctx, env, in.SQL, stmts); err != nil {
		return nil, err
	}

	policy := s.executionPolicy(env.Key)
	classified := classifyForEnv(in.SQL, env.Driver, policy)
	if classified.Verdict == classifyBlocked {
		return nil, failTool(aiCodePolicyBlocked, "this environment's policy blocks the SQL", "Add a top-level WHERE, or propose a narrower change.")
	}

	projectID, err := s.projectID()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "Open a project in Zentro.")
	}
	now := time.Now().UTC()
	normalized, hash := hashChangeSQL(in.SQL, in.Params)
	requiresTyped := classified.Verdict == classifyNeedsConfirmation
	if firstKeywordIsUnanalyzable(stmts) {
		requiresTyped = true
	}
	analysis := s.analyzeProposedChange(ctx, env, in.SQL)
	checks := s.computeProposalChecks(ctx, env, in.SQL, classified.Risk, analysis)
	if analysis.Impact == "unavailable" {
		requiresTyped = true
	}
	cooldown := 0
	if environmentIsProduction(env.Key) {
		cooldown = 3
	}
	statements := make([]AIProposalStatement, 0, len(classified.Risk.Statements))
	for i, st := range classified.Risk.Statements {
		rules := []string{}
		for _, reason := range classified.Reasons {
			if reason.Statement == i+1 {
				rules = append(rules, reason.Rule)
			}
		}
		statements = append(statements, AIProposalStatement{
			N: i + 1, Kind: string(st.Operation), Risk: statementRiskLevel(st), Rules: rules,
		})
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = "Proposed change"
	}
	prop := AIChangeProposal{
		State:                aiProposalPending,
		Title:                title,
		Rationale:            in.Rationale,
		Env:                  env.Key,
		SQL:                  in.SQL,
		SQLNormalized:        normalized,
		SQLHash:              hash,
		Params:               in.Params,
		CreatedAt:            now.Format(time.RFC3339),
		ExpiresAt:            now.Add(proposalTTL(env.Key)).Format(time.RFC3339),
		ProjectID:            projectID,
		ConnectionID:         env.Profile.ID,
		Database:             env.Database,
		Schema:               env.Schema,
		Driver:               env.Driver,
		RequiresTypedConfirm: requiresTyped,
		CooldownSeconds:      cooldown,
		Verdict:              classified.Verdict,
		Statements:           statements,
		Analysis:             analysis,
		Explanation:          &explanation,
		Checks:               checks,
	}
	saved, deduped, err := s.proposals().create(projectID, prop)
	if err != nil {
		return nil, err
	}
	s.emitProposalChanged(saved)
	settings, _, _ := s.readSettings()
	out := aiProposeChangeDTO{
		ID: saved.ID, State: saved.State, ExpiresAt: saved.ExpiresAt, Title: saved.Title,
		Statements: saved.Statements, Verdict: saved.Verdict,
		RequiresTypedConfirm: saved.RequiresTypedConfirm, CooldownSeconds: saved.CooldownSeconds,
		Deduplicated: deduped,
	}
	if settings.AllowReadData {
		a := saved.Analysis
		out.Analysis = &a
	}
	return aiEnvMetaOverride{Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: env.Schema}, nil
}

func (s *AIService) requireChangesAllowed() error {
	if s.viewMode != nil && s.viewMode() {
		return failTool(aiCodePermissionDenied, "view mode only reads; it proposes and runs nothing", "")
	}
	settings, _, err := s.readSettings()
	if err != nil {
		return failTool(aiCodeNotConnected, "open a project in Zentro", "")
	}
	if !settings.AllowChanges {
		return failTool(aiCodePermissionDenied, groupDisabledReason(aiGroupChanges), groupDisabledHint)
	}
	return nil
}

func (s *AIService) validateProposedSQL(ctx context.Context, env *resolvedEnv, sql string, stmts [][]db.Token) error {
	drv, ok := core.Get(env.Driver)
	if !ok {
		return failTool(aiCodeUnsupportedDriver, "the "+env.Driver+" driver is not available", "")
	}
	validator, ok := drv.(driverport.SQLValidator)
	if !ok {
		return nil
	}
	schema := env.Schema
	for _, stmtTokens := range stmts {
		if len(stmtTokens) == 0 {
			continue
		}
		stmtText := sql[stmtTokens[0].Start:stmtTokens[len(stmtTokens)-1].End]
		stmtText, _ = db.RewriteParams(env.Driver, stmtText, db.ParamsForPrepare)
		result, valErr := validator.ValidateStatement(ctx, env.DB, schema, stmtText)
		if valErr != nil {
			return failTool(aiCodeInternal, "the statement could not be checked", "")
		}
		if !result.Valid {
			return failTool(aiCodeSQLParseError, "the SQL is not valid against this schema", firstValidationMessage(result))
		}
	}
	return nil
}

func firstValidationMessage(result models.MCPValidationResult) string {
	if len(result.Errors) == 0 {
		return ""
	}
	return result.Errors[0].Message
}

func firstKeywordIsUnanalyzable(stmts [][]db.Token) bool {
	for _, stmt := range stmts {
		switch db.FirstKeyword(stmt) {
		case "do", "execute", "exec":
			return true
		}
	}
	return false
}

func (s *AIService) analyzeProposedChange(ctx context.Context, env *resolvedEnv, sql string) AIProposalAnalysis {
	if _, err := db.ParseCountTarget("", sql, false); err != nil {
		msg := "the affected row count could not be computed"
		if err.Message != "" {
			msg = err.Message
		}
		return AIProposalAnalysis{Impact: "unavailable", Reason: msg}
	}
	raw, runErr := estimateImpactTool(ctx, s, ai.Catalog{}, mustJSON(struct {
		Env string `json:"env"`
		SQL string `json:"sql"`
	}{Env: env.Key, SQL: sql}))
	if runErr != nil {
		return AIProposalAnalysis{Impact: "unavailable", Reason: runErr.Error()}
	}
	details, _ := json.Marshal(raw)
	return AIProposalAnalysis{Impact: "counted", Details: details}
}

func getChangeStatusTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.ID) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the proposal id", "")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}
	projectID, err := s.projectID()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "")
	}
	prop, err := s.proposals().load(projectID, in.ID)
	if err != nil {
		return nil, err
	}
	if prop.PerStatement == nil {
		prop.PerStatement = []AIProposalExecResult{}
	}
	return aiChangeStatusDTO{
		ID: prop.ID, State: prop.State, Title: prop.Title, Env: prop.Env,
		CreatedAt: prop.CreatedAt, ExpiresAt: prop.ExpiresAt, DecidedAt: prop.DecidedAt,
		ExecutedAt: prop.ExecutedAt, PerStatement: prop.PerStatement,
		RestorePointID: prop.RestorePointID, RejectionNote: prop.RejectionNote,
		RetryAfterSeconds: 3,
	}, nil
}

func cancelChangeTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.ID) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the proposal id", "")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}
	projectID, err := s.projectID()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	prop, err := s.proposals().transition(projectID, in.ID, aiProposalCancelled, func(p *AIChangeProposal) {
		p.DecidedAt = now
	})
	if err != nil {
		return nil, err
	}
	s.emitProposalChanged(prop)
	return struct {
		ID    string `json:"id"`
		State string `json:"state"`
	}{ID: prop.ID, State: prop.State}, nil
}

func listChangesTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		State string `json:"state"`
		Env   string `json:"env"`
		Since string `json:"since"`
		Limit int    `json:"limit"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}
	projectID, err := s.projectID()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "")
	}
	all, err := s.proposals().list(projectID)
	if err != nil {
		return nil, err
	}
	wantState := strings.TrimSpace(in.State)
	if wantState == "" {
		wantState = aiProposalPending
	}
	limit := in.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	out := make([]aiChangeListItemDTO, 0, limit)
	for _, prop := range all {
		if prop.State != wantState {
			continue
		}
		if in.Env != "" && !strings.EqualFold(prop.Env, in.Env) {
			continue
		}
		if in.Since != "" && prop.CreatedAt < in.Since {
			continue
		}
		kinds := make([]string, 0, len(prop.Statements))
		for _, st := range prop.Statements {
			kinds = append(kinds, st.Kind)
		}
		preview := prop.SQLNormalized
		if len(preview) > 200 {
			preview = preview[:200]
		}
		out = append(out, aiChangeListItemDTO{
			ID: prop.ID, Title: prop.Title, Env: prop.Env, State: prop.State,
			CreatedAt: prop.CreatedAt, StatementKinds: kinds,
			RequiresTypedConfirm: prop.RequiresTypedConfirm, SQLPreview: preview,
		})
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func (s *AIService) emitProposalChanged(prop AIChangeProposal) {
	if s.emitter == nil {
		return
	}
	s.emitter.Emit(context.Background(), constant.EventAIProposalChanged, AIProposalChangedEvent{
		ID: prop.ID, State: prop.State, Env: prop.Env, Title: prop.Title,
	})
}
