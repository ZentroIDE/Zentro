// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"strings"
	"unicode"
)

// MissingDefinitionMarker is the placeholder SQL Server stores when a module
// is encrypted or the caller lacks VIEW DEFINITION. It is not source code.
const MissingDefinitionMarker = "Definition not available or encrypted"

// IsMissingDefinition reports SQL Server's encrypted-or-hidden module text.
func IsMissingDefinition(ddl string) bool {
	return strings.Contains(strings.ToLower(ddl), strings.ToLower(MissingDefinitionMarker))
}

// ScrubCode replaces literals and credential-shaped fragments in a routine,
// view, or script body. It is a heuristic. Callers still show the scrubbed
// text to the user before anything is sent.
func ScrubCode(src string) string {
	if src == "" || IsMissingDefinition(src) {
		return ""
	}
	out := scrubPasswordClauses(src)
	out = scrubUserInfoURLs(out)
	out = scrubDblink(out)
	out = scrubDollarQuotes(out)
	out = scrubQuotedLiterals(out)
	out = scrubHexAndNumbers(out)
	return out
}

func scrubPasswordClauses(src string) string {
	lower := strings.ToLower(src)
	var b strings.Builder
	i := 0
	for i < len(src) {
		idx := keywordAt(lower, i, "password")
		pwd := keywordAt(lower, i, "pwd")
		if idx < 0 && pwd < 0 {
			b.WriteString(src[i:])
			break
		}
		at := idx
		word := "password"
		if pwd >= 0 && (at < 0 || pwd < at) {
			at = pwd
			word = "pwd"
		}
		b.WriteString(src[i:at])
		b.WriteString(src[at : at+len(word)])
		j := at + len(word)
		for j < len(src) && unicode.IsSpace(rune(src[j])) {
			j++
		}
		if j < len(src) && src[j] == '=' {
			j++
			for j < len(src) && unicode.IsSpace(rune(src[j])) {
				j++
			}
		}
		j = skipSecretToken(src, j)
		b.WriteString(" '?'")
		i = j
	}
	return b.String()
}

func keywordAt(lower string, from int, word string) int {
	for {
		idx := strings.Index(lower[from:], word)
		if idx < 0 {
			return -1
		}
		at := from + idx
		if boundary(lower, at, at+len(word)) {
			return at
		}
		from = at + len(word)
	}
}

func boundary(s string, start, end int) bool {
	if start > 0 && (isIdent(rune(s[start-1]))) {
		return false
	}
	if end < len(s) && isIdent(rune(s[end])) {
		return false
	}
	return true
}

func isIdent(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_'
}

func skipSecretToken(src string, j int) int {
	if j >= len(src) {
		return j
	}
	if src[j] == '\'' {
		j++
		for j < len(src) {
			if src[j] == '\'' {
				if j+1 < len(src) && src[j+1] == '\'' {
					j += 2
					continue
				}
				return j + 1
			}
			j++
		}
		return j
	}
	for j < len(src) && !unicode.IsSpace(rune(src[j])) && src[j] != ';' && src[j] != ',' {
		j++
	}
	return j
}

func scrubUserInfoURLs(src string) string {
	lower := strings.ToLower(src)
	var b strings.Builder
	i := 0
	for i < len(src) {
		scheme := strings.Index(lower[i:], "://")
		if scheme < 0 {
			b.WriteString(src[i:])
			break
		}
		at := i + scheme
		start := at
		for start > i && isSchemeChar(src[start-1]) {
			start--
		}
		rest := src[at+3:]
		colon := strings.IndexByte(rest, ':')
		atSign := strings.IndexByte(rest, '@')
		if colon >= 0 && atSign > colon {
			b.WriteString(src[i:start])
			b.WriteString(src[start : at+3])
			i = at + 3 + atSign + 1
			continue
		}
		b.WriteString(src[i : at+3])
		i = at + 3
	}
	return b.String()
}

func isSchemeChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '+' || b == '.' || b == '-'
}

func scrubDblink(src string) string {
	lower := strings.ToLower(src)
	var b strings.Builder
	i := 0
	for {
		idx := strings.Index(lower[i:], "dblink")
		if idx < 0 {
			b.WriteString(src[i:])
			return b.String()
		}
		at := i + idx
		if !boundary(lower, at, at+6) {
			b.WriteString(src[i : at+6])
			i = at + 6
			continue
		}
		j := at + 6
		for j < len(src) && unicode.IsSpace(rune(src[j])) {
			j++
		}
		if j >= len(src) || src[j] != '(' {
			b.WriteString(src[i:j])
			i = j
			continue
		}
		end := strings.IndexByte(src[j:], ')')
		if end < 0 {
			b.WriteString(src[i:])
			return b.String()
		}
		b.WriteString(src[i:at])
		b.WriteString("dblink('?')")
		i = j + end + 1
	}
}

func scrubDollarQuotes(src string) string {
	var b strings.Builder
	i := 0
	for i < len(src) {
		start := strings.IndexByte(src[i:], '$')
		if start < 0 {
			b.WriteString(src[i:])
			break
		}
		at := i + start
		tagEnd := at + 1
		for tagEnd < len(src) && isTag(src[tagEnd]) {
			tagEnd++
		}
		if tagEnd >= len(src) || src[tagEnd] != '$' {
			b.WriteString(src[i : at+1])
			i = at + 1
			continue
		}
		closer := src[at : tagEnd+1]
		next := strings.Index(src[tagEnd+1:], closer)
		if next < 0 {
			b.WriteString(src[i:])
			break
		}
		b.WriteString(src[i:at])
		b.WriteString("'?'")
		i = tagEnd + 1 + next + len(closer)
	}
	return b.String()
}

func isTag(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_'
}

func scrubQuotedLiterals(src string) string {
	var b strings.Builder
	i := 0
	for i < len(src) {
		if src[i] != '\'' {
			b.WriteByte(src[i])
			i++
			continue
		}
		j := i + 1
		for j < len(src) {
			if src[j] == '\'' {
				if j+1 < len(src) && src[j+1] == '\'' {
					j += 2
					continue
				}
				j++
				break
			}
			j++
		}
		b.WriteString("'?'")
		i = j
	}
	return b.String()
}

func scrubHexAndNumbers(src string) string {
	var b strings.Builder
	i := 0
	for i < len(src) {
		if i+1 < len(src) && src[i] == '0' && (src[i+1] == 'x' || src[i+1] == 'X') && (i == 0 || !isIdent(rune(src[i-1]))) {
			j := i + 2
			for j < len(src) && isHex(src[j]) {
				j++
			}
			if j > i+2 {
				b.WriteString("'?'")
				i = j
				continue
			}
		}
		if src[i] >= '0' && src[i] <= '9' && (i == 0 || !isIdent(rune(src[i-1]))) {
			j := i + 1
			for j < len(src) && src[j] >= '0' && src[j] <= '9' {
				j++
			}
			if j < len(src) && src[j] == '.' {
				k := j + 1
				for k < len(src) && src[k] >= '0' && src[k] <= '9' {
					k++
				}
				if k > j+1 {
					j = k
				}
			}
			b.WriteByte('?')
			i = j
			continue
		}
		b.WriteByte(src[i])
		i++
	}
	return b.String()
}

func isHex(b byte) bool {
	return (b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F')
}
