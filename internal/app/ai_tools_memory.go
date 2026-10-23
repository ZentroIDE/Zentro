// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"

	"zentro/internal/extensions/ai"
)

var aiRememberTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "remember",
		Description: "Save one short fact about this connection for later chats: what a column means, how two tables join, a naming rule. Describe meaning, never a value from a row. At most 300 characters. The person can read and delete every note.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"note":{"type":"string","description":"The fact, in one or two sentences."}` +
			`},"required":["note"],"additionalProperties":false}`),
	},
	group: aiGroupContext,
	// The chat saves notes with the <remember> tag instead (ai.SplitRemember).
	chatHidden: true,
	label:      func(json.RawMessage) string { return "Saved a note" },
	live:       rememberTool,
}

var aiForgetTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "forget",
		Description: "Delete one saved note by its id. Use it when a note is wrong or out of date.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"id":{"type":"string","description":"The note id list_notes returned."}` +
			`},"required":["id"],"additionalProperties":false}`),
	},
	group:      aiGroupContext,
	chatHidden: true,
	label:      func(json.RawMessage) string { return "Deleted a note" },
	live:       forgetTool,
}

var aiListNotesTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "list_notes",
		Description: "List the notes saved for this connection, each with its id.",
		Parameters:  json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
	},
	group:      aiGroupContext,
	chatHidden: true,
	label:      func(json.RawMessage) string { return "Read the saved notes" },
	live:       listNotesTool,
}

type aiRememberDTO struct {
	ID        string `json:"id"`
	Duplicate bool   `json:"duplicate"`
}

func rememberTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Note string `json:"note"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.Note) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the note to save", "")
	}
	projectID, connectionID, err := s.memoryScope()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, err.Error(), "")
	}
	note, duplicate, err := s.memoryStore().add(projectID, connectionID, in.Note, aiMemorySourceAgent)
	if err != nil {
		return nil, failTool(aiCodeInvalidArgument, err.Error(), "")
	}
	return aiRememberDTO{ID: note.ID, Duplicate: duplicate}, nil
}

func forgetTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.ID) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the note id", "")
	}
	projectID, connectionID, err := s.memoryScope()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, err.Error(), "")
	}
	found, err := s.memoryStore().remove(projectID, connectionID, strings.TrimSpace(in.ID))
	if err != nil {
		return nil, failTool(aiCodeInternal, "the note could not be deleted", "")
	}
	if !found {
		return nil, failTool(aiCodeObjectNotFound, "there is no note with that id", "Call list_notes.")
	}
	return aiForgetDTO{Deleted: true}, nil
}

type aiForgetDTO struct {
	Deleted bool `json:"deleted"`
}

type aiNotesDTO struct {
	Notes []aiNoteDTO `json:"notes"`
}

type aiNoteDTO struct {
	ID     string `json:"id"`
	Text   string `json:"text"`
	Source string `json:"source"`
}

func listNotesTool(_ context.Context, s *AIService, _ ai.Catalog, _ json.RawMessage) (any, error) {
	notes, err := s.ListMemoryNotes()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, err.Error(), "")
	}
	out := make([]aiNoteDTO, 0, len(notes))
	for _, note := range notes {
		out = append(out, aiNoteDTO{ID: note.ID, Text: note.Text, Source: note.Source})
	}
	return aiNotesDTO{Notes: out}, nil
}
