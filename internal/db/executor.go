// SPDX-License-Identifier: GPL-3.0-only

// Package db — Query executor engine.
package db

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"zentro/internal/core"
)

// limitPattern matches queries that already contain a LIMIT, TOP, or OFFSET clause.
// Covers: LIMIT, OFFSET, TOP, FETCH (MSSQL), and MySQL legacy LIMIT x,y syntax
var limitPattern = regexp.MustCompile(`(?i)\bLIMIT\b|\bOFFSET\b|\bTOP\b|\bFETCH\b`)
var withMutatingPattern = regexp.MustCompile(`(?i)\b(INSERT|UPDATE|DELETE|MERGE)\b`)
var leadingCommentPattern = regexp.MustCompile(`(?is)\A(?:\s+|--[^\n]*\n|/\*.*?\*/)*`)
var firstKeywordPattern = regexp.MustCompile(`(?i)^[a-z]+`)

// fromPattern matches "FROM [schema.]table" to extract for in-line editing.
var fromPattern = regexp.MustCompile(`(?i)\bFROM\s+([a-zA-Z0-9_"\[\]]+)(?:\.([a-zA-Z0-9_"\[\]]+))?`)

// IsSelectQuery returns true for read-only query types (SELECT, WITH, SHOW, EXPLAIN).
// Leading comments (-- line or /* block */) are skipped before the check.
func IsSelectQuery(query string) bool {
	upper := strings.ToUpper(stripLeadingComments(query))
	for _, prefix := range []string{"SELECT", "WITH", "SHOW", "EXPLAIN"} {
		if strings.HasPrefix(upper, prefix) {
			return true
		}
	}
	return false
}

// IsReadOnlyStatement returns true when the SQL statement is read-only.
// This is stricter than IsSelectQuery and is used for "view mode" write-blocking.
func IsReadOnlyStatement(query string) bool {
	trimmed := stripLeadingComments(query)
	if trimmed == "" {
		return false
	}

	keyword := strings.ToUpper(firstKeyword(trimmed))
	switch keyword {
	case "SELECT", "SHOW", "EXPLAIN", "DESCRIBE", "DESC":
		return true
	case "WITH":
		// CTEs can still mutate (e.g. WITH ... INSERT/UPDATE/DELETE ... RETURNING ...)
		return !withMutatingPattern.MatchString(trimmed)
	default:
		return false
	}
}

// BatchHasMutatingStatements returns true when any statement in the batch is not read-only.
func BatchHasMutatingStatements(statements []string) bool {
	for _, statement := range statements {
		if !IsReadOnlyStatement(statement) {
			return true
		}
	}
	return false
}

// ExtractTableFromQuery tries to parse a simple SELECT query to find the target schema and table.
func ExtractTableFromQuery(query string) (schema, table string) {
	matches := fromPattern.FindStringSubmatch(query)
	if len(matches) < 2 {
		return "", ""
	}

	// If only one match, it's the table name.
	// If two matches (like schema.table), matches[1] is schema, matches[2] is table.
	if len(matches) == 3 && matches[2] != "" {
		schema = strings.Trim(matches[1], `"[]`)
		table = strings.Trim(matches[2], `"[]`)
	} else {
		table = strings.Trim(matches[1], `"[]`)
	}
	return schema, table
}

// InjectPageClause delegates pagination generation to the registered driver.
func InjectPageClause(driverName, query string, limit, offset int) string {
	d, ok := core.Get(driverName)
	if !ok {
		return fallbackInjectPage(query, limit, offset)
	}
	if dialect, ok := d.(interface {
		InjectPageClause(query string, limit, offset int) string
	}); ok {
		return dialect.InjectPageClause(query, limit, offset)
	}
	return fallbackInjectPage(query, limit, offset)
}

// HasPaginationClause returns true when the query already declares its own
// pagination window, such as LIMIT/OFFSET/TOP/FETCH.
func HasPaginationClause(query string) bool {
	if !limitPattern.MatchString(query) {
		return false
	}

	lower := strings.ToLower(query)
	depth := 0
	inSingle := false
	inDouble := false

	for index := 0; index < len(lower); index++ {
		ch := lower[index]
		var next byte
		if index+1 < len(lower) {
			next = lower[index+1]
		}

		if !inDouble && ch == '\'' {
			if inSingle && next == '\'' {
				index++
			} else {
				inSingle = !inSingle
			}
			continue
		}

		if !inSingle && ch == '"' {
			if inDouble && next == '"' {
				index++
			} else {
				inDouble = !inDouble
			}
			continue
		}

		if inSingle || inDouble {
			continue
		}

		switch ch {
		case '(':
			depth++
			continue
		case ')':
			if depth > 0 {
				depth--
			}
			continue
		}

		if depth != 0 {
			continue
		}

		for _, clause := range []string{"limit", "offset", "fetch", "top"} {
			if !strings.HasPrefix(lower[index:], clause) {
				continue
			}
			if hasClauseWordBoundary(lower, index, len(clause)) {
				return true
			}
		}
	}

	return false
}

