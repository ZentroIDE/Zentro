// SPDX-License-Identifier: GPL-3.0-only

package db

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// TokenKind classifies a single SQL token.
type TokenKind int

const (
	TokenKeyword TokenKind = iota
	TokenIdentifier
	TokenQuotedIdentifier
	TokenString
	TokenNumber
	TokenOperator
	TokenPunct
	TokenPlaceholder
)

// ErrUnsupportedToken is returned by Tokenize when the script uses a token
// form Zentro deliberately refuses to analyze, e.g. U&"..." unicode-escaped
// identifiers (decision D8).
var ErrUnsupportedToken = errors.New("unsupported SQL token")

// Token is one lexical unit of a SQL script.
//
// Text is lowercased for keywords and unquoted identifiers, and verbatim for
// every other kind. Depth is the parenthesis nesting level at the token.
// Start/End are byte offsets into the original text.
type Token struct {
	Kind  TokenKind
	Text  string
	Depth int
	Line  int
	Col   int
	Start int
	End   int
}

// sqlDialect records which lexical forms a driver recognizes. The zero-value
// fields default to "not recognized", which the tokenizer falls back on
// treating as operators.
type sqlDialect struct {
	doubleQuotedIsString bool // "..." is a string literal (MySQL default)
	backtickIdent        bool // `...`
	bracketIdent         bool // [...]
	dollarQuote          bool // $tag$...$tag$
	backslashEscape      bool // \' inside single/double-quoted strings
	eString              bool // E'...'
	bitHexString         bool // B'...', X'...'
	nString              bool // N'...'
	dollarParam          bool // $1
	questionParam        bool // ?
	questionNumParam     bool // ?1
	colonParam           bool // :name
	atParam              bool // @name
	dollarNameParam      bool // $name
}

// dialectFor resolves a driver name to its lexical dialect. An empty or
// unrecognized name resolves to a superset that understands every supported
// form, which keeps driver-agnostic classification (write-safety) safe.
func dialectFor(driver string) sqlDialect {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case "postgres", "postgresql":
		return sqlDialect{
			doubleQuotedIsString: false,
			dollarQuote:          true,
			eString:              true,
			bitHexString:         true,
			dollarParam:          true,
		}
	case "mysql", "mariadb":
		return sqlDialect{
			doubleQuotedIsString: true,
			backtickIdent:        true,
			backslashEscape:      true,
			nString:              true,
			bitHexString:         true,
			questionParam:        true,
		}
	case "sqlserver", "mssql", "sql server":
		return sqlDialect{
			doubleQuotedIsString: false,
			bracketIdent:         true,
			nString:              true,
			atParam:              true,
		}
	case "sqlite", "sqlite3":
		return sqlDialect{
			backtickIdent:    true,
			bracketIdent:     true,
			bitHexString:     true,
			questionParam:    true,
			questionNumParam: true,
			colonParam:       true,
			atParam:          true,
			dollarNameParam:  true,
		}
	default:
		return sqlDialect{
			backtickIdent:    true,
			bracketIdent:     true,
			dollarQuote:      true,
			backslashEscape:  true,
			eString:          true,
			bitHexString:     true,
			nString:          true,
			dollarParam:      true,
			questionParam:    true,
			questionNumParam: true,
			colonParam:       true,
			atParam:          true,
			dollarNameParam:  true,
		}
	}
}

// Tokenize splits sql into tokens for the given driver. It never panics; an
// unsupported token (U&"..." or U&'...') aborts scanning and returns the
// tokens produced so far alongside ErrUnsupportedToken.
func Tokenize(driver, sql string) ([]Token, error) {
	return tokenizeSQLDialect(dialectFor(driver), sql, false)
}

// tokenizeSQLLenient splits sql for the given driver without ever failing on
// an unsupported token: U&"..." / U&'...' are treated as an ordinary word
// followed by an operator and a quoted string/identifier. It is the fallback
// for write-safety classification, which must stay fail-closed even when the
// strict tokenizer refuses a token form (decision D8 keeps the public Tokenize
// strict; only the internal risk path uses this lenient scan).
func tokenizeSQLLenient(driver, sql string) []Token {
	tokens, _ := tokenizeSQLDialect(dialectFor(driver), sql, true)
	return tokens
}

