// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"sort"
	"strings"

	"zentro/internal/utils"
)

// sqlFormatOptions is utils.SQLFormatPrefs with every default resolved.
type sqlFormatOptions struct {
	keywordCase   string // upper | lower | preserve
	indentUnit    string
	commaLeading  bool
	andOrTrailing bool
}

func normalizeSQLFormatOptions(p utils.SQLFormatPrefs) sqlFormatOptions {
	opt := sqlFormatOptions{keywordCase: "upper"}
	switch strings.ToLower(strings.TrimSpace(p.KeywordCase)) {
	case "lower":
		opt.keywordCase = "lower"
	case "preserve":
		opt.keywordCase = "preserve"
	}
	size := p.IndentSize
	if size <= 0 || size > 8 {
		size = 2
	}
	opt.indentUnit = strings.Repeat(" ", size)
	if p.UseTabs {
		opt.indentUnit = "\t"
	}
	opt.commaLeading = strings.EqualFold(strings.TrimSpace(p.CommaPosition), "leading")
	opt.andOrTrailing = strings.EqualFold(strings.TrimSpace(p.AndOrPosition), "trailing")
	return opt
}

var sqlKeywords = setOf(
	"SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "UNION", "ALL", "INTERSECT", "EXCEPT",
	"INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "MERGE", "USING", "MATCHED",
	"JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "NATURAL", "APPLY", "ON",
	"AS", "AND", "OR", "NOT", "IN", "IS", "NULL", "LIKE", "BETWEEN", "EXISTS", "ANY", "SOME",
	"DISTINCT", "TOP", "PERCENT", "TIES", "WITH", "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC",
	"LIMIT", "OFFSET", "FETCH", "ONLY", "OUTPUT", "OVER", "PARTITION", "TRUE", "FALSE",
	"CREATE", "ALTER", "DROP", "TABLE", "VIEW", "INDEX", "PROCEDURE", "PROC", "FUNCTION", "TRIGGER",
	"DATABASE", "SCHEMA", "TRUNCATE", "ADD", "COLUMN", "CONSTRAINT", "PRIMARY", "FOREIGN", "REFERENCES",
	"UNIQUE", "DEFAULT", "IF", "WHILE", "BEGIN", "TRY", "CATCH", "TRANSACTION", "TRAN", "COMMIT",
	"ROLLBACK", "DECLARE", "EXEC", "EXECUTE", "RETURN", "RETURNS", "PRINT", "GO", "USE", "OPTION",
	"RETURNING", "FOR", "RECURSIVE", "UNBOUNDED", "PRECEDING", "FOLLOWING", "ESCAPE", "COLLATE",
	"THROW", "RAISERROR", "CURSOR", "OPEN", "CLOSE", "DEALLOCATE", "TARGET", "SOURCE",
)

// Functions are upper-cased only when called, so a column that happens to be
// named like one is left alone.
var sqlFunctions = setOf(
	"COUNT", "SUM", "AVG", "MIN", "MAX", "ISNULL", "COALESCE", "NULLIF", "CAST", "CONVERT",
	"TRY_CONVERT", "TRY_CAST", "GETDATE", "SYSDATETIME", "DATEADD", "DATEDIFF", "DATEPART",
	"DATENAME", "ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE", "LAG", "LEAD", "LEN", "LTRIM",
	"RTRIM", "TRIM", "UPPER", "LOWER", "SUBSTRING", "REPLACE", "CONCAT", "STRING_AGG", "IIF",
	"ABS", "ROUND", "FLOOR", "CEILING", "NEWID", "NOW",
)

// Keywords that read better with a space before "(" (IN (..), AS (..)); a
// function name such as COUNT is deliberately absent.
var sqlKeywordsSpaceParen = setOf(
	"IN", "AND", "OR", "ON", "AS", "VALUES", "WHERE", "EXISTS", "SELECT", "FROM", "JOIN", "UNION",
	"ALL", "ANY", "SOME", "NOT", "INTO", "HAVING", "USING", "SET", "WITH", "IF", "WHILE", "WHEN",
	"THEN", "ELSE", "CASE", "BETWEEN", "LIKE", "OVER", "APPLY", "TOP", "BY", "TABLE", "RETURNS",
	"INTERSECT", "EXCEPT", "OPTION", "OUTPUT", "RETURN", "IS", "EXEC", "EXECUTE", "PARTITION", "INSERT",
)

