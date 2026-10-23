// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"

	"zentro/internal/db"
)

// classify_sql verdicts (spec section 4). A verdict is information about
// risk under one environment's policy, never a license decision: whether the
// approval screen asks the user to type a confirmation is decided there, by
// plan (D1), not here.
const (
	classifyAllowed           = "allowed"
	classifyNeedsConfirmation = "needs_confirmation"
	classifyBlocked           = "blocked"
)

type aiClassifyReasonDTO struct {
	Statement int    `json:"statement"`
	Rule      string `json:"rule"`
	Message   string `json:"message"`
}

type aiClassifySuggestionDTO struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
}

// sqlClassification is classifyForEnv's result: the risk analysis the old
// classify_sql already returned, plus the verdict for one environment.
type sqlClassification struct {
	Risk        db.SQLRisk
	Verdict     string
	Reasons     []aiClassifyReasonDTO
	Suggestions []aiClassifySuggestionDTO
}

// classifyForEnv decides, from tokens alone and never by touching a
// database, how risky sql is under policy. It is deliberately not
// PreflightQuery, which previews affected rows against the database.
//
//   - A read is allowed.
//   - UPDATE or DELETE without a top-level WHERE is blocked where the
//     environment is strict (the run path refuses it there without strong
//     confirmation) and needs confirmation elsewhere.
//   - DROP and TRUNCATE always need confirmation.
//   - Any other write needs confirmation in production.
//   - Several statements with a write need confirmation where the
//     environment is strict.
//   - A statement Zentro cannot analyze (an unsupported token, DO, EXECUTE,
//     or an unrecognized leading keyword) needs confirmation and is never
//     allowed.
func classifyForEnv(sql, driver string, policy ExecutionPolicy) sqlClassification {
	out := sqlClassification{Risk: db.AnalyzeSQLRisk(sql), Verdict: classifyAllowed}
	strict := policy.SafetyLevel == SafetyLevelStrict
	escalate := func(verdict string) {
		if verdict == classifyBlocked || (verdict == classifyNeedsConfirmation && out.Verdict == classifyAllowed) {
			out.Verdict = verdict
		}
	}
	reason := func(n int, rule, message, verdict string) {
		out.Reasons = append(out.Reasons, aiClassifyReasonDTO{Statement: n, Rule: rule, Message: message})
		escalate(verdict)
	}
	suggested := map[string]bool{}
	suggest := func(kind, text string) {
		if !suggested[kind] {
			suggested[kind] = true
			out.Suggestions = append(out.Suggestions, aiClassifySuggestionDTO{Kind: kind, Text: text})
		}
	}

	// The tokenizer's own view, statement by statement. A token it refuses
	// (U&, decision D8) makes the whole input unanalyzable; the risk analysis
	// above still ran on its lenient scan, so a write keyword is not missed.
	tokens, tokErr := db.Tokenize(driver, sql)
	var tokenStatements [][]db.Token
	if tokErr != nil {
		reason(0, "unanalyzable_statement", "The SQL contains a token Zentro cannot analyze safely.", classifyNeedsConfirmation)
	} else {
		tokenStatements = db.SplitTokens(tokens)
	}

	for i, stmt := range out.Risk.Statements {
		n := i + 1
		var stmtTokens []db.Token
		if i < len(tokenStatements) {
			stmtTokens = tokenStatements[i]
		}
		switch db.FirstKeyword(stmtTokens) {
		case "do", "execute", "exec":
			reason(n, "unanalyzable_statement", "DO and EXECUTE run code Zentro cannot see into.", classifyNeedsConfirmation)
			continue
		}

		switch stmt.Operation {
		case db.WriteOperationRead:
			if stmtTokens != nil && db.FirstKeyword(stmtTokens) == "select" &&
				!db.HasTopLevelKeyword(stmtTokens, "limit") && !db.HasTopLevelKeyword(stmtTokens, "fetch") {
				suggest("add_limit", "Add a LIMIT so a large table does not return every row.")
			}
		case db.WriteOperationUnknown, db.WriteOperationOtherWrite:
			if strings.TrimSpace(stmt.Statement) != "" {
				reason(n, "unanalyzable_statement", "Zentro does not recognize this kind of statement.", classifyNeedsConfirmation)
			}
		case db.WriteOperationDrop:
			reason(n, "ddl_drop", "DROP removes the object and everything in it.", classifyNeedsConfirmation)
		case db.WriteOperationTruncate:
			reason(n, "truncate", "TRUNCATE removes every row at once.", classifyNeedsConfirmation)
		default:
			switch {
			case stmt.UpdateNoWhere || stmt.DeleteNoWhere:
				rule, verb := "update_without_where", "UPDATE"
				if stmt.DeleteNoWhere {
					rule, verb = "delete_without_where", "DELETE"
				}
				verdict := classifyNeedsConfirmation
				if strict {
					verdict = classifyBlocked
				}
				reason(n, rule, verb+" without a top-level WHERE changes every row; a WHERE inside a subquery or CTE does not count.", verdict)
				suggest("add_where", "Add a WHERE at the top level of the statement that limits it to the rows you mean.")
			case policy.IsProduction && (stmt.Operation == db.WriteOperationCreate || stmt.Operation == db.WriteOperationAlter):
				reason(n, "ddl_in_production", "Schema changes in production need confirmation.", classifyNeedsConfirmation)
			case policy.IsProduction:
				reason(n, "production_write", "Writes in production need confirmation.", classifyNeedsConfirmation)
			}
		}
	}

	if len(out.Risk.Statements) > 1 && out.Risk.HasWrite {
		verdict := classifyAllowed
		if strict {
			verdict = classifyNeedsConfirmation
		}
		reason(0, "multi_statement", fmt.Sprintf("%d statements run together, at least one of them a write.", len(out.Risk.Statements)), verdict)
		if !hasExplicitTransaction(sql) {
			suggest("wrap_in_transaction", "Run the statements in one transaction so a failure part way leaves nothing half done.")
		}
	}
	if out.Risk.HasWrite {
		suggest("use_propose_change", "Do not run writes from the agent; hand them to the user to review and approve in Zentro.")
	}
	return out
}
