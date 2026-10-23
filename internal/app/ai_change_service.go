// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"zentro/internal/db"
)

// AIChangeApproveRequest is what the review screen sends. Confirmation is
// the environment key the user typed; the backend decides whether it is
// required from the license, not from a flag the UI sends.
type AIChangeApproveRequest struct {
	ID           string            `json:"id"`
	Confirmation string            `json:"confirmation"`
	ParamValues  []json.RawMessage `json:"paramValues"`
}

type AIProposalChangedEvent struct {
	ID    string `json:"id"`
	State string `json:"state"`
	Env   string `json:"env"`
	Title string `json:"title"`
}

func (s *AIService) ListChanges() ([]AIChangeProposal, error) {
	projectID, err := s.projectID()
	if err != nil {
		return nil, err
	}
	all, err := s.proposals().list(projectID)
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].State == aiProposalPending {
			marked, markErr := s.proposals().markReviewPresented(projectID, all[i].ID)
			if markErr == nil {
				all[i] = marked
			}
		}
	}
	return all, nil
}

func (s *AIService) GetChange(id string) (AIChangeProposal, error) {
	projectID, err := s.projectID()
	if err != nil {
		return AIChangeProposal{}, err
	}
	return s.proposals().markReviewPresented(projectID, id)
}

func (s *AIService) RejectChange(id, note string) (AIChangeProposal, error) {
	projectID, err := s.projectID()
	if err != nil {
		return AIChangeProposal{}, err
	}
	if len([]rune(note)) > 200 {
		return AIChangeProposal{}, failTool(aiCodeInvalidArgument, "the rejection note must be at most 200 characters", "")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	prop, err := s.proposals().transition(projectID, id, aiProposalRejected, func(p *AIChangeProposal) {
		p.DecidedAt = now
		p.RejectionNote = note
	})
	if err != nil {
		return AIChangeProposal{}, err
	}
	s.emitProposalChanged(prop)
	s.auditProposal(prop, "rejected", "rejected")
	return prop, nil
}

func (s *AIService) ApproveChange(ctx context.Context, req AIChangeApproveRequest) (AIChangeProposal, error) {
	projectID, err := s.projectID()
	if err != nil {
		return AIChangeProposal{}, err
	}
	prop, err := s.proposals().load(projectID, req.ID)
	if err != nil {
		return AIChangeProposal{}, err
	}
	if prop.State == aiProposalExpired {
		return AIChangeProposal{}, failTool(aiCodeProposalExpired, "this proposal has expired", "Create a new one.")
	}
	if prop.State != aiProposalPending {
		return AIChangeProposal{}, failTool(aiCodeInvalidState, "only a pending proposal can be approved", "")
	}
	if err := s.enforceApprovalFriction(prop, req.Confirmation); err != nil {
		return AIChangeProposal{}, err
	}

	env, err := s.resolveEnv(ctx, prop.Env)
	if err != nil {
		return AIChangeProposal{}, err
	}
	defer env.Close()
	if env.Profile.ID != prop.ConnectionID || env.Database != prop.Database || env.Schema != prop.Schema || env.Driver != prop.Driver {
		failed, _ := s.failProposal(projectID, prop.ID, "PROPOSAL_STALE", "the connection, database, or schema changed since this was proposed")
		return failed, failTool(aiCodeProposalStale, "the environment changed since this was proposed", "Create a new proposal.")
	}

	params := prop.Params
	if len(req.ParamValues) > 0 {
		params = req.ParamValues
	}
	if hasNullParam(params) {
		return AIChangeProposal{}, failTool(aiCodeInvalidArgument, "every null parameter must be filled in before approval", "")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	prop, err = s.proposals().transition(projectID, prop.ID, aiProposalExecuting, func(p *AIChangeProposal) {
		p.DecidedAt = now
		p.Params = params
	})
	if err != nil {
		return AIChangeProposal{}, err
	}
	s.emitProposalChanged(prop)

	restoreID := ""
	if shouldSnapshotProposal(prop) {
		if rp, rpErr := s.captureRestorePoint(ctx, env, "before "+prop.Title, "proposal", prop.ID); rpErr == nil {
			restoreID = rp.ID
		}
	}

	results, execErr := executeProposalSQL(ctx, env.DB, prop.SQL, params)
	final := aiProposalSucceeded
	failReason := ""
	if execErr != nil {
		final = aiProposalFailed
		failReason = "the change failed and was rolled back"
	}
	executed := time.Now().UTC().Format(time.RFC3339)
	prop, err = s.proposals().transition(projectID, prop.ID, final, func(p *AIChangeProposal) {
		p.ExecutedAt = executed
		p.PerStatement = results
		p.FailReason = failReason
		p.RestorePointID = restoreID
	})
	if err != nil {
		return AIChangeProposal{}, err
	}
	// An approved change may have altered the schema. The cached catalog feeds the
	// table list the assistant is given, so drop it and let the next question read
	// the schema as it is now.
	if final == aiProposalSucceeded {
		s.dropCatalogCache()
	}
	s.emitProposalChanged(prop)
	outcome := "ok"
	if final == aiProposalFailed {
		outcome = "error"
	}
	s.auditProposal(prop, "approve_change", outcome)
	if execErr != nil {
		return prop, failTool(aiCodeInternal, failReason, "")
	}
	return prop, nil
}

func (s *AIService) failProposal(projectID, id, code, message string) (AIChangeProposal, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	return s.proposals().transition(projectID, id, aiProposalFailed, func(p *AIChangeProposal) {
		p.ExecutedAt = now
		p.FailReason = code + ": " + message
	})
}

// approvalFrictions are extra checks an edition puts between a reviewer and the
// Approve button. The core has none; a pro_* file registers them from init().
var approvalFrictions []func(s *AIService, prop AIChangeProposal, confirmation string) error

func registerApprovalFriction(check func(s *AIService, prop AIChangeProposal, confirmation string) error) {
	approvalFrictions = append(approvalFrictions, check)
}

func (s *AIService) enforceApprovalFriction(prop AIChangeProposal, confirmation string) error {
	for _, check := range approvalFrictions {
		if err := check(s, prop, confirmation); err != nil {
			return err
		}
	}
	return nil
}

func shouldSnapshotProposal(prop AIChangeProposal) bool {
	env := normalizeEnvironmentKey(prop.Env)
	if env != "sta" && env != "pro" {
		return false
	}
	for _, st := range prop.Statements {
		switch st.Kind {
		case string(db.WriteOperationAlter), string(db.WriteOperationCreate), string(db.WriteOperationDrop), string(db.WriteOperationTruncate):
			return true
		}
	}
	return false
}

func hasNullParam(params []json.RawMessage) bool {
	for _, p := range params {
		if len(p) == 0 || strings.TrimSpace(string(p)) == "null" {
			return true
		}
	}
	return false
}

func executeProposalSQL(ctx context.Context, conn *sql.DB, query string, params []json.RawMessage) ([]AIProposalExecResult, error) {
	tokens, err := db.Tokenize("", query)
	if err != nil {
		return nil, err
	}
	stmts := db.SplitTokens(tokens)
	args := decodeJSONParams(params)
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	out := make([]AIProposalExecResult, 0, len(stmts))
	for i, stmt := range stmts {
		if len(stmt) == 0 {
			continue
		}
		text := query[stmt[0].Start:stmt[len(stmt)-1].End]
		start := time.Now()
		res, execErr := tx.ExecContext(ctx, text, args...)
		elapsed := time.Since(start).Milliseconds()
		item := AIProposalExecResult{N: i + 1, Status: "ok", ElapsedMs: elapsed}
		if execErr != nil {
			item.Status = "error"
			item.Message = "the statement failed"
			for j := i + 1; j < len(stmts); j++ {
				out = append(out, AIProposalExecResult{N: j + 1, Status: "skipped"})
			}
			out = append(out, item)
			return out, execErr
		}
		if n, nErr := res.RowsAffected(); nErr == nil {
			item.RowsAffected = n
		}
		out = append(out, item)
	}
	if err := tx.Commit(); err != nil {
		return out, err
	}
	return out, nil
}

func decodeJSONParams(raw []json.RawMessage) []any {
	out := make([]any, 0, len(raw))
	for _, p := range raw {
		var v any
		if err := json.Unmarshal(p, &v); err != nil {
			out = append(out, nil)
			continue
		}
		out = append(out, v)
	}
	return out
}

func (s *AIService) auditProposal(prop AIChangeProposal, action, outcome string) {
	if s.mcp.auditLog == nil {
		return
	}
	_ = s.mcp.auditLog.AppendMCPAudit(SQLAuditEntry{
		Action:         action,
		Actor:          "user",
		Verdict:        prop.Verdict,
		Outcome:        outcome,
		SQLNormalized:  prop.SQLNormalized,
		SQLHash:        prop.SQLHash,
		ProposalID:     prop.ID,
		RestorePointID: prop.RestorePointID,
		EnvKey:         prop.Env,
		Driver:         prop.Driver,
		Database:       prop.Database,
		ProjectID:      prop.ProjectID,
		Profile:        prop.ConnectionID,
	})
}