func setOf(words ...string) map[string]bool {
	m := make(map[string]bool, len(words))
	for _, w := range words {
		m[w] = true
	}
	return m
}

var sqlPhrases = func() [][]string {
	phrases := [][]string{
		{"BEGIN", "TRY"}, {"BEGIN", "CATCH"}, {"END", "TRY"}, {"END", "CATCH"},
		{"GROUP", "BY"}, {"ORDER", "BY"}, {"PARTITION", "BY"},
		{"UNION", "ALL"}, {"INSERT", "INTO"}, {"DELETE", "FROM"}, {"MERGE", "INTO"},
		{"LEFT", "OUTER", "JOIN"}, {"RIGHT", "OUTER", "JOIN"}, {"FULL", "OUTER", "JOIN"},
		{"LEFT", "JOIN"}, {"RIGHT", "JOIN"}, {"FULL", "JOIN"}, {"INNER", "JOIN"},
		{"CROSS", "JOIN"}, {"NATURAL", "JOIN"}, {"CROSS", "APPLY"}, {"OUTER", "APPLY"},
		{"WHEN", "NOT", "MATCHED", "BY", "TARGET"}, {"WHEN", "NOT", "MATCHED", "BY", "SOURCE"},
		{"WHEN", "NOT", "MATCHED"}, {"WHEN", "MATCHED"},
	}
	sort.SliceStable(phrases, func(a, b int) bool { return len(phrases[a]) > len(phrases[b]) })
	return phrases
}()

var sqlListStopWords = setOf(
	"FROM", "WHERE", "GROUP", "HAVING", "ORDER", "UNION", "INTERSECT", "EXCEPT", "INTO", "OUTPUT",
	"OPTION", "LIMIT", "OFFSET", "FOR", "RETURNING", "SELECT", "INSERT", "UPDATE", "DELETE",
	"DECLARE", "IF", "WHILE", "GO", "MERGE", "SET", "ON",
)

var sqlStatementStarters = setOf(
	"INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "TRUNCATE", "DECLARE",
	"EXEC", "EXECUTE", "USE", "PRINT", "RETURN", "IF", "WHILE", "THROW", "RAISERROR", "COMMIT",
	"ROLLBACK", "OPEN", "CLOSE", "DEALLOCATE",
)

// A statement keyword that follows one of these belongs to the previous
// clause (ON DELETE CASCADE, FOR UPDATE, CREATE OR ALTER, DROP TABLE IF EXISTS).
var sqlMidStatementPrev = setOf(
	"ON", "FOR", "DO", "OF", "AFTER", "BEFORE", "OR", "WITH", "AS",
	"TABLE", "VIEW", "INDEX", "DATABASE", "SCHEMA", "COLUMN", "PROCEDURE", "PROC", "FUNCTION",
	"TRIGGER", "CONSTRAINT", "EXISTS",
)

type levelKind int

const (
	levelTop levelKind = iota
	levelInline
	levelBlock
	levelBegin
)

type fmtLevel struct {
	kind        levelKind
	base        int // indent of clause keywords at this level
	closeIndent int
	clause      string
	caseStack   []int
	between     int
	inMergeWhen bool
}

type fmtLast struct {
	kind       sqlTokKind
	text       string
	upper      string
	isKeyword  bool
	unary      bool
	spaceParen bool
}

type sqlFormatter struct {
	toks []sqlToken
	opt  sqlFormatOptions

	out         strings.Builder
	atLineStart bool
	indent      int
	lineIndent  int

	stack   []*fmtLevel
	last    *fmtLast
	nameCtx bool
	nameFor string

	pendingNewline bool
	pendingBlank   bool
	listBreakAt    int
}

func formatSQLTokens(toks []sqlToken, opt sqlFormatOptions) string {
	f := &sqlFormatter{
		toks:        toks,
		opt:         opt,
		atLineStart: true,
		stack:       []*fmtLevel{{kind: levelTop}},
		listBreakAt: -1,
	}
	f.run()
	return strings.TrimSpace(f.out.String())
}

