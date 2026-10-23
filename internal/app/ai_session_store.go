// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"zentro/internal/extensions/ai"
	"zentro/internal/utils"
)

// AISessionUsage is the token count a provider reported for one reply.
type AISessionUsage struct {
	Input  int `json:"input"`
	Output int `json:"output"`
	Cached int `json:"cached"`
}

// AISessionTurn is one message in a saved chat. Assistant text is stored
// without the suggestions block. Keys and result rows are never stored.
type AISessionTurn struct {
	ID          string   `json:"id"`
	Role        string   `json:"role"`
	Text        string   `json:"text"`
	SQL         string   `json:"sql"`
	Suggestions []string `json:"suggestions"`
	Tools       []string `json:"tools"`
	// Rounds is every request an assistant reply sent, rows replaced by a
	// note (ai_chat_approval.go), so the user can see what left the machine.
	Rounds []AISentRound `json:"rounds,omitempty"`
	// DurationMs is how long an assistant reply took.
	DurationMs int64           `json:"durationMs,omitempty"`
	Usage      *AISessionUsage `json:"usage,omitempty"`
	CreatedAt  string          `json:"createdAt"`
}

// AISession is one saved chat for a project. Provider and model are the
// ones used when the session was last sent to.
type AISession struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Provider  string          `json:"provider"`
	Model     string          `json:"model"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
	Turns     []AISessionTurn `json:"turns"`
	// Memory is the memory block frozen on the first question, so later
	// requests keep the same prefix (ai_chat_context.go).
	Memory *AISessionMemory `json:"memory,omitempty"`
	// Summary folds the turns before SummaryThrough; only the turns after it
	// are replayed verbatim.
	Summary        string `json:"summary,omitempty"`
	SummaryThrough int    `json:"summaryThrough,omitempty"`
}

// AISessionSummary is the list row for the session picker.
type AISessionSummary struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Model     string `json:"model"`
	UpdatedAt string `json:"updatedAt"`
	TurnCount int    `json:"turnCount"`
}

const (
	maxAISessionsPerProject = 100
	maxAISessionTitle       = 60
)

var aiSessionIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

// aiSessionStore keeps one JSON file per session under a directory named by
// a hash of the project ID, so no project string reaches a path.
type aiSessionStore struct {
	root string
}

func defaultAISessionsDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	name := "zentro"
	if utils.Channel == "nightly" {
		name = "zentro-nightly"
	}
	return filepath.Join(base, name, "ai-sessions"), nil
}

func (s *aiSessionStore) dir(projectID string) (string, error) {
	root := s.root
	if root == "" {
		var err error
		root, err = defaultAISessionsDir()
		if err != nil {
			return "", err
		}
	}
	sum := sha256.Sum256([]byte(projectID))
	dir := filepath.Join(root, hex.EncodeToString(sum[:8]))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func (s *aiSessionStore) path(projectID, id string) (string, error) {
	if !aiSessionIDPattern.MatchString(id) {
		return "", fmt.Errorf("session not found")
	}
	dir, err := s.dir(projectID)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, id+".json"), nil
}

func newAIRandomID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func (s *aiSessionStore) create(projectID, provider, model string) (AISession, error) {
	id, err := newAIRandomID()
	if err != nil {
		return AISession{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	session := AISession{
		ID:        id,
		Title:     "New chat",
		Provider:  provider,
		Model:     model,
		CreatedAt: now,
		UpdatedAt: now,
		Turns:     []AISessionTurn{},
	}
	if err := s.save(projectID, session); err != nil {
		return AISession{}, err
	}
	s.prune(projectID)
	return session, nil
}

func (s *aiSessionStore) load(projectID, id string) (AISession, error) {
	path, err := s.path(projectID, id)
	if err != nil {
		return AISession{}, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return AISession{}, fmt.Errorf("session not found")
		}
		return AISession{}, err
	}
	var session AISession
	if err := json.Unmarshal(raw, &session); err != nil {
		return AISession{}, fmt.Errorf("session file is damaged")
	}
	return withNoNilLists(session), nil
}

// save writes through a temp file so a crash cannot leave half a session.
func (s *aiSessionStore) save(projectID string, session AISession) error {
	path, err := s.path(projectID, session.ID)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(withNoNilLists(session), "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *aiSessionStore) list(projectID string) ([]AISessionSummary, error) {
	dir, err := s.dir(projectID)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]AISessionSummary, 0, len(entries))
	for _, entry := range entries {
		id := strings.TrimSuffix(entry.Name(), ".json")
		if entry.IsDir() || !aiSessionIDPattern.MatchString(id) {
			continue
		}
		session, err := s.load(projectID, id)
		if err != nil {
			continue
		}
		out = append(out, AISessionSummary{
			ID:        session.ID,
			Title:     session.Title,
			Model:     session.Model,
			UpdatedAt: session.UpdatedAt,
			TurnCount: len(session.Turns),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

func (s *aiSessionStore) remove(projectID, id string) error {
	path, err := s.path(projectID, id)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// prune drops the oldest sessions once a project passes the cap.
func (s *aiSessionStore) prune(projectID string) {
	items, err := s.list(projectID)
	if err != nil || len(items) <= maxAISessionsPerProject {
		return
	}
	for _, item := range items[maxAISessionsPerProject:] {
		_ = s.remove(projectID, item.ID)
	}
}

// sessionTitle makes a short title from the first question.
func sessionTitle(question string) string {
	text := strings.Join(strings.Fields(question), " ")
	runes := []rune(text)
	if len(runes) > maxAISessionTitle {
		return string(runes[:maxAISessionTitle]) + "…"
	}
	return text
}

// withNoNilLists makes every list in a session an empty list instead of nil, so
// it reaches the UI as [] and not null. It also repairs files saved before this.
func withNoNilLists(session AISession) AISession {
	if session.Turns == nil {
		session.Turns = []AISessionTurn{}
	}
	for i := range session.Turns {
		turn := &session.Turns[i]
		// A reply saved before the splitter read tool-call markup still has that
		// markup in its text. Split it again so it is shown as follow-ups.
		if turn.Role == "assistant" && strings.Contains(turn.Text, "<remember>") {
			turn.Text, _ = ai.SplitRemember(turn.Text)
		}
		if turn.Role == "assistant" && ai.HasSuggestionMarkup(turn.Text) {
			clean, items := ai.SplitSuggestions(turn.Text)
			turn.Text = clean
			if len(turn.Suggestions) == 0 {
				turn.Suggestions = items
			}
		}
		if turn.Suggestions == nil {
			turn.Suggestions = []string{}
		}
		if turn.Tools == nil {
			turn.Tools = []string{}
		}
	}
	return session
}
