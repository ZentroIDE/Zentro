// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"
	"time"

	"zentro/internal/constant"
	"zentro/internal/extensions/ai"
)

// aiApprovalTimeout is how long a reply waits for the user to decide whether
// rows may go to the model. No answer counts as no.
const aiApprovalTimeout = 5 * time.Minute

// AISentRound is one request a reply sent to the model. Body is the exact
// bytes of that request while the reply is live. In a saved session the rows
// of a round that carried them are replaced by a short note, since result
// rows are never stored (ai_session_store.go).
type AISentRound struct {
	RequestID   string `json:"requestId,omitempty"`
	Round       int    `json:"round"`
	Host        string `json:"host"`
	Bytes       int    `json:"bytes"`
	Body        string `json:"body"`
	CarriesRows bool   `json:"carriesRows"`
}

// AIChatApproval asks whether the rows of one round may go to the model.
// Results are the tool results exactly as they would be sent.
type AIChatApproval struct {
	RequestID  string                 `json:"requestId"`
	Round      int                    `json:"round"`
	Host       string                 `json:"host"`
	Loopback   bool                   `json:"loopback"`
	Env        string                 `json:"env"`
	Production bool                   `json:"production"`
	Results    []AIChatApprovalResult `json:"results"`
}

// AIChatApprovalResult is one tool result that carries rows.
type AIChatApprovalResult struct {
	Tool    string `json:"tool"`
	Label   string `json:"label"`
	Rows    int    `json:"rows"`
	Content string `json:"content"`
}

const aiDeclinedRows = "The user declined to share these rows with the model."

// rowsNeedApproval reports whether rows read in env may go to this endpoint
// only after the user says yes: always for a cloud model, and for any model
// when the rows come from production (ADR 0017).
func rowsNeedApproval(endpoint ai.Endpoint, env string) bool {
	return !endpoint.Loopback || environmentIsProduction(env)
}

// awaitRowApproval shows the rows to the user and waits for an answer. It
// returns false on no, on timeout, when the reply was stopped, and when there
// is no one to ask (no request ID or no event channel).
func (s *AIService) awaitRowApproval(ctx, parent context.Context, approval AIChatApproval) bool {
	if approval.RequestID == "" || s.emitter == nil {
		return false
	}
	answer := make(chan bool, 1)
	s.approvalMu.Lock()
	if s.approvals == nil {
		s.approvals = map[string]chan bool{}
	}
	s.approvals[approval.RequestID] = answer
	s.approvalMu.Unlock()
	defer func() {
		s.approvalMu.Lock()
		delete(s.approvals, approval.RequestID)
		s.approvalMu.Unlock()
	}()

	s.emitter.Emit(parent, constant.EventAIChatApproval, approval)
	timer := time.NewTimer(aiApprovalTimeout)
	defer timer.Stop()
	select {
	case ok := <-answer:
		return ok
	case <-timer.C:
		return false
	case <-ctx.Done():
		return false
	}
}

// ResolveChatApproval answers the question awaitRowApproval asked.
func (s *AIService) ResolveChatApproval(requestID string, approve bool) error {
	s.approvalMu.Lock()
	answer := s.approvals[requestID]
	s.approvalMu.Unlock()
	if answer == nil {
		return fmt.Errorf("this reply is no longer waiting for an answer")
	}
	select {
	case answer <- approve:
	default:
	}
	return nil
}

func (s *AIService) emitRound(ctx context.Context, round AISentRound) {
	if s.emitter == nil || round.RequestID == "" {
		return
	}
	s.emitter.Emit(ctx, constant.EventAIChatRound, round)
}

// redactedRowsNote replaces the rows of a result in a saved session.
func redactedRowsNote(rows int, host string) string {
	return fmt.Sprintf(`{"ok":true,"data":{"note":"%d row(s) were shared with %s and are not kept"},"warnings":[]}`, rows, host)
}