func (f *sqlFormatter) cur() *fmtLevel { return f.stack[len(f.stack)-1] }

func (f *sqlFormatter) write(text string) {
	if f.atLineStart {
		if f.indent > 0 {
			f.out.WriteString(strings.Repeat(f.opt.indentUnit, f.indent))
		}
		f.atLineStart = false
		f.lineIndent = f.indent
	}
	f.out.WriteString(text)
}

func (f *sqlFormatter) newline() {
	f.out.WriteString("\n")
	f.atLineStart = true
}

// lineAt starts a new line at the given indent (or re-indents the line that
// was just started).
func (f *sqlFormatter) lineAt(indent int) {
	if !f.atLineStart {
		f.newline()
	}
	f.indent = indent
}

func (f *sqlFormatter) contentIndent() int {
	lvl := f.cur()
	if lvl.clause == "" || lvl.clause == "WITH" {
		return lvl.base
	}
	return lvl.base + 1
}

func (f *sqlFormatter) commaIndent() int {
	lvl := f.cur()
	switch lvl.clause {
	case "", "WITH":
		return lvl.base
	case "WHEN":
		return lvl.base + 2
	}
	return lvl.base + 1
}

func (f *sqlFormatter) caseKW(text string) string {
	switch f.opt.keywordCase {
	case "upper":
		return strings.ToUpper(text)
	case "lower":
		return strings.ToLower(text)
	}
	return text
}

func (f *sqlFormatter) resolvePending() {
	if !f.pendingNewline {
		return
	}
	if !f.atLineStart {
		f.newline()
	}
	if f.pendingBlank {
		f.newline()
	}
	f.pendingNewline = false
	f.pendingBlank = false
	f.indent = f.contentIndent()
}

func (f *sqlFormatter) spaceBefore(text string, kind sqlTokKind) bool {
	l := f.last
	if l == nil {
		return false
	}
	if kind == tokPunct {
		switch text {
		case ")", ",", ";", ".", "]", "[":
			return false
		case "(":
			return l.spaceParen
		}
	}
	if l.kind == tokPunct && (l.text == "(" || l.text == "." || l.text == "[") {
		return false
	}
	if text == "::" || l.text == "::" || l.unary {
		return false
	}
	return true
}

var sqlUnaryOperators = setOf("+", "-", "*", "~")

func (f *sqlFormatter) put(text string, kind sqlTokKind, upper string) {
	if !f.atLineStart && f.spaceBefore(text, kind) {
		f.out.WriteString(" ")
	}
	isKeyword := kind == tokWord && (sqlKeywords[upper] || strings.Contains(upper, " "))
	l := &fmtLast{kind: kind, text: text, upper: upper, isKeyword: isKeyword}

	if kind == tokOperator && sqlUnaryOperators[text] {
		p := f.last
		switch {
		case p == nil:
			l.unary = true
		case p.kind == tokOperator:
			l.unary = true
		case p.kind == tokPunct && (p.text == "(" || p.text == ","):
			l.unary = true
		case p.kind == tokWord && p.isKeyword && p.upper != "NULL" && p.upper != "END" && p.upper != "TRUE" && p.upper != "FALSE":
			l.unary = true
		}
	}
	if kind == tokWord || kind == tokQuotedIdent {
		switch {
		case isKeyword:
			l.spaceParen = sqlKeywordsSpaceParen[upper] || strings.HasSuffix(upper, " JOIN") || strings.HasSuffix(upper, " APPLY")
		default:
			l.spaceParen = f.nameCtx
		}
	}

	f.write(text)
	f.last = l

	switch {
	case kind == tokWord && (upper == "TABLE" || strings.HasSuffix(upper, " INTO") || upper == "INTO"):
		f.nameCtx = true
		f.nameFor = upper
	case kind == tokWord || kind == tokQuotedIdent || (kind == tokPunct && text == "."):
		// keep the qualified-name context alive across dbo.users
	default:
		f.nameCtx = false
	}
}

func (f *sqlFormatter) nextNonComment(i int) *sqlToken {
	for j := i + 1; j < len(f.toks); j++ {
		if f.toks[j].kind != tokLineComment && f.toks[j].kind != tokBlockComment {
			return &f.toks[j]
		}
	}
	return nil
}