// tokenizeSQL returns the lowercase keyword and identifier tokens of a script
// under the generic superset dialect. It is the shared keyword source used by
// executor.go's MSSQL batch analysis, which only checks keyword membership.
func tokenizeSQL(query string) []string {
	tokens, _ := tokenizeSQLDialect(dialectFor(""), query, false)
	words := make([]string, 0, len(tokens))
	for _, t := range tokens {
		if t.Kind == TokenKeyword || t.Kind == TokenIdentifier {
			words = append(words, t.Text)
		}
	}
	return words
}

type tokenScanner struct {
	d     sqlDialect
	runes []rune

	// lenient disables the unsupported-token refusal so the scanner can be
	// used as a never-failing fallback for risk classification.
	lenient bool

	i    int
	byte int
	line int
	col  int

	depth int
	err   error

	// start* are captured at the beginning of the current token.
	startRune  int
	startByte  int
	startLine  int
	startCol   int
	startDepth int

	tokens []Token
}

func tokenizeSQLDialect(d sqlDialect, sql string, lenient bool) ([]Token, error) {
	s := &tokenScanner{
		d:       d,
		runes:   []rune(sql),
		line:    1,
		col:     1,
		lenient: lenient,
	}

	for !s.done() && s.err == nil {
		s.startRune = s.i
		s.startByte = s.byte
		s.startLine = s.line
		s.startCol = s.col
		s.startDepth = s.depth

		r := s.current()
		switch {
		case isSpaceRune(r):
			s.advance()
		case r == '-' && s.at(1) == '-':
			s.skipLineComment()
		case r == '/' && s.at(1) == '*':
			s.skipBlockComment()
		case r == '(':
			s.advance()
			s.emit(TokenPunct, "(")
			s.depth++
		case r == ')':
			if s.depth > 0 {
				s.depth--
			}
			s.startDepth = s.depth
			s.advance()
			s.emit(TokenPunct, ")")
		case r == ';':
			s.advance()
			s.emit(TokenPunct, ";")
		case r == ',':
			s.advance()
			s.emit(TokenPunct, ",")
		case r == '.' && isDigitRune(s.at(1)):
			s.scanNumber()
		case r == '.':
			s.advance()
			s.emit(TokenPunct, ".")
		case isDigitRune(r):
			s.scanNumber()
		case r == '\'':
			s.scanQuoted('\'', s.d.backslashEscape)
			s.emitString()
		case r == '"' && s.d.doubleQuotedIsString:
			s.scanQuoted('"', s.d.backslashEscape)
			s.emitString()
		case r == '"':
			s.scanQuotedIdent('"')
			s.emitRaw(TokenQuotedIdentifier)
		case r == '`' && s.d.backtickIdent:
			s.scanQuotedIdent('`')
			s.emitRaw(TokenQuotedIdentifier)
		case r == '[' && s.d.bracketIdent:
			s.scanBracketIdent()
			s.emitRaw(TokenQuotedIdentifier)
		case r == '$':
			s.scanDollar()
		case r == '?' && s.d.questionParam:
			s.scanQuestionParam()
		case r == '@' && s.d.atParam:
			s.scanAtParam()
		case r == ':' && s.d.colonParam:
			s.scanColonParam()
		case isWordStart(r):
			s.scanWord()
		default:
			s.scanOperator()
		}
	}

	return s.tokens, s.err
}

func (s *tokenScanner) done() bool { return s.i >= len(s.runes) }

func (s *tokenScanner) current() rune { return s.runes[s.i] }

func (s *tokenScanner) at(off int) rune {
	j := s.i + off
	if j < 0 || j >= len(s.runes) {
		return 0
	}
	return s.runes[j]
}

func (s *tokenScanner) advance() {
	r := s.runes[s.i]
	s.byte += utf8.RuneLen(r)
	if r == '\n' {
		s.line++
		s.col = 1
	} else {
		s.col++
	}
	s.i++
}

func (s *tokenScanner) advanceN(n int) {
	for k := 0; k < n && !s.done(); k++ {
		s.advance()
	}
}

func (s *tokenScanner) emit(kind TokenKind, text string) {
	s.tokens = append(s.tokens, Token{
		Kind:  kind,
		Text:  text,
		Depth: s.startDepth,
		Line:  s.startLine,
		Col:   s.startCol,
		Start: s.startByte,
		End:   s.byte,
	})
}