func hasClauseWordBoundary(sql string, start, clauseLen int) bool {
	before := byte(0)
	if start > 0 {
		before = sql[start-1]
	}
	after := byte(0)
	if start+clauseLen < len(sql) {
		after = sql[start+clauseLen]
	}
	return !isIdentifierChar(before) && !isIdentifierChar(after)
}

func isIdentifierChar(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '$'
}

func fallbackInjectPage(query string, limit, offset int) string {
	if HasPaginationClause(query) {
		return query
	}
	trimmed := strings.TrimSpace(query)
	var b strings.Builder
	b.Grow(len(trimmed) + 32)
	b.WriteString(trimmed)
	b.WriteString(" LIMIT ")
	b.WriteString(strconv.Itoa(limit))
	if offset > 0 {
		b.WriteString(" OFFSET ")
		b.WriteString(strconv.Itoa(offset))
	}
	return b.String()
}

// dollarQuoteEnd reports where a Postgres dollar-quoted string ($$...$$ or
// $tag$...$tag$) starting at runes[start] ends (exclusive), or start if
// runes[start] doesn't open one. An unterminated opener swallows the rest of
// the script, matching how the server reads it. A "$" that continues an
// identifier (a$b$) or is a parameter ($1) never opens a quote.
func dollarQuoteEnd(runes []rune, start int) int {
	if start > 0 {
		prev := runes[start-1]
		if prev == '_' || prev == '$' || unicode.IsLetter(prev) || unicode.IsDigit(prev) {
			return start
		}
	}

	tagEnd := start + 1
	for tagEnd < len(runes) {
		r := runes[tagEnd]
		if r == '$' {
			break
		}
		isTagRune := r == '_' || unicode.IsLetter(r) || (tagEnd > start+1 && unicode.IsDigit(r))
		if !isTagRune {
			return start
		}
		tagEnd++
	}
	if tagEnd >= len(runes) {
		return start
	}

	tag := runes[start : tagEnd+1]
	for i := tagEnd + 1; i+len(tag) <= len(runes); i++ {
		if runes[i] == '$' && string(runes[i:i+len(tag)]) == string(tag) {
			return i + len(tag)
		}
	}
	return len(runes)
}

// SplitStatements separates SQL statements on semicolons outside of
// strings, comments, and Postgres dollar-quoted bodies.
func SplitStatements(query string) []string {
	var statements []string
	var current strings.Builder

	inSingle := false
	inDouble := false
	inBacktick := false
	inLineComment := false
	inBlockComment := false

	runes := []rune(query)
	for i := 0; i < len(runes); i++ {
		ch := runes[i]
		next := rune(0)
		if i+1 < len(runes) {
			next = runes[i+1]
		}

		if inLineComment {
			current.WriteRune(ch)
			if ch == '\n' {
				inLineComment = false
			}
			continue
		}

		if inBlockComment {
			current.WriteRune(ch)
			if ch == '*' && next == '/' {
				current.WriteRune(next)
				i++
				inBlockComment = false
			}
			continue
		}

		if !inSingle && !inDouble && !inBacktick {
			if ch == '-' && next == '-' {
				current.WriteRune(ch)
				current.WriteRune(next)
				i++
				inLineComment = true
				continue
			}
			if ch == '/' && next == '*' {
				current.WriteRune(ch)
				current.WriteRune(next)
				i++
				inBlockComment = true
				continue
			}
		}

		if ch == '$' && !inSingle && !inDouble && !inBacktick {
			if end := dollarQuoteEnd(runes, i); end > i {
				for _, r := range runes[i:end] {
					current.WriteRune(r)
				}
				i = end - 1
				continue
			}
		}

		switch ch {
		case '\'':
			current.WriteRune(ch)
			if !inDouble && !inBacktick {
				if inSingle && next == '\'' {
					current.WriteRune(next)
					i++
				} else {
					inSingle = !inSingle
				}
			}
		case '"':
			current.WriteRune(ch)
			if !inSingle && !inBacktick {
				if inDouble && next == '"' {
					current.WriteRune(next)
					i++
				} else {
					inDouble = !inDouble
				}
			}
		case '`':
			current.WriteRune(ch)
			if !inSingle && !inDouble {
				inBacktick = !inBacktick
			}
		case ';':
			if inSingle || inDouble || inBacktick {
				current.WriteRune(ch)
				continue
			}
			statement := strings.TrimSpace(current.String())
			if statement != "" {
				statements = append(statements, statement)
			}
			current.Reset()
		default:
			current.WriteRune(ch)
		}
	}

	statement := strings.TrimSpace(current.String())
	if statement != "" {
		statements = append(statements, statement)
	}

	return statements
}

func stripLeadingComments(query string) string {
	trimmed := leadingCommentPattern.ReplaceAllString(query, "")
	return strings.TrimSpace(trimmed)
}

func firstKeyword(query string) string {
	match := firstKeywordPattern.FindString(query)
	return strings.TrimSpace(match)
}

// mssqlDriverName is the registered core.Get key for the SQL Server driver
// (internal/driver/mssql.MSSQLDriver.Name()).
const mssqlDriverName = "sqlserver"

