// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"zentro/internal/db"
	"zentro/internal/extensions/ai"
)

// A write proposal carries two separate accounts of its effect. The explanation
// is the agent's own words, required before the proposal exists, so the person
// reviewing it reads what the agent expects and fears. The checks are what
// Zentro measured itself; they never come from the agent, and a check that could
// not run says so instead of being left out.
const (
	aiExplainMaxSummary   = 400
	aiExplainMaxEffect    = 500
	aiExplainMaxRollback  = 400
	aiExplainMaxRisk      = 300
	aiExplainMaxRisks     = 10
	aiExplainMaxObjects   = 20
	aiExplainMaxObjectLen = 120

	aiCheckOK          = "ok"
	aiCheckWarn        = "warn"
	aiCheckUnavailable = "unavailable"

	// aiCheckTimeout bounds each system check. A proposal is never held up by a
	// slow count: the check reports unavailable and the person is told.
	aiCheckTimeout = 20 * time.Second
)

// AIProposalExplanation is what the agent says the change does. Irreversible is
// the agent's claim; the destructive check below is Zentro's.
type AIProposalExplanation struct {
	Summary         string   `json:"summary"`
	AffectedObjects []string `json:"affectedObjects"`
	ExpectedEffect  string   `json:"expectedEffect"`
	Risks           []string `json:"risks"`
	Irreversible    bool     `json:"irreversible"`
	RollbackPlan    string   `json:"rollbackPlan"`
}

// AIProposalCheck is one thing Zentro measured about the SQL.
type AIProposalCheck struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

// aiExplanationInput is the explanation as the tool receives it.
type aiExplanationInput struct {
	Summary         string   `json:"summary"`
	AffectedObjects []string `json:"affected_objects"`
	ExpectedEffect  string   `json:"expected_effect"`
	Risks           []string `json:"risks"`
	Irreversible    *bool    `json:"irreversible"`
	RollbackPlan    string   `json:"rollback_plan"`
}

const aiExplanationSchema = `"explanation":{"type":"object","description":"Required. Explain the change to the person who will approve it, in plain words: what it does to the data and what could go wrong afterwards.","properties":{` +
	`"summary":{"type":"string","description":"What the SQL does, in one or two sentences. At most 400 characters."},` +
	`"affected_objects":{"type":"array","items":{"type":"string"},"description":"Tables, columns, indexes, or constraints it touches. At most 20."},` +
	`"expected_effect":{"type":"string","description":"What the data or schema looks like afterwards, and who or what notices. At most 500 characters."},` +
	`"risks":{"type":"array","items":{"type":"string"},"description":"Each thing a person must know before approving: lost data, locks, slow queries, broken readers, rows with no WHERE. At least one; write 'none known' only if you checked. At most 10, 300 characters each."},` +
	`"irreversible":{"type":"boolean","description":"True when the change cannot be undone by running another statement."},` +
	`"rollback_plan":{"type":"string","description":"How to undo it, or why it cannot be undone. At most 400 characters."}` +
	`},"required":["summary","affected_objects","expected_effect","risks","irreversible","rollback_plan"],"additionalProperties":false}`

// validateExplanation checks the agent's explanation and returns it in stored
// form. The text is scanned like a tool result: an explanation that carries an
// email, a card number, or a credential is refused, because it is shown in the
// app and stored with the proposal.
func validateExplanation(in *aiExplanationInput) (AIProposalExplanation, error) {
	if in == nil {
		return AIProposalExplanation{}, failTool(aiCodeInvalidArgument, "explanation is required: explain what this change does to the database and what could go wrong", "Pass explanation with summary, affected_objects, expected_effect, risks, irreversible, and rollback_plan.")
	}
	summary := cleanLine(in.Summary)
	effect := cleanLine(in.ExpectedEffect)
	rollback := cleanLine(in.RollbackPlan)
	switch {
	case summary == "":
		return AIProposalExplanation{}, explainError("explanation.summary is empty")
	case effect == "":
		return AIProposalExplanation{}, explainError("explanation.expected_effect is empty")
	case rollback == "":
		return AIProposalExplanation{}, explainError("explanation.rollback_plan is empty")
	case in.Irreversible == nil:
		return AIProposalExplanation{}, explainError("explanation.irreversible must be true or false")
	}
	if utf8.RuneCountInString(summary) > aiExplainMaxSummary {
		return AIProposalExplanation{}, explainError("explanation.summary is longer than 400 characters")
	}
	if utf8.RuneCountInString(effect) > aiExplainMaxEffect {
		return AIProposalExplanation{}, explainError("explanation.expected_effect is longer than 500 characters")
	}
	if utf8.RuneCountInString(rollback) > aiExplainMaxRollback {
		return AIProposalExplanation{}, explainError("explanation.rollback_plan is longer than 400 characters")
	}
	risks, err := cleanList(in.Risks, aiExplainMaxRisks, aiExplainMaxRisk, "risks")
	if err != nil {
		return AIProposalExplanation{}, err
	}
	if len(risks) == 0 {
		return AIProposalExplanation{}, explainError("explanation.risks needs at least one entry; say what could go wrong, or 'none known' if you checked")
	}
	objects, err := cleanList(in.AffectedObjects, aiExplainMaxObjects, aiExplainMaxObjectLen, "affected_objects")
	if err != nil {
		return AIProposalExplanation{}, err
	}
	out := AIProposalExplanation{
		Summary: summary, AffectedObjects: objects, ExpectedEffect: effect,
		Risks: risks, Irreversible: *in.Irreversible, RollbackPlan: rollback,
	}
	raw, _ := json.Marshal(out)
	if matches := ai.ScanJSONStrings(raw); len(matches) > 0 {
		return AIProposalExplanation{}, failTool(aiCodeInvalidArgument, "the explanation looks like it holds a "+matches[0].Type+"; describe the effect without copying values", "")
	}
	return out, nil
}