// emitString emits the raw text captured since the token start as a string.
func (s *tokenScanner) emitString() {
	s.emit(TokenString, string(s.runes[s.startRune:s.i]))
}

func (s *tokenScanner) emitRaw(kind TokenKind) {
	s.emit(kind, string(s.runes[s.startRune:s.i]))
}

func (s *tokenScanner) skipLineComment() {
	for !s.done() && s.current() != '\n' {
		s.advance()
	}
}

func (s *tokenScanner) skipBlockComment() {
	depth := 1
	s.advance() // '/'
	s.advance() // '*'
	for !s.done() && depth > 0 {
		if s.current() == '/' && s.at(1) == '*' {
			depth++
			s.advance()
			s.advance()
			continue
		}
		if s.current() == '*' && s.at(1) == '/' {
			depth--
			s.advance()
			s.advance()
			continue
		}
		s.advance()
	}
}

// scanQuoted consumes a quote-delimited body. quote is the delimiter and
// backslashEscape controls whether a backslash escapes the following rune
// (MySQL strings and Postgres E'...').
func (s *tokenScanner) scanQuoted(quote rune, backslashEscape bool) {
	s.advance() // opening quote
	for !s.done() {
		r := s.current()
		if backslashEscape && r == '\\' {
			s.advance()
			if !s.done() {
				s.advance()
			}
			continue
		}
		if r == quote {
			if s.at(1) == quote { // doubled quote
				s.advance()
				s.advance()
				continue
			}
			s.advance() // closing quote
			return
		}
		s.advance()
	}
}

// scanQuotedIdent consumes a "..." or `...` quoted identifier, preserving the
// doubled-quote escape.
func (s *tokenScanner) scanQuotedIdent(quote rune) {
	s.advance() // opening quote
	for !s.done() {
		if s.current() == quote {
			if s.at(1) == quote {
				s.advance()
				s.advance()
				continue
			}
			s.advance()
			return
		}
		s.advance()
	}
}

// scanBracketIdent consumes a [...] quoted identifier, honoring ]] as an
// escaped closing bracket.
func (s *tokenScanner) scanBracketIdent() {
	s.advance() // '['
	for !s.done() {
		if s.current() == ']' {
			if s.at(1) == ']' {
				s.advance()
				s.advance()
				continue
			}
			s.advance()
			return
		}
		s.advance()
	}
}

func (s *tokenScanner) scanDollar() {
	if s.d.dollarQuote {
		if end := dollarQuoteEnd(s.runes, s.i); end > s.i {
			s.advanceN(end - s.i)
			s.emitString()
			return
		}
	}
	if s.d.dollarParam && isDigitRune(s.at(1)) {
		s.advance() // '$'
		for !s.done() && isDigitRune(s.current()) {
			s.advance()
		}
		s.emitRaw(TokenPlaceholder)
		return
	}
	if s.d.dollarNameParam && isWordStart(s.at(1)) {
		s.advance() // '$'
		for !s.done() && isWordRune(s.current()) {
			s.advance()
		}
		s.emitRaw(TokenPlaceholder)
		return
	}
	s.scanOperator()
}

func (s *tokenScanner) scanQuestionParam() {
	s.advance() // '?'
	if s.d.questionNumParam {
		for !s.done() && isDigitRune(s.current()) {
			s.advance()
		}
	}
	s.emitRaw(TokenPlaceholder)
}

func (s *tokenScanner) scanAtParam() {
	s.advance() // '@'
	for !s.done() && isWordRune(s.current()) {
		s.advance()
	}
	s.emitRaw(TokenPlaceholder)
}

func (s *tokenScanner) scanColonParam() {
	s.advance() // ':'
	for !s.done() && isWordRune(s.current()) {
		s.advance()
	}
	s.emitRaw(TokenPlaceholder)
}

