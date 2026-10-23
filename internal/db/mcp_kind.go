// SPDX-License-Identifier: GPL-3.0-only

package db

import (
	"fmt"
	"strings"

	"zentro/internal/models"
)

// MCPStatementKind maps tokenizer classification onto validate_sql's kind enum.
func MCPStatementKind(driverName, stmt string) (kind string, tokens []Token, err error) {
	tokens, err = Tokenize(driverName, stmt)
	if err != nil {
		return "other", nil, err
	}
	switch StatementKind(tokens) {
	case WriteOperationRead:
		return "select", tokens, nil
	case WriteOperationInsert:
		return "insert", tokens, nil
	case WriteOperationUpdate:
		return "update", tokens, nil
	case WriteOperationDelete:
		return "delete", tokens, nil
	case WriteOperationAlter, WriteOperationDrop, WriteOperationTruncate, WriteOperationCreate:
		return "ddl", tokens, nil
	default:
		return "other", tokens, nil
	}
}

// IsDMLForDatabaseCheck reports whether stmt should be checked by the database.
func IsDMLForDatabaseCheck(tokens []Token) bool {
	switch StatementKind(tokens) {
	case WriteOperationRead, WriteOperationInsert, WriteOperationUpdate,
		WriteOperationDelete, WriteOperationMerge, WriteOperationReplace:
		return true
	default:
		return false
	}
}

// ValidateDDLByTokens is the shared DDL path: balanced parentheses only.
func ValidateDDLByTokens(tokens []Token, kind string) models.MCPValidationResult {
	result := models.MCPValidationResult{Kind: kind, CheckedBy: "tokens"}
	opens, closes := 0, 0
	for _, t := range tokens {
		if t.Kind == TokenPunct {
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

// TokenUnsupportedResult reports a tokenizer refusal as a statement-level failure.
func TokenUnsupportedResult(err error) models.MCPValidationResult {
	return models.MCPValidationResult{
		Kind:      "other",
		CheckedBy: "tokens",
		Errors:    []models.MCPValidationError{{Message: err.Error()}},
	}
}

// ParseUnknownObject reads a table or column name out of a database error.
func ParseUnknownObject(err error) (kind, name string, ok bool) {
	if err == nil {
		return "", "", false
	}
	msg := err.Error()
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "no such table"):
		return "table", lastIdentAfter(msg, "no such table"), true
	case strings.Contains(lower, "no such column"):
		return "column", lastIdentAfter(msg, "no such column"), true
	case strings.Contains(lower, "doesn't exist") && strings.Contains(lower, "table"):
		return "table", lastIdentAfter(msg, "table"), true
	case strings.Contains(lower, "unknown column"):
		return "column", lastIdentAfter(msg, "unknown column"), true
	case strings.Contains(lower, "invalid object name"):
		return "table", lastIdentAfter(msg, "invalid object name"), true
	case strings.Contains(lower, "invalid column name"):
		return "column", lastIdentAfter(msg, "invalid column name"), true
	default:
		return "", "", false
	}
}

func lastIdentAfter(msg, marker string) string {
	lower := strings.ToLower(msg)
	idx := strings.Index(lower, strings.ToLower(marker))
	if idx < 0 {
		return strings.TrimSpace(msg)
	}
	rest := strings.TrimSpace(msg[idx+len(marker):])
	rest = strings.TrimLeft(rest, ": ")
	rest = strings.Trim(rest, `"'[]`+"`")
	if dot := strings.LastIndexByte(rest, '.'); dot >= 0 {
		rest = rest[dot+1:]
		rest = strings.Trim(rest, `"'[]`+"`")
	}
	if cut := strings.IndexAny(rest, " \t\n,;"); cut >= 0 {
		rest = rest[:cut]
	}
	return strings.Trim(rest, `"'[]`+"`")
}
