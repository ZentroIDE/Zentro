// SPDX-License-Identifier: GPL-3.0-only

package db

import (
	"strconv"
	"strings"
)

// ParamMode says what RewriteParams turns placeholders into.
type ParamMode int

const (
	// ParamsForPrepare turns :name placeholders into the driver's own form so
	// the database can prepare the statement: $1, $2 for Postgres (repeated
	// names share a number) and ? for MySQL. SQLite understands :name itself.
	// Placeholders already in the driver's form are left alone.
	ParamsForPrepare ParamMode = iota
	// ParamsAsNull turns every placeholder into NULL, for a statement that
	// cannot take parameters at all, such as EXPLAIN.
	ParamsAsNull
)

// RewriteParams rewrites the placeholders of a statement the assistant wrote
// with :name placeholders, so a check-only tool can hand it to the database.
// It returns the new text and how many placeholders it replaced. Literals,
// comments, and :: casts are never touched. A statement the tokenizer cannot
// read comes back unchanged with a count of 0.
func RewriteParams(driver, sql string, mode ParamMode) (string, int) {
	tokens, err := Tokenize("", sql)
	if err != nil {
		return sql, 0
	}
	driver = strings.ToLower(strings.TrimSpace(driver))
	var b strings.Builder
	b.Grow(len(sql))
	last := 0
	replaced := 0
	numbers := map[string]int{}
	for _, tok := range tokens {
		if tok.Kind != TokenPlaceholder {
			continue
		}
		replacement, ok := paramReplacement(driver, sql, tok, mode, numbers)
		if !ok {
			continue
		}
		b.WriteString(sql[last:tok.Start])
		b.WriteString(replacement)
		last = tok.End
		replaced++
	}
	if replaced == 0 {
		return sql, 0
	}
	b.WriteString(sql[last:])
	return b.String(), replaced
}

func paramReplacement(driver, sql string, tok Token, mode ParamMode, numbers map[string]int) (string, bool) {
	text := sql[tok.Start:tok.End]
	named := isNamedColonParam(sql, tok)
	if mode == ParamsAsNull {
		if named || isNativeParam(driver, text) {
			return "NULL", true
		}
		return "", false
	}
	if !named {
		return "", false
	}
	switch driver {
	case "postgres", "postgresql":
		key := strings.ToLower(text)
		n, ok := numbers[key]
		if !ok {
			n = len(numbers) + 1
			numbers[key] = n
		}
		return "$" + strconv.Itoa(n), true
	case "mysql", "mariadb":
		return "?", true
	default:
		return "", false
	}
}

// isNamedColonParam reports whether tok is a :name placeholder, not half of a
// :: cast (x::text) and not a lone colon.
func isNamedColonParam(sql string, tok Token) bool {
	text := sql[tok.Start:tok.End]
	if len(text) < 2 || text[0] != ':' {
		return false
	}
	if tok.Start > 0 && sql[tok.Start-1] == ':' {
		return false
	}
	return true
}

// isNativeParam reports whether text is a placeholder in the driver's own
// form, which EXPLAIN cannot take either.
func isNativeParam(driver, text string) bool {
	switch driver {
	case "postgres", "postgresql":
		return strings.HasPrefix(text, "$") && len(text) > 1 && text[1] >= '0' && text[1] <= '9'
	case "mysql", "mariadb", "sqlite", "sqlite3":
		return strings.HasPrefix(text, "?")
	case "sqlserver", "mssql":
		return strings.HasPrefix(text, "@") && !strings.HasPrefix(text, "@@")
	}
	return false
}
