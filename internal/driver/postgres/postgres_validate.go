// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"zentro/internal/db"
	"zentro/internal/models"
)

// ValidateStatement implements driver.SQLValidator for Postgres (spec
// section 3, validate_sql). DML goes through the database itself (PREPARE,
// never executed, always rolled back); DDL cannot be PREPAREd and Zentro has
// no SQL parser, so it is checked at the token level only.
func (d *PostgresDriver) ValidateStatement(ctx context.Context, sqlDB *sql.DB, schema, stmt string) (models.MCPValidationResult, error) {
	tokens, tokErr := db.Tokenize("postgres", stmt)
	if tokErr != nil {
		// A token Tokenize refuses (U&, decision D8) is not a syntax error
		// Postgres would catch any differently; report it as the statement's
		// own validation failure rather than surfacing a tool-level error.
		return models.MCPValidationResult{
			Kind: "other", CheckedBy: "tokens",
			Errors: []models.MCPValidationError{{Message: tokErr.Error()}},
		}, nil
	}

	kind := mcpStatementKind(tokens)
	if isDMLKindForPrepare(tokens) {
		return validateByDatabase(ctx, sqlDB, schema, stmt, kind)
	}
	return validateDDLByTokens(tokens, kind), nil
}

// mcpStatementKind maps the tokenizer's write-operation classification to
// validate_sql's six-value kind enum. MERGE and REPLACE have no kind of
// their own in that enum and fall to "other", though they are still checked
// by the database (isDMLKindForPrepare), since Postgres can PREPARE them.
func mcpStatementKind(tokens []db.Token) string {
	switch db.StatementKind(tokens) {
	case db.WriteOperationRead:
		return "select"
	case db.WriteOperationInsert:
		return "insert"
	case db.WriteOperationUpdate:
		return "update"
	case db.WriteOperationDelete:
		return "delete"
	case db.WriteOperationAlter, db.WriteOperationDrop, db.WriteOperationTruncate, db.WriteOperationCreate:
		return "ddl"
	default:
		return "other"
	}
}

func isDMLKindForPrepare(tokens []db.Token) bool {
	switch db.StatementKind(tokens) {
	case db.WriteOperationRead, db.WriteOperationInsert, db.WriteOperationUpdate,
		db.WriteOperationDelete, db.WriteOperationMerge, db.WriteOperationReplace:
		return true
	default:
		return false
	}
}

// validateByDatabase lets Postgres itself check stmt: PREPARE inside a
// transaction (never executed, never committed) catches a bad column, a bad
// type, or a bad operator the way no hand-written parser could. A SAVEPOINT
// lets one failed PREPARE be rolled back without poisoning the rest of the
// transaction; a successful one is explicitly DEALLOCATEd so the prepared
// statement does not outlive this call on a pooled connection.
func validateByDatabase(ctx context.Context, sqlDB *sql.DB, schema, stmt, kind string) (models.MCPValidationResult, error) {
	tx, err := sqlDB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return models.MCPValidationResult{}, fmt.Errorf("postgres: validate: begin: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "SET LOCAL lock_timeout = '1s'"); err != nil {
		return models.MCPValidationResult{}, fmt.Errorf("postgres: validate: set lock_timeout: %w", err)
	}
	if schema != "" {
		if _, err := tx.ExecContext(ctx, "SET LOCAL search_path TO "+quoteIdentifier(schema)); err != nil {
			return models.MCPValidationResult{}, fmt.Errorf("postgres: validate: set search_path: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, "SAVEPOINT zentro_validate"); err != nil {
		return models.MCPValidationResult{}, fmt.Errorf("postgres: validate: savepoint: %w", err)
	}

	_, prepErr := tx.ExecContext(ctx, "PREPARE zentro_validate_stmt AS "+stmt)
	if prepErr == nil {
		// Clean up within the same transaction; ROLLBACK (deferred above)
		// then discards the transaction itself. Failing to deallocate is not
		// fatal to validation, only to tidiness, so its own error is ignored.
		_, _ = tx.ExecContext(ctx, "DEALLOCATE zentro_validate_stmt")
		return models.MCPValidationResult{Kind: kind, Valid: true, CheckedBy: "database"}, nil
	}

	if _, rollErr := tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT zentro_validate"); rollErr != nil {
		return models.MCPValidationResult{}, fmt.Errorf("postgres: validate: rollback to savepoint: %w", rollErr)
	}

	valErr, unknown := postgresValidationError(stmt, prepErr)
	return models.MCPValidationResult{
		Kind:           kind,
		Valid:          false,
		Errors:         []models.MCPValidationError{valErr},
		UnknownObjects: unknown,
		CheckedBy:      "database",
	}, nil
}

// postgresValidationError turns a PREPARE failure into the error shape
// validate_sql reports, plus any table or column name Postgres said does
// not exist. Line/Col come from Position, the database's own 1-based byte
// offset into the query it was given; no SQL parser is involved.
func postgresValidationError(stmt string, err error) (models.MCPValidationError, []models.MCPUnknownObject) {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return models.MCPValidationError{Message: err.Error()}, nil
	}
	line, col := lineAndColumnAtByte(stmt, int(pgErr.Position))
	valErr := models.MCPValidationError{
		Message:  pgErr.Message,
		Line:     line,
		Col:      col,
		SQLState: pgErr.Code,
	}
	var unknown []models.MCPUnknownObject
	if kind, name, ok := unknownObjectFromError(pgErr); ok {
		unknown = append(unknown, models.MCPUnknownObject{Kind: kind, Name: name})
	}
	return valErr, unknown
}