func explainError(msg string) error {
	return failTool(aiCodeInvalidArgument, msg, "")
}

func cleanLine(text string) string {
	return strings.Join(strings.Fields(text), " ")
}

func cleanList(items []string, maxItems, maxLen int, field string) ([]string, error) {
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = cleanLine(item)
		if item == "" {
			continue
		}
		if utf8.RuneCountInString(item) > maxLen {
			return nil, explainError(fmt.Sprintf("an entry of explanation.%s is longer than %d characters", field, maxLen))
		}
		out = append(out, item)
	}
	if len(out) > maxItems {
		return nil, explainError(fmt.Sprintf("explanation.%s has more than %d entries", field, maxItems))
	}
	return out, nil
}

// computeProposalChecks measures a proposal itself. Every check that applies is
// in the list; one that could not run has status unavailable and a reason. A
// failure of one check never stops the proposal, it only shows as unavailable.
func (s *AIService) computeProposalChecks(ctx context.Context, env *resolvedEnv, sqlText string, risk db.SQLRisk, analysis AIProposalAnalysis) []AIProposalCheck {
	checks := make([]AIProposalCheck, 0, 5)

	switch {
	case risk.HasUpdateNoWhere || risk.HasDeleteNoWhere:
		checks = append(checks, AIProposalCheck{Name: "where_clause", Status: aiCheckWarn, Detail: "An UPDATE or DELETE has no WHERE, so it changes every row of its table."})
	case risk.HasWrite:
		checks = append(checks, AIProposalCheck{Name: "where_clause", Status: aiCheckOK, Detail: "Every UPDATE and DELETE has a WHERE."})
	}

	if risk.HasDestructive {
		checks = append(checks, AIProposalCheck{Name: "destructive", Status: aiCheckWarn, Detail: "Drops or truncates something. The data in it is gone once this runs; only a restore point brings it back."})
	}

	checks = append(checks, rowCountCheck(analysis, risk))

	if hasOperation(risk, db.WriteOperationDelete) {
		checks = append(checks, s.cascadeCheck(ctx, env, sqlText))
	}
	if hasOperation(risk, db.WriteOperationAlter) || hasOperation(risk, db.WriteOperationCreate) || hasOperation(risk, db.WriteOperationDrop) {
		checks = append(checks, s.migrationCheck(ctx, env, sqlText))
	}
	return checks
}

func hasOperation(risk db.SQLRisk, op db.WriteOperation) bool {
	for _, statement := range risk.Statements {
		if statement.Operation == op {
			return true
		}
	}
	return false
}

// rowCountCheck reads the impact count propose_change already measured. It is
// only applicable to a single-table UPDATE or DELETE; any other shape reports
// why it could not be counted.
func rowCountCheck(analysis AIProposalAnalysis, risk db.SQLRisk) AIProposalCheck {
	check := AIProposalCheck{Name: "row_count"}
	if !hasOperation(risk, db.WriteOperationUpdate) && !hasOperation(risk, db.WriteOperationDelete) {
		check.Status = aiCheckOK
		check.Detail = "Not applicable: no UPDATE or DELETE to count."
		return check
	}
	if analysis.Impact != "counted" {
		check.Status = aiCheckUnavailable
		check.Detail = "The affected rows could not be counted: " + fallbackText(analysis.Reason, "unknown reason") + "."
		return check
	}
	impact, ok := decodeImpact(analysis.Details)
	if !ok {
		check.Status = aiCheckUnavailable
		check.Detail = "The row count was taken but could not be read back."
		return check
	}
	detail := fmt.Sprintf("%d row(s) match", impact.AffectedRows)
	if impact.Capped {
		detail += " (counting stopped at its limit, so there may be more)"
	}
	if impact.Share != nil {
		detail += fmt.Sprintf(", about %.0f%% of the table", *impact.Share*100)
	}
	if len(impact.TriggersOnTarget) > 0 {
		detail += fmt.Sprintf("; %d trigger(s) on the table will also run", len(impact.TriggersOnTarget))
	}
	check.Detail = detail + "."
	check.Status = aiCheckOK
	if impact.NoWhere || impact.Capped || impact.HasCascade || len(impact.TriggersOnTarget) > 0 || (impact.Share != nil && *impact.Share >= 0.5) {
		check.Status = aiCheckWarn
	}
	return check
}

