// SPDX-License-Identifier: GPL-3.0-only

package db

import "strings"

// NormalizeLiterals returns sql with string and numeric literals replaced by
// "?", quoted identifiers and placeholders preserved, keywords lowercased, and
// whitespace collapsed to single spaces. It uses the Postgres dialect, the
// reference driver. The result is meant for audit hashing, never execution, so
// raw literal values never leave the machine.
func NormalizeLiterals(sql string) string {
	tokens, _ := tokenizeSQLDialect(dialectFor("postgres"), sql, false)
	var b strings.Builder
	for i, t := range tokens {
		if i > 0 && needsSpace(tokens[i-1], t) {
			b.WriteByte(' ')
		}
		b.WriteString(normalizedText(t))
	}
	return b.String()
}

func normalizedText(t Token) string {
	if t.Kind == TokenString || t.Kind == TokenNumber {
		return "?"
	}
	return t.Text
}

func needsSpace(prev, cur Token) bool {
	if prev.Kind == TokenPunct && (prev.Text == "(" || prev.Text == ".") {
		return false
	}
	if cur.Kind == TokenPunct && (cur.Text == ")" || cur.Text == "," || cur.Text == ";" || cur.Text == ".") {
		return false
	}
	return true
}
