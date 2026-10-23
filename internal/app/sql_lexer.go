// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"unicode"

	"zentro/internal/constant"
)

type sqlTokKind int

const (
	tokWord sqlTokKind = iota
	tokQuotedIdent
	tokString
	tokNumber
	tokOperator
	tokPunct
	tokLineComment
	tokBlockComment
)

// sqlToken is one lexical unit of a SQL script. Text is verbatim; upper is the
// upper-cased text for words so keyword checks never re-case.
type sqlToken struct {
	kind     sqlTokKind
	text     string
	upper    string
	line     int  // 0-based source line the token starts on
	endLine  int  // 0-based source line the token ends on
	nlBefore bool // first token on its source line
}

var sqlMultiCharOperators = []string{
	"!~*", "->>", "<=>", "<>", "<=", ">=", "!=", "!<", "!>", "==", "||", "&&", "::", "->", "<<", ">>",
	"+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", ":=", "=>", "!~", "~*",
}

func isSQLWordChar(r rune) bool {
	return r == '_' || r == '@' || r == '#' || r == '$' || r == '?' || unicode.IsLetter(r) || unicode.IsDigit(r)
}

func isSQLDigit(r rune) bool { return r >= '0' && r <= '9' }

// lexSQL splits a script into tokens without ever failing: an unterminated
// string, identifier or comment simply runs to the end of the input.
func lexSQL(src string, dialect string) []sqlToken {
	r := []rune(src)
	n := len(r)
	dialect = strings.ToLower(strings.TrimSpace(dialect))
	// [ident] is T-SQL/SQLite quoting; in Postgres/MySQL a bracket is an array subscript.
	bracketIdent := dialect == "" || dialect == constant.DriverSQLServer || dialect == constant.DriverSQLite
	backslashEscapes := dialect == constant.DriverMySQL

	var toks []sqlToken
	line := 0
	prevEndLine := -1
	i := 0
	for i < n {
		c := r[i]
		if c == '\n' {
			line++
			i++
			continue
		}
		if unicode.IsSpace(c) {
			i++
			continue
		}

		start := i
		kind := tokWord
		switch {
		case c == '-' && i+1 < n && r[i+1] == '-':
			kind = tokLineComment
			for i < n && r[i] != '\n' {
				i++
			}
		case c == '/' && i+1 < n && r[i+1] == '*':
			kind = tokBlockComment
			i += 2
			for i < n && !(r[i] == '*' && i+1 < n && r[i+1] == '/') {
				i++
			}
			if i < n {
				i += 2
			}
		case c == '\'':
			kind = tokString
			i = scanQuotedSQL(r, i, '\'', backslashEscapes)
		case c == '"' || c == '`':
			kind = tokQuotedIdent
			i = scanQuotedSQL(r, i, c, false)
		case c == '[' && bracketIdent:
			kind = tokQuotedIdent
			i = scanBracketIdent(r, i)
		case c == '$' && dollarQuoteTagEnd(r, i) > 0:
			kind = tokString
			i = scanDollarQuoted(r, i)
		case c == ':' && i+1 < n && (unicode.IsLetter(r[i+1]) || r[i+1] == '_') && (i == 0 || r[i-1] != ':'):
			// Named parameter (:id), not a cast (::int).
			i++
			for i < n && isSQLWordChar(r[i]) {
				i++
			}
		case isSQLWordChar(c):
			for i < n && isSQLWordChar(r[i]) {
				i++
			}
			if isSQLDigit(c) {
				kind = tokNumber
				for i+1 < n && r[i] == '.' && isSQLDigit(r[i+1]) {
					i++
					for i < n && isSQLWordChar(r[i]) {
						i++
					}
				}
			} else if i-start == 1 && i < n && r[i] == '\'' && strings.ContainsRune("NnEeXxBb", c) {
				// N'unicode', E'escape', X'hex', B'bits' literal prefixes.
				kind = tokString
				i = scanQuotedSQL(r, i, '\'', backslashEscapes || c == 'E' || c == 'e')
			}
		case strings.ContainsRune("(),;.[]", c):
			kind = tokPunct
			i++
		default:
			kind = tokOperator
			i++
			for _, op := range sqlMultiCharOperators {
				oq := []rune(op)
				if start+len(oq) <= n && string(r[start:start+len(oq)]) == op {
					i = start + len(oq)
					break
				}
			}
		}

		text := string(r[start:i])
		if kind == tokLineComment {
			text = strings.TrimRight(text, "\r")
		}
		startLine := line
		for _, ch := range r[start:i] {
			if ch == '\n' {
				line++
			}
		}
		tok := sqlToken{
			kind:     kind,
			text:     text,
			line:     startLine,
			endLine:  line,
			nlBefore: len(toks) > 0 && startLine > prevEndLine,
		}
		if kind == tokWord {
			tok.upper = strings.ToUpper(text)
		}
		toks = append(toks, tok)
		prevEndLine = line
	}
	return toks
}

// scanQuotedSQL returns the index just past the closing quote. A doubled quote
// is an escaped quote; backslash escapes apply only where the dialect has them.
func scanQuotedSQL(r []rune, i int, q rune, backslash bool) int {
	i++
	for i < len(r) {
		switch {
		case backslash && r[i] == '\\' && i+1 < len(r):
			i += 2
		case r[i] == q:
			if i+1 < len(r) && r[i+1] == q {
				i += 2
				continue
			}
			return i + 1
		default:
			i++
		}
	}
	return i
}

func scanBracketIdent(r []rune, i int) int {
	i++
	for i < len(r) {
		if r[i] == ']' {
			if i+1 < len(r) && r[i+1] == ']' {
				i += 2
				continue
			}
			return i + 1
		}
		i++
	}
	return i
}

// dollarQuoteTagEnd returns the index just past the opening $tag$ of a
// dollar-quoted string, or 0 when r[i:] is not one ($1 is a parameter).
func dollarQuoteTagEnd(r []rune, i int) int {
	j := i + 1
	for j < len(r) && (unicode.IsLetter(r[j]) || r[j] == '_') {
		j++
	}
	if j < len(r) && r[j] == '$' {
		return j + 1
	}
	return 0
}

func scanDollarQuoted(r []rune, i int) int {
	bodyStart := dollarQuoteTagEnd(r, i)
	tag := string(r[i:bodyStart])
	if idx := strings.Index(string(r[bodyStart:]), tag); idx >= 0 {
		return bodyStart + len([]rune(string(r[bodyStart:])[:idx])) + len([]rune(tag))
	}
	return len(r)
}