func (f *sqlFormatter) matchPhrase(i int) ([]string, bool) {
	inCase := len(f.cur().caseStack) > 0
	for _, phrase := range sqlPhrases {
		if i+len(phrase) > len(f.toks) {
			continue
		}
		if inCase && phrase[0] == "WHEN" {
			continue
		}
		ok := true
		for k, w := range phrase {
			t := f.toks[i+k]
			if t.kind != tokWord || t.upper != w {
				ok = false
				break
			}
		}
		if ok {
			return phrase, true
		}
	}
	return nil, false
}

// listMulti reports whether the list that starts at token `from` has a comma
// at its own nesting depth, i.e. whether it should be broken over lines.
func (f *sqlFormatter) listMulti(from int) bool {
	depth := 0
	for k := from; k < len(f.toks); k++ {
		t := f.toks[k]
		switch {
		case t.kind == tokPunct && t.text == "(":
			depth++
		case t.kind == tokPunct && t.text == ")":
			if depth == 0 {
				return false
			}
			depth--
		case depth == 0 && t.kind == tokPunct && t.text == ";":
			return false
		case depth == 0 && t.kind == tokPunct && t.text == ",":
			return true
		case depth == 0 && t.kind == tokWord && sqlListStopWords[t.upper]:
			return false
		}
	}
	return false
}

// selectModifiersEnd returns the index of the first token after
// DISTINCT/ALL/TOP n [PERCENT] [WITH TIES] that follow SELECT at index i.
func (f *sqlFormatter) selectModifiersEnd(i int) int {
	j := i + 1
	for j < len(f.toks) {
		t := f.toks[j]
		if t.kind != tokWord {
			break
		}
		switch t.upper {
		case "DISTINCT", "ALL", "PERCENT":
			j++
			continue
		case "TOP":
			j++
			if j < len(f.toks) && f.toks[j].kind == tokPunct && f.toks[j].text == "(" {
				depth := 0
				for j < len(f.toks) {
					if f.toks[j].text == "(" && f.toks[j].kind == tokPunct {
						depth++
					}
					if f.toks[j].text == ")" && f.toks[j].kind == tokPunct {
						depth--
						if depth == 0 {
							j++
							break
						}
					}
					j++
				}
			} else if j < len(f.toks) {
				j++
			}
			continue
		case "WITH":
			if j+1 < len(f.toks) && f.toks[j+1].upper == "TIES" {
				j += 2
				continue
			}
		}
		break
	}
	return j
}

func (f *sqlFormatter) isGoSeparator(i int) bool {
	t := f.toks[i]
	if t.kind != tokWord || t.upper != "GO" {
		return false
	}
	if i != 0 && !t.nlBefore {
		return false
	}
	end := i + 1
	if end < len(f.toks) && f.toks[end].kind == tokNumber && f.toks[end].line == t.endLine {
		end++
	}
	return end >= len(f.toks) || f.toks[end].line > f.toks[end-1].endLine
}

func (f *sqlFormatter) resetStatement() {
	// Unbalanced parens must not leak into the next statement.
	for len(f.stack) > 1 {
		k := f.cur().kind
		if k != levelInline && k != levelBlock {
			break
		}
		f.stack = f.stack[:len(f.stack)-1]
	}
	lvl := f.cur()
	lvl.clause = ""
	lvl.caseStack = nil
	lvl.between = 0
	lvl.inMergeWhen = false
	f.nameCtx = false
}

func (f *sqlFormatter) startClause(i int, clause, text string, list bool) {
	lvl := f.cur()
	f.lineAt(lvl.base)
	f.put(text, tokWord, strings.ToUpper(text))
	lvl.clause = clause
	if list {
		from := i + 1
		if clause == "SELECT" {
			from = f.selectModifiersEnd(i)
		}
		if f.listMulti(from) {
			f.listBreakAt = from
		}
	}
}