func (s *tokenScanner) scanNumber() {
	if s.current() == '0' && (s.at(1) == 'x' || s.at(1) == 'X') && isHexDigitRune(s.at(2)) {
		s.advance() // 0
		s.advance() // x
		for !s.done() && isHexDigitRune(s.current()) {
			s.advance()
		}
		s.emitRaw(TokenNumber)
		return
	}

	if s.current() == '.' {
		s.advance()
	}
	for !s.done() && isDigitRune(s.current()) {
		s.advance()
	}
	if !s.done() && s.current() == '.' && isDigitRune(s.at(1)) {
		s.advance() // '.'
		for !s.done() && isDigitRune(s.current()) {
			s.advance()
		}
	}
	if !s.done() && (s.current() == 'e' || s.current() == 'E') {
		next := s.at(1)
		if isDigitRune(next) || ((next == '+' || next == '-') && isDigitRune(s.at(2))) {
			s.advance() // e/E
			if s.current() == '+' || s.current() == '-' {
				s.advance()
			}
			for !s.done() && isDigitRune(s.current()) {
				s.advance()
			}
		}
	}

	s.emitRaw(TokenNumber)
}

func (s *tokenScanner) scanWord() {
	var b strings.Builder
	for !s.done() && isWordRune(s.current()) {
		b.WriteRune(s.current())
		s.advance()
	}
	lower := strings.ToLower(b.String())

	// U&"..." and U&'...' are refused (decision D8). In lenient mode they are
	// left as an ordinary word so the fallback scan keeps going.
	if lower == "u" && s.at(0) == '&' && !s.lenient {
		next := s.at(1)
		if next == '"' || next == '\'' {
			s.err = ErrUnsupportedToken
			return
		}
	}

	// Prefixed string literal: E'...', B'...', X'...', N'...'.
	if s.supportsPrefix(lower) && s.at(0) == '\'' {
		backslash := lower == "e" || s.d.backslashEscape
		s.scanQuoted('\'', backslash)
		s.emitString()
		return
	}

	kind := TokenIdentifier
	if sqlKeywords[lower] {
		kind = TokenKeyword
	}
	s.emit(kind, lower)
}

func (s *tokenScanner) supportsPrefix(lower string) bool {
	switch lower {
	case "e":
		return s.d.eString
	case "b", "x":
		return s.d.bitHexString
	case "n":
		return s.d.nString
	}
	return false
}

func (s *tokenScanner) scanOperator() {
	if !isOperatorRune(s.current()) {
		// Unknown rune (e.g. a backtick in a dialect without backtick
		// identifiers): consume it as a single operator token to guarantee
		// forward progress.
		s.advance()
		s.emitRaw(TokenOperator)
		return
	}
	for !s.done() && isOperatorRune(s.current()) {
		s.advance()
	}
	s.emitRaw(TokenOperator)
}

func isSpaceRune(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f'
}

func isDigitRune(r rune) bool { return r >= '0' && r <= '9' }

func isHexDigitRune(r rune) bool {
	return isDigitRune(r) || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')
}

func isWordStart(r rune) bool {
	return r == '_' || unicode.IsLetter(r)
}

func isWordRune(r rune) bool {
	return r == '_' || r == '$' || unicode.IsLetter(r) || unicode.IsDigit(r)
}

func isOperatorRune(r rune) bool {
	switch r {
	case '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '^', '&', '|',
		'?', '@', ':', '#', '\\', '[', ']':
		return true
	}
	return false
}

// isDMLKeyword reports whether kw is a statement keyword that can follow a
// WITH CTE list.
func isDMLKeyword(kw string) bool {
	switch kw {
	case "select", "insert", "update", "delete", "merge":
		return true
	}
	return false
}

// SplitTokens splits a token stream into statements on top-level semicolons.
// Empty statements (e.g. from leading/trailing semicolons) are dropped.
func SplitTokens(tokens []Token) [][]Token {
	var statements [][]Token
	var current []Token
	flush := func() {
		if len(current) > 0 {
			statements = append(statements, current)
			current = nil
		}
	}
	for _, t := range tokens {
		if t.Kind == TokenPunct && t.Text == ";" && t.Depth == 0 {
			flush()
			continue
		}
		current = append(current, t)
	}
	flush()
	return statements
}

// FirstKeyword returns the leading keyword of a statement. For statements that
// start with WITH, the CTE list is skipped and the DML keyword at depth 0 that
// follows it is returned instead.
func FirstKeyword(stmt []Token) string {
	first := ""
	for _, t := range stmt {
		if t.Kind == TokenKeyword {
			first = t.Text
			break
		}
	}
	if first != "with" {
		return first
	}
	for _, t := range stmt {
		if t.Kind == TokenKeyword && t.Depth == 0 && isDMLKeyword(t.Text) {
			return t.Text
		}
	}
	return "with"
}

