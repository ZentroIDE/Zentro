// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// Message is one earlier turn of the same chat session.
type Message struct {
	Role    string
	Content string
}

// Turn is one user message plus the metadata block already rendered.
// History holds earlier turns of the session, oldest first. Stream asks the
// host for a streamed reply. How that is written into a body is the adapter's job.
//
// Tools are offered to the model when set. Steps carry the tool rounds of this
// reply so far: a follow-up request repeats them so the model sees what it
// asked for and what came back.
type Turn struct {
	Model    string
	Metadata string
	UserText string
	History  []Message
	Stream   bool
	Tools    []ToolSpec
	Steps    []ToolStep
}

// Token is the hash of the exact body the user is about to send.
func Token(body string) string {
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

// ExtractSQL returns the first fenced SQL block in a model reply.
func ExtractSQL(reply string) string {
	const open = "```"
	rest := reply
	for {
		start := strings.Index(rest, open)
		if start < 0 {
			return ""
		}
		after := rest[start+len(open):]
		lineEnd := strings.IndexByte(after, '\n')
		if lineEnd < 0 {
			return ""
		}
		lang := strings.TrimSpace(after[:lineEnd])
		body := after[lineEnd+1:]
		close := strings.Index(body, open)
		if close < 0 {
			return ""
		}
		sql := strings.TrimSpace(body[:close])
		if lang == "" || strings.EqualFold(lang, "sql") {
			return sql
		}
		rest = body[close+len(open):]
	}
}
