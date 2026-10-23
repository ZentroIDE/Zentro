// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"zentro/internal/db"
)

const (
	aiProposalPending     = "pending"
	aiProposalApproved    = "approved"
	aiProposalExecuting   = "executing"
	aiProposalSucceeded   = "succeeded"
	aiProposalFailed      = "failed"
	aiProposalRejected    = "rejected"
	aiProposalExpired     = "expired"
	aiProposalCancelled   = "cancelled"
	aiMaxPendingChanges   = 5
	aiMaxChangeSQLBytes   = 50 * 1024
	aiMaxChangeStatements = 20
)

type AIProposalStatement struct {
	N     int      `json:"n"`
	Kind  string   `json:"kind"`
	Risk  string   `json:"risk"`
	Rules []string `json:"rules"`
}

type AIProposalExecResult struct {
	N            int    `json:"n"`
	Status       string `json:"status"`
	RowsAffected int64  `json:"rowsAffected"`
	ElapsedMs    int64  `json:"elapsedMs"`
	SQLState     string `json:"sqlstate,omitempty"`
	Constraint   string `json:"constraint,omitempty"`
	Message      string `json:"message,omitempty"`
}

type AIProposalAnalysis struct {
	Impact  string          `json:"impact,omitempty"`
	Reason  string          `json:"reason,omitempty"`
	Details json.RawMessage `json:"details,omitempty"`
}

// AIChangeProposal is one pending or decided write. It is stored as one JSON
// file per id, mode 0600, next to the chat sessions of the project.
type AIChangeProposal struct {
	ID                   string                `json:"id"`
	State                string                `json:"state"`
	Title                string                `json:"title"`
	Rationale            string                `json:"rationale"`
	Env                  string                `json:"env"`
	SQL                  string                `json:"sql"`
	SQLNormalized        string                `json:"sqlNormalized"`
	SQLHash              string                `json:"sqlHash"`
	Params               []json.RawMessage     `json:"params,omitempty"`
	CreatedAt            string                `json:"createdAt"`
	ExpiresAt            string                `json:"expiresAt"`
	DecidedAt            string                `json:"decidedAt,omitempty"`
	ExecutedAt           string                `json:"executedAt,omitempty"`
	ProjectID            string                `json:"projectId"`
	ConnectionID         string                `json:"connectionId"`
	Database             string                `json:"database"`
	Schema               string                `json:"schema"`
	Driver               string                `json:"driver"`
	RequiresTypedConfirm bool                  `json:"requiresTypedConfirm"`
	CooldownSeconds      int                   `json:"cooldownSeconds"`
	Verdict              string                `json:"verdict"`
	Statements           []AIProposalStatement `json:"statements"`
	Analysis             AIProposalAnalysis    `json:"analysis"`
	// Explanation is the agent's account of the change; Checks is what Zentro
	// measured itself. The review shows both, apart (ai_proposal_explain.go).
	Explanation       *AIProposalExplanation `json:"explanation,omitempty"`
	Checks            []AIProposalCheck      `json:"checks"`
	PerStatement      []AIProposalExecResult `json:"perStatement,omitempty"`
	RestorePointID    string                 `json:"restorePointId,omitempty"`
	RejectionNote     string                 `json:"rejectionNote,omitempty"`
	FailReason        string                 `json:"failReason,omitempty"`
	ReviewPresentedAt string                 `json:"reviewPresentedAt,omitempty"`
	Deduplicated      bool                   `json:"deduplicated,omitempty"`
}

type aiProposalStore struct {
	mu   sync.Mutex
	root string
	now  func() time.Time
}

func (s *AIService) proposals() *aiProposalStore {
	root := s.sessionsDir
	if root == "" {
		root, _ = defaultAISessionsDir()
	}
	return &aiProposalStore{root: filepath.Join(root, "proposals"), now: time.Now}
}

func proposalTTL(env string) time.Duration {
	switch normalizeEnvironmentKey(env) {
	case "pro":
		return 5 * time.Minute
	case "sta":
		return 10 * time.Minute
	default:
		return 15 * time.Minute
	}
}

func (p *aiProposalStore) dir(projectID string) (string, error) {
	if strings.TrimSpace(projectID) == "" {
		return "", fmt.Errorf("no project is open")
	}
	sum := sha256.Sum256([]byte(projectID))
	dir := filepath.Join(p.root, hex.EncodeToString(sum[:8]))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func (p *aiProposalStore) path(projectID, id string) (string, error) {
	if !aiSessionIDPattern.MatchString(id) {
		return "", failTool(aiCodeObjectNotFound, "there is no proposal with that id", "")
	}
	dir, err := p.dir(projectID)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, id+".json"), nil
}

func (p *aiProposalStore) save(projectID string, prop AIChangeProposal) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.saveLocked(projectID, prop)
}