// goSeparatorPattern matches a standalone "GO" batch separator line, the only
// real batch boundary in T-SQL. An optional repeat count ("GO 5") is a
// sqlcmd/SSMS scripting convention that replays the preceding batch N times;
// Zentro runs it once, same as a plain "GO".
var goSeparatorPattern = regexp.MustCompile(`(?i)^GO\s*(\d+)?\s*$`)

// mssqlSingleBatchKeywords are T-SQL keywords whose state (a declared
// variable's value, a BEGIN/END block's nesting) exists only within the
// single batch it was written in. A batch containing any of them must be
// sent to the server as one combined statement — splitting it further on
// semicolons would run each part as its own separate batch and lose that
// state, which is exactly the bug this map exists to prevent (see
// SplitStatementsForDriver).
var mssqlSingleBatchKeywords = map[string]struct{}{
	"declare": {}, "begin": {}, "if": {}, "while": {}, "try": {}, "catch": {}, "cursor": {}, "goto": {},
}

// SplitMSSQLBatches splits a T-SQL script into batches on standalone GO
// separator lines, the way sqlcmd/SSMS/DBeaver do. Semicolons are never a
// boundary here — see SplitStatementsForDriver for why.
func SplitMSSQLBatches(query string) []string {
	var batches []string
	var current strings.Builder
	var line strings.Builder

	inSingle := false
	inBlockComment := false
	inLineComment := false

	flushLine := func() {
		trimmed := strings.TrimSpace(line.String())
		if !inSingle && !inBlockComment && goSeparatorPattern.MatchString(trimmed) {
			if batch := strings.TrimSpace(current.String()); batch != "" {
				batches = append(batches, batch)
			}
			current.Reset()
		} else {
			current.WriteString(line.String())
			current.WriteByte('\n')
		}
		line.Reset()
		inLineComment = false
	}

	runes := []rune(query)
	for i := 0; i < len(runes); i++ {
		ch := runes[i]
		next := rune(0)
		if i+1 < len(runes) {
			next = runes[i+1]
		}

		if ch == '\n' {
			flushLine()
			continue
		}

		if inLineComment {
			line.WriteRune(ch)
			continue
		}

		if inBlockComment {
			line.WriteRune(ch)
			if ch == '*' && next == '/' {
				line.WriteRune(next)
				i++
				inBlockComment = false
			}
			continue
		}

		if !inSingle {
			if ch == '-' && next == '-' {
				line.WriteRune(ch)
				line.WriteRune(next)
				i++
				inLineComment = true
				continue
			}
			if ch == '/' && next == '*' {
				line.WriteRune(ch)
				line.WriteRune(next)
				i++
				inBlockComment = true
				continue
			}
		}

		if ch == '\'' {
			line.WriteRune(ch)
			if inSingle && next == '\'' {
				line.WriteRune(next)
				i++
			} else {
				inSingle = !inSingle
			}
			continue
		}

		line.WriteRune(ch)
	}
	flushLine()

	if batch := strings.TrimSpace(current.String()); batch != "" {
		batches = append(batches, batch)
	}

	return batches
}

// mssqlBatchNeedsSingleExec reports whether a GO-delimited T-SQL section
// declares variables or uses control-flow blocks, and therefore must be sent
// to the server as one combined statement rather than split further on
// semicolons.
func mssqlBatchNeedsSingleExec(section string) bool {
	for _, token := range tokenizeSQL(section) {
		if _, ok := mssqlSingleBatchKeywords[token]; ok {
			return true
		}
	}
	return false
}

// SplitStatementsForDriver splits a script into the units the executor sends
// to the server, one round trip per unit. Every dialect but MSSQL keeps the
// plain semicolon-based SplitStatements behavior.
//
// MSSQL first splits on GO batch separators — the only real T-SQL batch
// boundary — via SplitMSSQLBatches. A GO-section that declares variables or
// uses control flow (mssqlBatchNeedsSingleExec) is kept as one combined
// statement: T-SQL scopes DECLARE and BEGIN/END state to a single batch, so
// splitting it further on semicolons would send each part as its own batch
// and the state would not carry over (e.g. "DECLARE @x = 1; SELECT @x" split
// into two round trips fails with "Must declare the scalar variable '@x'",
// even though the same text run as one batch — as SSMS/DBeaver run it —
// works fine). A GO-section with no such dependency still splits on
// semicolons, so independent statements (e.g. several SELECTs) keep getting
// separate progress events and result grids.
//
// A combined statement executes via the non-SELECT path (see
// query_batch.go's runBatchStatement) regardless of what it starts with,
// since pagination injection and result streaming assume a single top-level
// SELECT: any SELECT embedded inside a combined statement runs correctly but
// its rows are not surfaced to the results grid.
func SplitStatementsForDriver(driverName, query string) []string {
	if !strings.EqualFold(strings.TrimSpace(driverName), mssqlDriverName) {
		return SplitStatements(query)
	}

	var statements []string
	for _, section := range SplitMSSQLBatches(query) {
		if mssqlBatchNeedsSingleExec(section) {
			statements = append(statements, section)
			continue
		}
		statements = append(statements, SplitStatements(section)...)
	}
	return statements
}
