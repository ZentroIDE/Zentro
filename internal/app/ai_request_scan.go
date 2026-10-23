// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"

	"zentro/internal/extensions/ai"
)

// scanRequest looks for sensitive shapes in the parts of a request that are
// new to the provider, and names the part, so the hold notice can say
// where a match is and show it in context. The tool definitions are fixed
// text and are not scanned.
func scanRequest(message string, prepared aiPrepared) []ai.Match {
	out := []ai.Match{}
	seen := map[string]bool{}
	add := func(text, where string) {
		for _, match := range ai.ScanSource(text, where) {
			key := match.Type + "\x00" + match.Sample
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, match)
		}
	}
	add(message, "your message")
	if added := strings.TrimPrefix(prepared.Turn.UserText, message); added != prepared.Turn.UserText {
		add(added, "context sent with your message")
	}
	// Earlier turns of the chat are not scanned: they already went to this
	// provider (a reply came from it), so holding them again protects nothing
	// and would stop every later question on the same match.
	add(prepared.Turn.Metadata, "the saved notes, schema list, or chat summary")
	return out
}