// undefinedTable and undefinedColumn are the SQLSTATE codes Postgres returns
// for a name validate_sql's unknownObjects is meant to surface.
const (
	sqlStateUndefinedTable  = "42P01"
	sqlStateUndefinedColumn = "42703"
)

var quotedNamePattern = regexp.MustCompile(`"([^"]+)"`)

// unknownObjectFromError reads the quoted name out of Postgres' own message
// for an undefined table or column. The message text is Postgres', not
// Zentro's own parsing of the query, so it is accurate to whatever Postgres
// actually looked up.
func unknownObjectFromError(pgErr *pgconn.PgError) (kind, name string, ok bool) {
	switch pgErr.Code {
	case sqlStateUndefinedTable:
		kind = "table"
	case sqlStateUndefinedColumn:
		kind = "column"
	default:
		return "", "", false
	}
	m := quotedNamePattern.FindStringSubmatch(pgErr.Message)
	if len(m) < 2 {
		return "", "", false
	}
	// A qualified column reference ("r"."bar" or r.bar) only quotes the
	// column itself in Postgres' message; strip any schema/table prefix a
	// caller might still find attached by convention.
	if idx := strings.LastIndexByte(m[1], '.'); idx >= 0 {
		return kind, m[1][idx+1:], true
	}
	return kind, m[1], true
}

// lineAndColumnAtByte converts a 1-based byte Position (as Postgres reports
// it, into the exact text sent) to a 1-based line and column by counting
// newlines in stmt up to that position. Position 0 means the database gave
// none; the result is then (0, 0), which the caller passes through as-is
// rather than guessing.
func lineAndColumnAtByte(stmt string, position int) (line, col int) {
	if position <= 0 {
		return 0, 0
	}
	target := position - 1 // Postgres' Position is 1-based.
	if target > len(stmt) {
		target = len(stmt)
	}
	line = 1
	lineStart := 0
	for i := 0; i < target; i++ {
		if stmt[i] == '\n' {
			line++
			lineStart = i + 1
		}
	}
	col = target - lineStart + 1
	return line, col
}

// quoteIdentifier double-quotes name for use as an identifier, doubling any
// embedded quote. Used only for SET LOCAL search_path, never for a value.
func quoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// validateDDLByTokens is validate_sql's DDL path: no parser, no PREPARE, so
// only what the token stream itself can show. It balances parentheses (an
// unclosed or an extra one is a real, reportable error); it does not check
// that a referenced table or index exists, that needs the same per-action
// DDL breakdown check_migration_safety
// (T4.6) builds, and duplicating a smaller, inconsistent version of it here
// would only need redoing. A validate_sql call on DDL is honest about this
// gap through CheckedBy "tokens" plus the tool's own warnings (T2.2).
func validateDDLByTokens(tokens []db.Token, kind string) models.MCPValidationResult {
	result := models.MCPValidationResult{Kind: kind, CheckedBy: "tokens"}

	opens, closes := 0, 0
	for _, t := range tokens {
		if t.Kind == db.TokenPunct {
			switch t.Text {
			case "(":
				opens++
			case ")":
				closes++
			}
		}
	}
	if opens != closes {
		result.Errors = append(result.Errors, models.MCPValidationError{
			Message: fmt.Sprintf("unbalanced parentheses: %d opening, %d closing", opens, closes),
		})
		return result
	}

	result.Valid = true
	return result
}
