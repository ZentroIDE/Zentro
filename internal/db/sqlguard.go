// SPDX-License-Identifier: GPL-3.0-only

package db

import "strings"

const (
	GuardSQLNotAllowed  = "SQL_NOT_ALLOWED"
	GuardSQLUnsupported = "SQL_UNSUPPORTED"
)

// GuardReject is why GuardReadOnly refused a statement. Code is one of the
// GuardSQL* constants so a caller can map it onto an envelope without
// interpreting Message.
type GuardReject struct {
	Code    string
	Reason  string
	Message string
}

var guardWriteKeywords = map[string]struct{}{
	"insert": {}, "update": {}, "delete": {}, "merge": {}, "copy": {},
	"call": {}, "do": {}, "execute": {}, "into": {}, "truncate": {},
	"create": {}, "alter": {}, "drop": {}, "grant": {}, "revoke": {},
}

var guardForLock = map[string]struct{}{
	"update": {}, "share": {}, "no": {}, "key": {},
}

// GuardReadOnly is the token filter in front of run_readonly_query (spec
// section 3). It refuses writes and known-dangerous calls. A pass is not a
// proof the statement is read-only: the database's READ ONLY transaction is.
func GuardReadOnly(driver, sql string) *GuardReject {
	tokens, err := Tokenize(driver, sql)
	if err != nil {
		return &GuardReject{Code: GuardSQLUnsupported, Reason: "unsupported_token", Message: "this SQL uses a token form Zentro does not analyze"}
	}
	stmts := SplitTokens(tokens)
	if len(stmts) != 1 {
		return &GuardReject{Code: GuardSQLUnsupported, Reason: "multiple_statements", Message: "run_readonly_query accepts exactly one statement"}
	}
	stmt := stmts[0]
	first := FirstKeyword(stmt)
	switch first {
	case "select", "with", "values":
	default:
		return &GuardReject{Code: GuardSQLNotAllowed, Reason: "not_select", Message: "only a SELECT, WITH, or VALUES statement may run as a read"}
	}
	for i, tok := range stmt {
		if tok.Kind == TokenKeyword {
			if _, ok := guardWriteKeywords[tok.Text]; ok {
				return &GuardReject{Code: GuardSQLNotAllowed, Reason: "write_keyword", Message: "this statement is not read-only"}
			}
			if tok.Text == "for" && i+1 < len(stmt) && stmt[i+1].Kind == TokenKeyword {
				if _, ok := guardForLock[stmt[i+1].Text]; ok {
					return &GuardReject{Code: GuardSQLNotAllowed, Reason: "row_lock", Message: "row locks are not allowed on a read"}
				}
			}
		}
		if tok.Kind == TokenIdentifier || tok.Kind == TokenQuotedIdentifier {
			if denyListedIdent(identBare(tok)) {
				return &GuardReject{Code: GuardSQLNotAllowed, Reason: "denied_function", Message: "this statement calls a function that is not allowed on a read"}
			}
		}
	}
	return nil
}

func denyListedIdent(name string) bool {
	switch name {
	case "pg_read_file", "pg_read_binary_file", "set_config",
		"pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf",
		"nextval":
		return true
	}
	if strings.HasPrefix(name, "lo_") || strings.HasPrefix(name, "dblink") || strings.HasPrefix(name, "pg_advisory_") {
		return true
	}
	return false
}

// GuardChange is the hard deny list in front of propose_change (spec section
// 6). A match is SQL_NOT_ALLOWED with no review path. ROLE/USER after
// CREATE/ALTER/DROP are matched as identifiers as well as keywords, because
// the tokenizer does not treat them as keywords.
func GuardChange(sql string) *GuardReject {
	tokens, err := Tokenize("", sql)
	if err != nil {
		return &GuardReject{Code: GuardSQLUnsupported, Reason: "unsupported_token", Message: "this SQL uses a token form Zentro does not analyze"}
	}
	stmts := SplitTokens(tokens)
	if len(stmts) == 0 {
		return &GuardReject{Code: GuardSQLUnsupported, Reason: "empty", Message: "no statement was found"}
	}
	for _, stmt := range stmts {
		if reject := guardChangeStmt(stmt); reject != nil {
			return reject
		}
	}
	return nil
}

func guardChangeStmt(stmt []Token) *GuardReject {
	words := leadWords(stmt)
	if len(words) == 0 {
		return nil
	}
	switch words[0] {
	case "copy":
		return &GuardReject{Code: GuardSQLNotAllowed, Reason: "copy", Message: "COPY is not allowed"}
	case "grant", "revoke":
		return &GuardReject{Code: GuardSQLNotAllowed, Reason: words[0], Message: strings.ToUpper(words[0]) + " is not allowed"}
	case "drop":
		i := skipIfExists(words, 1)
		if i < len(words) && words[i] == "database" {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "drop_database", Message: "DROP DATABASE is not allowed"}
		}
		if i < len(words) && (words[i] == "role" || words[i] == "user") {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "drop_role", Message: "DROP ROLE and DROP USER are not allowed"}
		}
	case "alter":
		if len(words) > 1 && words[1] == "system" {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "alter_system", Message: "ALTER SYSTEM is not allowed"}
		}
		i := skipIfExists(words, 1)
		if i < len(words) && (words[i] == "role" || words[i] == "user") {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "alter_role", Message: "ALTER ROLE and ALTER USER are not allowed"}
		}
	case "create":
		i := skipIfExists(words, 1)
		if i < len(words) && words[i] == "extension" {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "create_extension", Message: "CREATE EXTENSION is not allowed"}
		}
		if i < len(words) && (words[i] == "role" || words[i] == "user") {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "create_role", Message: "CREATE ROLE and CREATE USER are not allowed"}
		}
	case "set":
		if len(words) > 1 && words[1] == "role" {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "set_role", Message: "SET ROLE is not allowed"}
		}
		if len(words) > 2 && words[1] == "session" && words[2] == "authorization" {
			return &GuardReject{Code: GuardSQLNotAllowed, Reason: "set_session_authorization", Message: "SET SESSION AUTHORIZATION is not allowed"}
		}
	}
	for _, tok := range stmt {
		if tok.Kind == TokenIdentifier || tok.Kind == TokenQuotedIdentifier {
			if denyListedIdent(identBare(tok)) {
				return &GuardReject{Code: GuardSQLNotAllowed, Reason: "denied_function", Message: "this statement calls a function that is not allowed"}
			}
		}
	}
	return nil
}

// LeadWords is the depth-0 keyword and identifier sequence of a statement.
func LeadWords(stmt []Token) []string {
	return leadWords(stmt)
}

func leadWords(stmt []Token) []string {
	out := make([]string, 0, 8)
	for _, tok := range stmt {
		if tok.Depth != 0 {
			continue
		}
		switch tok.Kind {
		case TokenKeyword:
			out = append(out, tok.Text)
		case TokenIdentifier, TokenQuotedIdentifier:
			out = append(out, identBare(tok))
		}
		if len(out) >= 8 {
			break
		}
	}
	return out
}

func skipIfExists(words []string, i int) int {
	if i < len(words) && words[i] == "if" {
		if i+1 < len(words) && words[i+1] == "exists" {
			return i + 2
		}
		if i+2 < len(words) && words[i+1] == "not" && words[i+2] == "exists" {
			return i + 3
		}
	}
	return i
}

func identBare(tok Token) string {
	text := tok.Text
	if tok.Kind == TokenQuotedIdentifier {
		text = unquoteIdent(text)
	}
	if i := strings.LastIndex(text, "."); i >= 0 {
		text = text[i+1:]
	}
	return strings.ToLower(text)
}