func (f *sqlFormatter) run() {
	for i := 0; i < len(f.toks); i++ {
		tok := f.toks[i]

		if i == f.listBreakAt {
			f.listBreakAt = -1
			f.lineAt(f.cur().base + 1)
		}

		if tok.kind == tokLineComment || tok.kind == tokBlockComment {
			f.comment(tok)
			continue
		}
		f.resolvePending()

		consumed := f.token(i)
		i += consumed
	}
}

func (f *sqlFormatter) comment(tok sqlToken) {
	own := tok.nlBefore || f.atLineStart
	if own {
		f.resolvePending()
		f.lineAt(f.contentIndent())
		f.write(tok.text)
		f.pendingNewline = true
		return
	}
	f.write(" " + tok.text)
	if tok.kind == tokLineComment {
		f.pendingNewline = true
	}
}

// token formats the token at i and returns how many additional tokens it
// consumed (multi-word phrases such as GROUP BY).
func (f *sqlFormatter) token(i int) int {
	tok := f.toks[i]
	lvl := f.cur()

	switch tok.kind {
	case tokPunct:
		f.punct(i)
		return 0
	case tokWord:
	default:
		f.put(tok.text, tok.kind, "")
		return 0
	}

	if f.isGoSeparator(i) {
		return f.goSeparator(i)
	}

	up := tok.upper
	consumed := 0
	if phrase, ok := f.matchPhrase(i); ok {
		up = strings.Join(phrase, " ")
		consumed = len(phrase) - 1
	}
	text := f.caseKW(up)
	if consumed == 0 {
		if sqlKeywords[up] {
			text = f.caseKW(tok.text)
		} else if next := f.nextNonComment(i); sqlFunctions[up] && next != nil && next.text == "(" {
			text = f.caseKW(tok.text)
		} else {
			text = tok.text
		}
	}

	inline := lvl.kind == levelInline
	prevUp := ""
	if f.last != nil {
		prevUp = f.last.upper
	}

	switch up {
	case "SELECT":
		if !inline {
			f.startClause(i, "SELECT", text, true)
			return consumed
		}
	case "FROM", "WHERE", "HAVING", "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "OUTPUT", "OPTION", "LIMIT", "OFFSET", "RETURNING":
		if !inline && !(up == "FROM" && prevUp == "DISTINCT") && !(up == "OFFSET" && lvl.clause == "") {
			f.startClause(i, up, text, up == "OUTPUT")
			return consumed
		}
	case "GROUP BY", "ORDER BY":
		if !inline {
			f.startClause(i, up, text, true)
			return consumed
		}
	case "INTO":
		if !inline && lvl.clause == "SELECT" {
			f.startClause(i, "INTO", text, false)
			return consumed
		}
	case "VALUES":
		if !inline && (lvl.clause == "INSERT" || lvl.clause == "") {
			f.startClause(i, "VALUES", text, true)
			return consumed
		}
	case "SET":
		if !inline && !lvl.inMergeWhen && lvl.clause != "CREATE" && lvl.clause != "ALTER" && lvl.clause != "DROP" {
			f.startClause(i, "SET", text, true)
			return consumed
		}
	case "WITH":
		next := f.nextNonComment(i)
		if !inline && lvl.clause == "" && next != nil && next.text != "(" {
			if f.last != nil && f.last.text == ";" && !f.pendingNewline {
				f.last = nil
				f.put(text, tokWord, "WITH")
				lvl.clause = "WITH"
			} else {
				f.startClause(i, "WITH", text, false)
			}
			return consumed
		}
	case "USING":
		if !inline && lvl.clause == "MERGE" {
			f.startClause(i, "USING", text, false)
			return consumed
		}
	case "INSERT", "INSERT INTO", "UPDATE", "DELETE", "DELETE FROM", "MERGE", "MERGE INTO",
		"CREATE", "ALTER", "DROP", "TRUNCATE", "DECLARE", "EXEC", "EXECUTE", "USE", "PRINT",
		"RETURN", "IF", "WHILE", "THROW", "RAISERROR", "COMMIT", "ROLLBACK", "OPEN", "CLOSE", "DEALLOCATE":
		if !inline && f.isStatementStart(up, prevUp, lvl) {
			name := strings.Fields(up)[0]
			f.startClause(i, name, text, false)
			return consumed
		}
	case "ELSE":
		if len(lvl.caseStack) > 0 {
			f.lineAt(lvl.caseStack[len(lvl.caseStack)-1] + 1)
			f.put(text, tokWord, up)
			return consumed
		}
		if !inline {
			f.startClause(i, "ELSE", text, false)
			return consumed
		}
	case "JOIN", "INNER JOIN", "LEFT JOIN", "LEFT OUTER JOIN", "RIGHT JOIN", "RIGHT OUTER JOIN",
		"FULL JOIN", "FULL OUTER JOIN", "CROSS JOIN", "NATURAL JOIN", "CROSS APPLY", "OUTER APPLY":
		if !inline {
			f.startClause(i, "JOIN", text, false)
			return consumed
		}
	case "ON":
		if !inline && (lvl.clause == "JOIN" || lvl.clause == "USING") {
			f.put(text, tokWord, up)
			lvl.clause = "ON"
			return consumed
		}
	case "AND", "OR":
		return f.andOr(text, up, consumed)
	case "BETWEEN":
		lvl.between++
	case "CASE":
		f.put(text, tokWord, up)
		lvl.caseStack = append(lvl.caseStack, f.lineIndent)
		return consumed
	case "WHEN", "WHEN MATCHED", "WHEN NOT MATCHED", "WHEN NOT MATCHED BY TARGET", "WHEN NOT MATCHED BY SOURCE":
		if len(lvl.caseStack) > 0 {
			f.lineAt(lvl.caseStack[len(lvl.caseStack)-1] + 1)
			f.put(text, tokWord, up)
			return consumed
		}
		if !inline && up != "WHEN" {
			f.startClause(i, "WHEN", text, false)
			lvl.inMergeWhen = true
			return consumed
		}
	case "THEN":
		f.put(text, tokWord, up)
		if lvl.inMergeWhen && len(lvl.caseStack) == 0 {
			f.pendingNewline = true
			f.indent = lvl.base + 1
			f.lineIndent = lvl.base + 1
		}
		return consumed
	case "END":
		if len(lvl.caseStack) > 0 {
			f.lineAt(lvl.caseStack[len(lvl.caseStack)-1])
			lvl.caseStack = lvl.caseStack[:len(lvl.caseStack)-1]
			f.put(text, tokWord, up)
			return consumed
		}
		if f.endBlock(text, up) {
			return consumed
		}
	case "END TRY", "END CATCH":
		if f.endBlock(text, up) {
			return consumed
		}
	case "BEGIN", "BEGIN TRY", "BEGIN CATCH":
		if !inline && f.beginBlock(i, text, up) {
			return consumed
		}
	}

	f.put(text, tokWord, up)
	return consumed
}

