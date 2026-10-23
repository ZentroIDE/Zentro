// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"zentro/internal/extensions/ai"
)

// Notes are short facts about one connection that the assistant carries from
// chat to chat, so a new question does not start from nothing. They hold
// meaning (what a column is for, how two tables join), never row values: a note
// that matches a sensitive shape is refused, the same scan a tool result gets.
const (
	aiMemoryMaxNotes    = 40
	aiMemoryMaxNoteLen  = 300
	aiMemorySourceAgent = "agent"
	aiMemorySourceUser  = "user"
)

// AIMemoryNote is one saved fact. Source says who wrote it, so the Settings
// list can mark what the agent added.
type AIMemoryNote struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	Source    string `json:"source"`
	CreatedAt string `json:"createdAt"`
}

// aiMemoryMaxHot is how many tables the assistant remembers having looked at.
const aiMemoryMaxHot = 8

// aiMemoryFile holds the notes and the names of the tables the assistant looked
// at most recently, newest first. Only names are kept: the columns are read from
// the live catalog each time, so a changed table is never described from an old
// copy.
type aiMemoryFile struct {
	Notes []AIMemoryNote `json:"notes"`
	Hot   []string       `json:"hot"`
}

// aiMemoryStore keeps one JSON file per connection under the project's
// session directory (a hash of the project ID, like aiSessionStore), in a
// memory/ folder. The connection ID is hashed too, so no ID reaches a path.
type aiMemoryStore struct {
	sessions *aiSessionStore
}

func (m *aiMemoryStore) path(projectID, connectionID string) (string, error) {
	if strings.TrimSpace(connectionID) == "" {
		return "", fmt.Errorf("connect to a database first")
	}
	dir, err := m.sessions.dir(projectID)
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "memory")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(connectionID))
	return filepath.Join(dir, hex.EncodeToString(sum[:8])+".json"), nil
}

func (m *aiMemoryStore) load(projectID, connectionID string) (aiMemoryFile, error) {
	path, err := m.path(projectID, connectionID)
	if err != nil {
		return aiMemoryFile{}, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return aiMemoryFile{Notes: []AIMemoryNote{}}, nil
		}
		return aiMemoryFile{}, err
	}
	var file aiMemoryFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return aiMemoryFile{}, fmt.Errorf("memory file is damaged")
	}
	if file.Notes == nil {
		file.Notes = []AIMemoryNote{}
	}
	return file, nil
}

// save writes through a temp file so a crash cannot leave half a file.
func (m *aiMemoryStore) save(projectID, connectionID string, file aiMemoryFile) error {
	path, err := m.path(projectID, connectionID)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (m *aiMemoryStore) list(projectID, connectionID string) ([]AIMemoryNote, error) {
	file, err := m.load(projectID, connectionID)
	if err != nil {
		return nil, err
	}
	return file.Notes, nil
}

// add stores one note. The same text is not stored twice, the list is capped,
// and text that looks like a secret or personal data is refused.
func (m *aiMemoryStore) add(projectID, connectionID, text, source string) (AIMemoryNote, bool, error) {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return AIMemoryNote{}, false, fmt.Errorf("the note is empty")
	}
	if utf8.RuneCountInString(text) > aiMemoryMaxNoteLen {
		return AIMemoryNote{}, false, fmt.Errorf("a note must be at most %d characters", aiMemoryMaxNoteLen)
	}
	if matches := ai.ScanText(text); len(matches) > 0 {
		return AIMemoryNote{}, false, fmt.Errorf("the note looks like it holds a %s, so it was not saved; describe the meaning, not the value", matches[0].Type)
	}
	file, err := m.load(projectID, connectionID)
	if err != nil {
		return AIMemoryNote{}, false, err
	}
	for _, note := range file.Notes {
		if strings.EqualFold(note.Text, text) {
			return note, true, nil
		}
	}
	if len(file.Notes) >= aiMemoryMaxNotes {
		return AIMemoryNote{}, false, fmt.Errorf("this connection already has %d notes; forget one first", aiMemoryMaxNotes)
	}
	id, err := newAIRandomID()
	if err != nil {
		return AIMemoryNote{}, false, err
	}
	note := AIMemoryNote{
		// A short id with a prefix: a long run of digits in a tool result reads as
		// a phone number to the sensitive-shape scan and would withhold the reply.
		ID:        "note-" + id[:6],
		Text:      text,
		Source:    source,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	file.Notes = append(file.Notes, note)
	if err := m.save(projectID, connectionID, file); err != nil {
		return AIMemoryNote{}, false, err
	}
	return note, false, nil
}

// touchHot moves a table to the front of the recently-looked-at list.
func (m *aiMemoryStore) touchHot(projectID, connectionID, table string) error {
	table = strings.TrimSpace(table)
	if table == "" {
		return nil
	}
	file, err := m.load(projectID, connectionID)
	if err != nil {
		return err
	}
	hot := make([]string, 0, aiMemoryMaxHot)
	hot = append(hot, table)
	for _, name := range file.Hot {
		if strings.EqualFold(name, table) || len(hot) >= aiMemoryMaxHot {
			continue
		}
		hot = append(hot, name)
	}
	file.Hot = hot
	return m.save(projectID, connectionID, file)
}

func (m *aiMemoryStore) hot(projectID, connectionID string) []string {
	file, err := m.load(projectID, connectionID)
	if err != nil {
		return nil
	}
	return file.Hot
}

func (m *aiMemoryStore) remove(projectID, connectionID, id string) (bool, error) {
	file, err := m.load(projectID, connectionID)
	if err != nil {
		return false, err
	}
	kept := make([]AIMemoryNote, 0, len(file.Notes))
	found := false
	for _, note := range file.Notes {
		if note.ID == id {
			found = true
			continue
		}
		kept = append(kept, note)
	}
	if !found {
		return false, nil
	}
	file.Notes = kept
	return true, m.save(projectID, connectionID, file)
}