// StatementKind maps the leading keyword of a statement to a WriteOperation.
// A statement that starts with WITH is classified by the most dangerous write
// keyword found either in its CTE list (at any depth) or as the depth-0
// statement that follows the CTE list, so a write hidden inside a CTE is never
// downgraded to read.
func StatementKind(stmt []Token) WriteOperation {
	first := ""
	for _, t := range stmt {
		if t.Kind == TokenKeyword {
			first = t.Text
			break
		}
	}
	if first != "with" {
		return statementKindFromKeyword(first)
	}
	return withStatementKind(stmt)
}

// statementKindFromKeyword maps a leading statement keyword to a
// WriteOperation. Non-statement keywords return WriteOperationUnknown.
func statementKindFromKeyword(kw string) WriteOperation {
	switch kw {
	case "update":
		return WriteOperationUpdate
	case "delete":
		return WriteOperationDelete
	case "alter":
		return WriteOperationAlter
	case "drop":
		return WriteOperationDrop
	case "truncate":
		return WriteOperationTruncate
	case "merge":
		return WriteOperationMerge
	case "replace":
		return WriteOperationReplace
	case "insert":
		return WriteOperationInsert
	case "create":
		return WriteOperationCreate
	case "select", "show", "explain", "describe", "desc":
		return WriteOperationRead
	default:
		return WriteOperationUnknown
	}
}

// withStatementKind classifies a statement that starts with WITH. The main
// statement is the first depth-0 statement keyword after the CTE list; the CTE
// list itself is scanned for data-modifying DML at any depth. The most
// dangerous operation wins, matching the legacy conservative priority.
func withStatementKind(stmt []Token) WriteOperation {
	mainIdx := -1
	best := WriteOperationUnknown
	for i, t := range stmt {
		if t.Kind != TokenKeyword || t.Depth != 0 {
			continue
		}
		if op := statementKindFromKeyword(t.Text); op != WriteOperationUnknown {
			mainIdx = i
			best = op
			break
		}
	}

	end := len(stmt)
	if mainIdx >= 0 {
		end = mainIdx
	}
	for _, t := range stmt[:end] {
		if t.Kind != TokenKeyword {
			continue
		}
		switch t.Text {
		case "insert", "update", "delete", "merge":
			if op := statementKindFromKeyword(t.Text); moreDangerous(op, best) {
				best = op
			}
		}
	}
	return best
}

// writeDangerRank orders write operations by danger (lower is more dangerous),
// matching the legacy conservative priority used before the shared tokenizer.
func writeDangerRank(op WriteOperation) int {
	switch op {
	case WriteOperationUpdate:
		return 0
	case WriteOperationDelete:
		return 1
	case WriteOperationAlter:
		return 2
	case WriteOperationDrop:
		return 3
	case WriteOperationTruncate:
		return 4
	case WriteOperationMerge:
		return 5
	case WriteOperationReplace:
		return 6
	case WriteOperationInsert:
		return 7
	case WriteOperationCreate:
		return 8
	default:
		return 9
	}
}

// moreDangerous reports whether a is more dangerous than b under
// writeDangerRank.
func moreDangerous(a, b WriteOperation) bool {
	return writeDangerRank(a) < writeDangerRank(b)
}

// HasTopLevelKeyword reports whether kw appears as a keyword at parenthesis
// depth 0.
func HasTopLevelKeyword(stmt []Token, kw string) bool {
	for _, t := range stmt {
		if t.Kind == TokenKeyword && t.Depth == 0 && t.Text == kw {
			return true
		}
	}
	return false
}

// ClauseAfterTopLevel returns the concatenated text of the tokens that follow
// the first top-level keyword kw, stopping at the first top-level keyword in
// stop. ok is false when kw is absent.
func ClauseAfterTopLevel(stmt []Token, kw string, stop ...string) (string, bool) {
	stopSet := make(map[string]struct{}, len(stop))
	for _, s := range stop {
		stopSet[s] = struct{}{}
	}
	idx := -1
	for i, t := range stmt {
		if t.Kind == TokenKeyword && t.Depth == 0 && t.Text == kw {
			idx = i
			break
		}
	}
	if idx < 0 {
		return "", false
	}
	var parts []string
	for _, t := range stmt[idx+1:] {
		if t.Kind == TokenKeyword && t.Depth == 0 {
			if _, ok := stopSet[t.Text]; ok {
				break
			}
		}
		parts = append(parts, t.Text)
	}
	return strings.Join(parts, " "), true
}