func (f *sqlFormatter) isStatementStart(up, prevUp string, lvl *fmtLevel) bool {
	first := strings.Fields(up)[0]
	if !sqlStatementStarters[first] {
		return false
	}
	if lvl.inMergeWhen {
		return false
	}
	if prevUp != "" && sqlMidStatementPrev[prevUp] {
		return false
	}
	switch first {
	case "DROP":
		return lvl.clause != "ALTER"
	case "EXEC", "EXECUTE":
		return lvl.clause != "INSERT"
	}
	return true
}

func (f *sqlFormatter) andOr(text, up string, consumed int) int {
	lvl := f.cur()
	if up == "AND" && lvl.between > 0 {
		lvl.between--
		f.put(text, tokWord, up)
		return consumed
	}
	breaks := lvl.kind != levelInline && len(lvl.caseStack) == 0 &&
		(lvl.clause == "WHERE" || lvl.clause == "HAVING" || lvl.clause == "ON")
	switch {
	case !breaks:
		f.put(text, tokWord, up)
	case f.opt.andOrTrailing:
		f.put(text, tokWord, up)
		f.lineAt(lvl.base + 1)
	default:
		f.lineAt(lvl.base + 1)
		f.put(text, tokWord, up)
	}
	return consumed
}

func (f *sqlFormatter) beginBlock(i int, text, up string) bool {
	lvl := f.cur()
	if up == "BEGIN" {
		if next := f.nextNonComment(i); next != nil {
			switch next.upper {
			case "TRAN", "TRANSACTION", "DISTRIBUTED", "DIALOG", "CONVERSATION":
				f.startClause(i, "BEGIN", text, false)
				return true
			}
		}
	}
	f.lineAt(lvl.base)
	f.put(text, tokWord, up)
	lvl.clause = ""
	block := &fmtLevel{kind: levelBegin, base: lvl.base + 1, closeIndent: lvl.base}
	f.stack = append(f.stack, block)
	f.pendingNewline = true
	f.indent = block.base
	return true
}

