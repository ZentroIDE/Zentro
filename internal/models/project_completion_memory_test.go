// SPDX-License-Identifier: GPL-3.0-only

package models

import (
	"encoding/json"
	"testing"
)

func TestProjectCompletionMemoryJSONRoundTrip(t *testing.T) {
	project := NewProject("Completion memory")
	project.CompletionMemory = &SQLCompletionMemory{
		Version: 1,
		Entries: []SQLCompletionMemoryEntry{
			{
				SuggestionKey:  "users",
				SuggestionKind: "table",
				ContextBucket:  "from|main|postgres|public|",
				AcceptCount:    2,
				LastAcceptedAt: 100,
			},
		},
	}

	payload, err := json.Marshal(project)
	if err != nil {
		t.Fatalf("marshal project: %v", err)
	}

	var restored Project
	if err := json.Unmarshal(payload, &restored); err != nil {
		t.Fatalf("unmarshal project: %v", err)
	}
	if restored.CompletionMemory == nil {
		t.Fatal("expected completion memory")
	}
	if got := restored.CompletionMemory.Entries[0].AcceptCount; got != 2 {
		t.Fatalf("expected accept count 2, got %d", got)
	}
}