// ClauseSpanAfterTopLevel returns the byte span [start, end) of the clause
// introduced by the first top-level keyword kw, including kw itself, stopping
// before the first top-level keyword in stop. Callers use the span to slice the
// original SQL verbatim, preserving original spacing and casing. ok is false
// when kw is absent.
func ClauseSpanAfterTopLevel(stmt []Token, kw string, stop ...string) (start, end int, ok bool) {
	stopSet := make(map[string]struct{}, len(stop))
	for _, s := range stop {
		stopSet[s] = struct{}{}
	}
	idx := -1
	for i, t := range stmt {
		if t.Kind == TokenKeyword && t.Depth == 0 && t.Text == kw {
			idx = i
			break
		}
	}
	if idx < 0 {
		return 0, 0, false
	}
	last := idx
	for i := idx + 1; i < len(stmt); i++ {
		t := stmt[i]
		if t.Kind == TokenKeyword && t.Depth == 0 {
			if _, isStop := stopSet[t.Text]; isStop {
				break
			}
		}
		last = i
	}
	return stmt[idx].Start, stmt[last].End, true
}

// CallNames returns the identifiers that appear immediately before an opening
// parenthesis, i.e. function-call names. Quoted identifiers are unquoted and
// schema prefixes are naturally dropped (the token before '(' is the function
// name).
func CallNames(stmt []Token) []string {
	var names []string
	for i, t := range stmt {
		if t.Kind != TokenPunct || t.Text != "(" || i == 0 {
			continue
		}
		if name, ok := callName(stmt[i-1]); ok {
			names = append(names, name)
		}
	}
	return names
}

func callName(t Token) (string, bool) {
	switch t.Kind {
	case TokenIdentifier:
		return t.Text, true
	case TokenQuotedIdentifier:
		return unquoteIdent(t.Text), true
	default:
		return "", false
	}
}

func unquoteIdent(s string) string {
	if len(s) < 2 {
		return s
	}
	switch s[0] {
	case '"':
		return strings.ReplaceAll(s[1:len(s)-1], `""`, `"`)
	case '`':
		return strings.ReplaceAll(s[1:len(s)-1], "``", "`")
	case '[':
		return strings.ReplaceAll(s[1:len(s)-1], "]]", "]")
	}
	return s
}

var sqlKeywords = map[string]bool{
	"select": true, "from": true, "where": true, "group": true, "by": true,
	"having": true, "order": true, "limit": true, "offset": true,
	"insert": true, "into": true, "values": true, "update": true, "set": true,
	"delete": true, "merge": true, "replace": true, "alter": true, "drop": true,
	"truncate": true, "create": true, "show": true, "explain": true,
	"describe": true, "desc": true, "with": true, "recursive": true, "as": true,
	"join": true, "inner": true, "left": true, "right": true, "full": true,
	"outer": true, "cross": true, "natural": true, "on": true, "using": true,
	"union": true, "all": true, "distinct": true, "intersect": true, "except": true,
	"and": true, "or": true, "not": true, "in": true, "between": true,
	"like": true, "ilike": true, "is": true, "null": true, "exists": true,
	"case": true, "when": true, "then": true, "else": true, "end": true,
	"asc": true, "returning": true, "for": true, "share": true, "nowait": true,
	"skip": true, "locked": true, "key": true, "of": true, "top": true,
	"fetch": true, "first": true, "next": true, "rows": true, "only": true,
	"grant": true, "revoke": true, "begin": true, "commit": true, "rollback": true,
	"declare": true, "if": true, "while": true, "try": true, "catch": true,
	"cursor": true, "goto": true, "window": true, "partition": true, "over": true,
	"lateral": true, "table": true, "default": true, "primary": true,
	"foreign": true, "references": true, "constraint": true, "unique": true,
	"check": true, "index": true, "view": true, "sequence": true, "schema": true,
	"database": true, "add": true, "column": true, "modify": true, "change": true,
	"rename": true, "to": true, "call": true, "do": true, "execute": true,
	"copy": true, "vacuum": true, "analyze": true,
}