func (f *sqlFormatter) endBlock(text, up string) bool {
	for k := len(f.stack) - 1; k > 0; k-- {
		if f.stack[k].kind != levelBegin {
			continue
		}
		closeIndent := f.stack[k].closeIndent
		f.stack = f.stack[:k]
		f.lineAt(closeIndent)
		f.put(text, tokWord, up)
		f.cur().clause = ""
		f.pendingNewline = true
		return true
	}
	return false
}

func (f *sqlFormatter) goSeparator(i int) int {
	tok := f.toks[i]
	consumed := 0
	f.pendingNewline = false
	f.pendingBlank = false
	if f.out.Len() > 0 {
		if !f.atLineStart {
			f.newline()
		}
		if !strings.HasSuffix(f.out.String(), "\n\n") {
			f.newline()
		}
	}
	f.indent = 0
	f.put(f.caseKW(tok.text), tokWord, "GO")
	if i+1 < len(f.toks) && f.toks[i+1].kind == tokNumber && f.toks[i+1].line == tok.endLine {
		f.put(f.toks[i+1].text, tokNumber, "")
		consumed = 1
	}
	for len(f.stack) > 1 {
		f.stack = f.stack[:len(f.stack)-1]
	}
	f.resetStatement()
	f.last = nil
	f.pendingNewline = true
	f.pendingBlank = true
	return consumed
}

func (f *sqlFormatter) punct(i int) {
	tok := f.toks[i]
	lvl := f.cur()
	switch tok.text {
	case "(":
		f.openParen(i)
	case ")":
		f.closeParen()
	case ",":
		if lvl.kind == levelInline {
			f.put(",", tokPunct, "")
			return
		}
		indent := f.commaIndent()
		if f.opt.commaLeading {
			f.lineAt(indent)
			f.put(",", tokPunct, "")
		} else {
			f.put(",", tokPunct, "")
			f.lineAt(indent)
		}
	case ";":
		f.put(";", tokPunct, "")
		if i+1 >= len(f.toks) {
			return
		}
		next := f.toks[i+1]
		f.resetStatement()
		if next.kind == tokWord && next.upper == "WITH" && i == 0 {
			return // keep the leading ";WITH cte AS" idiom together
		}
		f.pendingNewline = true
		f.pendingBlank = true
	default:
		f.put(tok.text, tokPunct, "")
	}
}

func (f *sqlFormatter) openParen(i int) {
	next := f.nextNonComment(i)
	block := false
	if next != nil && next.kind == tokWord {
		switch next.upper {
		case "SELECT", "WITH", "VALUES":
			block = true
		}
	}
	if !block && f.nameCtx && f.nameFor == "TABLE" {
		block = true
	}
	if !block && f.last != nil && f.last.upper == "TABLE" {
		block = true
	}
	f.put("(", tokPunct, "")
	lineInd := f.lineIndent
	if block {
		f.stack = append(f.stack, &fmtLevel{kind: levelBlock, base: lineInd + 1, closeIndent: lineInd})
		f.lineAt(lineInd + 1)
		return
	}
	f.stack = append(f.stack, &fmtLevel{kind: levelInline})
}

func (f *sqlFormatter) closeParen() {
	idx := -1
	for k := len(f.stack) - 1; k > 0; k-- {
		if f.stack[k].kind == levelInline || f.stack[k].kind == levelBlock {
			idx = k
			break
		}
		if f.stack[k].kind == levelBegin {
			break
		}
	}
	if idx < 0 {
		f.put(")", tokPunct, "")
		return
	}
	lvl := f.stack[idx]
	f.stack = f.stack[:idx]
	if lvl.kind == levelBlock {
		f.lineAt(lvl.closeIndent)
	}
	f.put(")", tokPunct, "")
}
