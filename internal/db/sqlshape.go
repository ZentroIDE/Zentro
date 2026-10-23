// SPDX-License-Identifier: GPL-3.0-only

package db

import "strings"

// CountShapeError is why ParseCountTarget refused a statement.
type CountShapeError struct {
	Code    string
	Reason  string
	Message string
	Hint    string
}

const countShapeHint = "Rewrite joins as WHERE id IN (SELECT ...), or use dry_run on dev or sta."

// CountTarget is one UPDATE or DELETE of the supported single-table shape.
type CountTarget struct {
	Kind     string // "update" or "delete"
	Schema   string // empty when the SQL named no schema
	Table    string // bare table name, unquoted, lowercased for matching
	Alias    string
	WhereSQL string // verbatim slice including WHERE, empty when absent
	NoWhere  bool
	SQL      string
}

// ParseCountTarget tokenizes sql and accepts only the single-table UPDATE
// or DELETE shape used by estimate_impact and preview_cascade.
func ParseCountTarget(driver, sql string, requireDelete bool) (*CountTarget, *CountShapeError) {
	// The empty dialect is a superset, so $1, ?, and @p1 are all placeholders
	// even when this statement will later run on Postgres.
	_ = driver
	tokens, err := Tokenize("", sql)
	if err != nil {
		return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "unsupported_token", Message: "this SQL uses a token form Zentro does not analyze", Hint: countShapeHint}
	}
	stmts := SplitTokens(tokens)
	if len(stmts) != 1 {
		return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "multiple_statements", Message: "this tool accepts exactly one statement", Hint: countShapeHint}
	}
	stmt := stmts[0]
	for _, tok := range stmt {
		if tok.Kind == TokenPlaceholder {
			return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "has_placeholder", Message: "placeholders are not accepted here", Hint: "Inline the values, or use dry_run on dev or sta."}
		}
	}
	if leadingKeyword(stmt) == "with" {
		return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "has_cte", Message: "WITH (CTE) statements are outside the supported counting shape", Hint: countShapeHint}
	}
	first := FirstKeyword(stmt)
	switch first {
	case "update":
		if requireDelete {
			return nil, &CountShapeError{Code: GuardSQLNotAllowed, Reason: "not_delete", Message: "preview_cascade accepts only a DELETE", Hint: ""}
		}
	case "delete":
	case "merge":
		return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "merge", Message: "MERGE is outside the supported counting shape", Hint: countShapeHint}
	default:
		return nil, &CountShapeError{Code: GuardSQLNotAllowed, Reason: "not_update_or_delete", Message: "only a single-table UPDATE or DELETE can be counted", Hint: countShapeHint}
	}

	i := 0
	i = skipKeyword(stmt, i, first)
	if first == "delete" {
		if i >= len(stmt) || stmt[i].Kind != TokenKeyword || stmt[i].Text != "from" {
			return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "ambiguous_table", Message: "could not find the target table", Hint: countShapeHint}
		}
		i++
	}
	if i < len(stmt) && stmt[i].Kind == TokenKeyword && stmt[i].Text == "only" {
		i++
	}
	schema, table, next, ok := parseQualifiedName(stmt, i)
	if !ok || table == "" {
		return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "ambiguous_table", Message: "could not find the target table", Hint: countShapeHint}
	}
	i = next
	alias := ""
	if i < len(stmt) && stmt[i].Kind == TokenKeyword && stmt[i].Text == "as" {
		i++
		if i >= len(stmt) || !isNameToken(stmt[i]) {
			return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "ambiguous_table", Message: "could not find the target table alias", Hint: countShapeHint}
		}
		alias = identBare(stmt[i])
		i++
	} else if i < len(stmt) && isNameToken(stmt[i]) && !isCountStop(stmt[i]) {
		alias = identBare(stmt[i])
		i++
	}

	if hasJoinAfterTable(stmt, i) {
		return nil, &CountShapeError{Code: GuardSQLUnsupported, Reason: "has_join", Message: "FROM or USING after the target table is outside the supported counting shape", Hint: countShapeHint}
	}

	whereSQL := ""
	start, end, hasWhere := ClauseSpanAfterTopLevel(stmt, "where", "returning")
	if hasWhere {
		whereSQL = sql[start:end]
	}
	return &CountTarget{
		Kind:     first,
		Schema:   schema,
		Table:    table,
		Alias:    alias,
		WhereSQL: whereSQL,
		NoWhere:  !hasWhere,
		SQL:      sql[stmt[0].Start:stmt[len(stmt)-1].End],
	}, nil
}

func leadingKeyword(stmt []Token) string {
	for _, t := range stmt {
		if t.Kind == TokenKeyword {
			return t.Text
		}
	}
	return ""
}

func skipKeyword(stmt []Token, i int, kw string) int {
	if i < len(stmt) && stmt[i].Kind == TokenKeyword && stmt[i].Text == kw {
		return i + 1
	}
	return i
}

func isNameToken(t Token) bool {
	return t.Kind == TokenIdentifier || t.Kind == TokenQuotedIdentifier
}

func parseQualifiedName(stmt []Token, i int) (schema, table string, next int, ok bool) {
	if i >= len(stmt) || !isNameToken(stmt[i]) {
		return "", "", i, false
	}
	first := identBare(stmt[i])
	i++
	if i+1 < len(stmt) && stmt[i].Kind == TokenPunct && stmt[i].Text == "." && isNameToken(stmt[i+1]) {
		return first, identBare(stmt[i+1]), i + 2, true
	}
	return "", first, i, true
}

func isCountStop(t Token) bool {
	if t.Kind != TokenKeyword {
		return false
	}
	switch t.Text {
	case "set", "where", "returning", "from", "using":
		return true
	}
	return false
}

func hasJoinAfterTable(stmt []Token, from int) bool {
	for _, t := range stmt[from:] {
		if t.Depth != 0 {
			continue
		}
		if t.Kind == TokenKeyword && (t.Text == "where" || t.Text == "returning") {
			return false
		}
		if t.Kind == TokenKeyword && (t.Text == "from" || t.Text == "using") {
			return true
		}
	}
	return false
}

// QuoteQualified returns schema.table quoted with quote, omitting schema when blank.
func QuoteQualified(quote func(string) string, schema, table string) string {
	if strings.TrimSpace(schema) == "" {
		return quote(table)
	}
	return quote(schema) + "." + quote(table)
}
