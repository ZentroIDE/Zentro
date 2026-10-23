// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Usage is the token count a provider reported for one request. Cached is
// the part of Input served from the provider's prompt cache.
type Usage struct {
	Input  int `json:"input"`
	Output int `json:"output"`
	Cached int `json:"cached"`
}

// EstimateTokens is a rough count before a send. Providers use different
// tokenizers, so callers must label it as an estimate.
func EstimateTokens(text string) int {
	return (len(text) + 3) / 4
}

const maxSuggestions = 3

var (
	suggestionBlock = regexp.MustCompile(`(?s)<suggestions>(.*?)</suggestions>`)
	// Some models write the follow-ups as their own tool-call markup instead,
	// for example <｜DSML｜function_calls> ... <｜DSML｜invoke name="suggestions">.
	// The bars may be the full-width ｜ or a plain |, with spaces between.
	toolMarkup  = regexp.MustCompile(`<\s*[|｜]+\s*DSML`)
	stringArray = regexp.MustCompile(`(?s)\[\s*(?:"(?:[^"\\]|\\.)*"\s*,?\s*)*\]`)
)

// HasSuggestionMarkup reports whether a reply still carries follow-up markup,
// in the tag form or as tool-call markup.
func HasSuggestionMarkup(text string) bool {
	return strings.Contains(text, "<suggestions>") || toolMarkup.MatchString(text)
}

// SplitSuggestions removes the follow-up questions from the end of a reply and
// returns them. It reads the <suggestions> tag, the tool-call markup some models
// write instead, and a tag whose closing half never arrived. Whatever markup it
// cannot read is dropped too, so none of it reaches the chat as text.
func SplitSuggestions(reply string) (string, []string) {
	matches := suggestionBlock.FindAllStringSubmatchIndex(reply, -1)
	if len(matches) > 0 {
		last := matches[len(matches)-1]
		clean := strings.TrimSpace(reply[:last[0]] + reply[last[1]:])
		return clean, parseSuggestions(reply[last[2]:last[3]])
	}
	if loc := toolMarkup.FindStringIndex(reply); loc != nil {
		return strings.TrimSpace(reply[:loc[0]]), suggestionsFromTail(reply[loc[0]:])
	}
	if i := strings.Index(reply, "<suggestions>"); i >= 0 {
		return strings.TrimSpace(reply[:i]), suggestionsFromTail(reply[i:])
	}
	return reply, nil
}

// suggestionsFromTail reads the first list of strings in markup that was cut
// off from the reply. Markup that is not about suggestions yields nothing.
func suggestionsFromTail(tail string) []string {
	if !strings.Contains(strings.ToLower(tail), "suggestion") {
		return nil
	}
	return parseSuggestions(stringArray.FindString(tail))
}

func parseSuggestions(raw string) []string {
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil
	}
	out := make([]string, 0, maxSuggestions)
	seen := map[string]bool{}
	for _, item := range items {
		text := strings.TrimSpace(item)
		if text == "" || seen[text] || len(text) > 200 {
			continue
		}
		seen[text] = true
		out = append(out, text)
		if len(out) == maxSuggestions {
			break
		}
	}
	return out
}

// maxRememberNotes and maxRememberLen bound what one reply may save. The store
// applies its own cap and sensitive-shape check on top.
const (
	maxRememberNotes = 2
	maxRememberLen   = 300
)

var rememberBlock = regexp.MustCompile(`(?s)<remember>(.*?)</remember>`)

// SplitRemember removes the <remember> tags from a reply and returns the notes
// they held. A model saves a lasting fact this way, at the end of its answer,
// instead of calling a tool and paying for another round. The tag holds a JSON
// array of strings; plain text is read as one note. A tag whose closing half
// never arrived is dropped up to the follow-up questions.
func SplitRemember(reply string) (string, []string) {
	var notes []string
	for _, m := range rememberBlock.FindAllStringSubmatch(reply, -1) {
		notes = append(notes, parseRememberNotes(m[1])...)
	}
	clean := rememberBlock.ReplaceAllString(reply, "")
	if i := strings.Index(clean, "<remember>"); i >= 0 {
		rest := clean[i:]
		if j := strings.Index(rest, "<suggestions>"); j >= 0 {
			clean = clean[:i] + rest[j:]
		} else {
			clean = clean[:i]
		}
	}
	return strings.TrimSpace(clean), dedupeNotes(notes)
}

func parseRememberNotes(raw string) []string {
	raw = strings.TrimSpace(raw)
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err == nil {
		return items
	}
	if raw == "" {
		return nil
	}
	return []string{raw}
}

func dedupeNotes(items []string) []string {
	out := make([]string, 0, maxRememberNotes)
	seen := map[string]bool{}
	for _, item := range items {
		text := strings.Join(strings.Fields(item), " ")
		key := strings.ToLower(text)
		if text == "" || seen[key] || len(text) > maxRememberLen {
			continue
		}
		seen[key] = true
		out = append(out, text)
		if len(out) == maxRememberNotes {
			break
		}
	}
	return out
}