// decodeImpact reads the stored analysis, which holds the estimate_impact
// result either bare or wrapped as aiEnvMetaOverride.
func decodeImpact(raw json.RawMessage) (aiImpactDTO, bool) {
	if len(raw) == 0 {
		return aiImpactDTO{}, false
	}
	var wrapped struct {
		Data *aiImpactDTO
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.Data != nil {
		return *wrapped.Data, true
	}
	var bare aiImpactDTO
	if err := json.Unmarshal(raw, &bare); err != nil {
		return aiImpactDTO{}, false
	}
	return bare, true
}

func fallbackText(text, fallback string) string {
	text = strings.TrimSpace(strings.TrimRight(strings.TrimSpace(text), "."))
	if text == "" {
		return fallback
	}
	return text
}

func (s *AIService) cascadeCheck(ctx context.Context, env *resolvedEnv, sqlText string) AIProposalCheck {
	check := AIProposalCheck{Name: "cascade"}
	ctx, cancel := context.WithTimeout(ctx, aiCheckTimeout)
	defer cancel()
	raw, err := previewCascadeTool(ctx, s, ai.Catalog{}, mustJSON(struct {
		Env string `json:"env"`
		SQL string `json:"sql"`
	}{Env: env.Key, SQL: sqlText}))
	if err != nil {
		check.Status = aiCheckUnavailable
		check.Detail = "The rows that foreign keys would delete or block could not be previewed: " + fallbackText(err.Error(), "unknown reason") + "."
		return check
	}
	if override, ok := raw.(aiEnvMetaOverride); ok {
		raw = override.Data
	}
	dto, ok := raw.(aiCascadeDTO)
	if !ok {
		check.Status = aiCheckUnavailable
		check.Detail = "The cascade preview came back in a form that could not be read."
		return check
	}
	check.Status = aiCheckOK
	check.Detail = "No foreign key deletes or blocks other rows."
	if len(dto.Blockers) > 0 {
		check.Status = aiCheckWarn
		check.Detail = fmt.Sprintf("%d foreign key(s) would block this delete while rows still reference these.", len(dto.Blockers))
	}
	if dto.Summary.DeletedRows > 0 || len(dto.Effects) > 0 {
		check.Status = aiCheckWarn
		extra := fmt.Sprintf("Foreign keys also change %d row(s) in %d other table(s).", dto.Summary.DeletedRows, dto.Summary.Tables)
		if len(dto.Blockers) > 0 {
			check.Detail += " " + extra
		} else {
			check.Detail = extra
		}
	}
	return check
}

func (s *AIService) migrationCheck(ctx context.Context, env *resolvedEnv, sqlText string) AIProposalCheck {
	check := AIProposalCheck{Name: "migration_safety"}
	ctx, cancel := context.WithTimeout(ctx, aiCheckTimeout)
	defer cancel()
	raw, err := checkMigrationSafetyTool(ctx, s, ai.Catalog{}, mustJSON(struct {
		Env string `json:"env"`
		SQL string `json:"sql"`
	}{Env: env.Key, SQL: sqlText}))
	if err != nil {
		check.Status = aiCheckUnavailable
		check.Detail = "The lock and rewrite risk of this DDL could not be checked: " + fallbackText(err.Error(), "unknown reason") + "."
		return check
	}
	if override, ok := raw.(aiEnvMetaOverride); ok {
		raw = override.Data
	}
	dto, ok := raw.(aiMigrationSafetyDTO)
	if !ok {
		check.Status = aiCheckUnavailable
		check.Detail = "The migration check came back in a form that could not be read."
		return check
	}
	check.Status = aiCheckOK
	check.Detail = "No lock or table-rewrite risk was found."
	messages := make([]string, 0, 2)
	for _, statement := range dto.Statements {
		for _, rule := range statement.Rules {
			if rule.Severity == "info" || rule.Severity == "low" {
				continue
			}
			check.Status = aiCheckWarn
			if len(messages) < 2 {
				messages = append(messages, rule.Message)
			}
		}
	}
	if len(messages) > 0 {
		check.Detail = strings.Join(messages, " ")
	}
	if len(dto.Unanalyzed) > 0 {
		if check.Status == aiCheckOK {
			check.Status = aiCheckUnavailable
			check.Detail = ""
		}
		check.Detail = strings.TrimSpace(check.Detail + fmt.Sprintf(" %d statement(s) could not be analyzed.", len(dto.Unanalyzed)))
	}
	return check
}