func (p *aiProposalStore) saveLocked(projectID string, prop AIChangeProposal) error {
	path, err := p.path(projectID, prop.ID)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(prop, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (p *aiProposalStore) load(projectID, id string) (AIChangeProposal, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.loadLocked(projectID, id)
}

func (p *aiProposalStore) loadLocked(projectID, id string) (AIChangeProposal, error) {
	path, err := p.path(projectID, id)
	if err != nil {
		return AIChangeProposal{}, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return AIChangeProposal{}, failTool(aiCodeObjectNotFound, "there is no proposal with that id", "")
		}
		return AIChangeProposal{}, err
	}
	var prop AIChangeProposal
	if err := json.Unmarshal(raw, &prop); err != nil {
		return AIChangeProposal{}, failTool(aiCodeInternal, "the proposal file is damaged", "")
	}
	return p.expireIfNeededLocked(projectID, prop)
}

func (p *aiProposalStore) expireIfNeededLocked(projectID string, prop AIChangeProposal) (AIChangeProposal, error) {
	if prop.State != aiProposalPending {
		return prop, nil
	}
	exp, err := time.Parse(time.RFC3339, prop.ExpiresAt)
	if err != nil {
		return prop, nil
	}
	now := time.Now()
	if p.now != nil {
		now = p.now()
	}
	if now.After(exp) {
		prop.State = aiProposalExpired
		prop.DecidedAt = now.UTC().Format(time.RFC3339)
		_ = p.saveLocked(projectID, prop)
	}
	return prop, nil
}

func (p *aiProposalStore) list(projectID string) ([]AIChangeProposal, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.listLocked(projectID)
}

func (p *aiProposalStore) listLocked(projectID string) ([]AIChangeProposal, error) {
	dir, err := p.dir(projectID)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]AIChangeProposal, 0, len(entries))
	for _, entry := range entries {
		id := strings.TrimSuffix(entry.Name(), ".json")
		if entry.IsDir() || !aiSessionIDPattern.MatchString(id) {
			continue
		}
		prop, err := p.loadLocked(projectID, id)
		if err != nil {
			continue
		}
		out = append(out, prop)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

func (p *aiProposalStore) pendingCountLocked(projectID, exceptID string) int {
	all, err := p.listLocked(projectID)
	if err != nil {
		return 0
	}
	n := 0
	for _, prop := range all {
		if prop.State == aiProposalPending && prop.ID != exceptID {
			n++
		}
	}
	return n
}

func (p *aiProposalStore) findDuplicateLocked(projectID, env, sqlHash string) (AIChangeProposal, bool) {
	all, err := p.listLocked(projectID)
	if err != nil {
		return AIChangeProposal{}, false
	}
	for _, prop := range all {
		if prop.State == aiProposalPending && strings.EqualFold(prop.Env, env) && prop.SQLHash == sqlHash {
			return prop, true
		}
	}
	return AIChangeProposal{}, false
}

func (p *aiProposalStore) create(projectID string, prop AIChangeProposal) (AIChangeProposal, bool, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if dup, ok := p.findDuplicateLocked(projectID, prop.Env, prop.SQLHash); ok {
		return dup, true, nil
	}
	if p.pendingCountLocked(projectID, "") >= aiMaxPendingChanges {
		return AIChangeProposal{}, false, failTool(aiCodeRateLimited, "there are already five pending proposals", "Cancel or wait for one to expire.")
	}
	if prop.ID == "" {
		id, err := newAIRandomID()
		if err != nil {
			return AIChangeProposal{}, false, err
		}
		prop.ID = id
	}
	if err := p.saveLocked(projectID, prop); err != nil {
		return AIChangeProposal{}, false, err
	}
	return prop, false, nil
}

func (p *aiProposalStore) transition(projectID, id, to string, mutate func(*AIChangeProposal)) (AIChangeProposal, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	prop, err := p.loadLocked(projectID, id)
	if err != nil {
		return AIChangeProposal{}, err
	}
	if !allowedProposalTransition(prop.State, to) {
		return AIChangeProposal{}, failTool(aiCodeInvalidState, "this proposal cannot move to "+to+" from "+prop.State, "")
	}
	prop.State = to
	if mutate != nil {
		mutate(&prop)
	}
	if err := p.saveLocked(projectID, prop); err != nil {
		return AIChangeProposal{}, err
	}
	return prop, nil
}

func (p *aiProposalStore) markReviewPresented(projectID, id string) (AIChangeProposal, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	prop, err := p.loadLocked(projectID, id)
	if err != nil {
		return AIChangeProposal{}, err
	}
	if prop.ReviewPresentedAt == "" && prop.State == aiProposalPending {
		now := time.Now()
		if p.now != nil {
			now = p.now()
		}
		prop.ReviewPresentedAt = now.UTC().Format(time.RFC3339)
		if err := p.saveLocked(projectID, prop); err != nil {
			return AIChangeProposal{}, err
		}
	}
	return prop, nil
}

func hashChangeSQL(sql string, params []json.RawMessage) (normalized, hash string) {
	normalized = db.NormalizeLiterals(sql)
	sum := sha256.Sum256([]byte(normalized + "\n" + string(mustJSON(params))))
	return normalized, hex.EncodeToString(sum[:])
}

func mustJSON(v any) []byte {
	raw, _ := json.Marshal(v)
	if raw == nil {
		return []byte("null")
	}
	return raw
}

func allowedProposalTransition(from, to string) bool {
	switch from {
	case aiProposalPending:
		switch to {
		case aiProposalCancelled, aiProposalRejected, aiProposalExpired, aiProposalApproved, aiProposalExecuting:
			return true
		}
	case aiProposalApproved:
		return to == aiProposalExecuting
	case aiProposalExecuting:
		return to == aiProposalSucceeded || to == aiProposalFailed
	}
	return false
}
