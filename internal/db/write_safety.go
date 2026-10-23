// SPDX-License-Identifier: GPL-3.0-only

package db

import "strings"

type WriteOperation string

const (
	WriteOperationUnknown    WriteOperation = "unknown"
	WriteOperationRead       WriteOperation = "read"
	WriteOperationUpdate     WriteOperation = "update"
	WriteOperationDelete     WriteOperation = "delete"
	WriteOperationAlter      WriteOperation = "alter"
	WriteOperationDrop       WriteOperation = "drop"
	WriteOperationTruncate   WriteOperation = "truncate"
	WriteOperationMerge      WriteOperation = "merge"
	WriteOperationReplace    WriteOperation = "replace"
	WriteOperationInsert     WriteOperation = "insert"
	WriteOperationCreate     WriteOperation = "create"
	WriteOperationOtherWrite WriteOperation = "other_write"
)

type StatementRisk struct {
	Statement     string
	Operation     WriteOperation
	HasWhere      bool
	Destructive   bool
	UpdateNoWhere bool
	DeleteNoWhere bool
}

type SQLRisk struct {
	Statements       []StatementRisk
	Operations       []WriteOperation
	HasWrite         bool
	HasDestructive   bool
	HasUpdateNoWhere bool
	HasDeleteNoWhere bool
}

func AnalyzeSQLRisk(query string) SQLRisk {
	statements := SplitStatements(query)
	if len(statements) == 0 {
		statements = []string{query}
	}

	analyses := make([]StatementRisk, 0, len(statements))
	opsSeen := make(map[WriteOperation]struct{})
	ops := make([]WriteOperation, 0, 4)
	hasWrite := false
	hasDestructive := false
	hasUpdateNoWhere := false
	hasDeleteNoWhere := false

	for _, statement := range statements {
		analysis := AnalyzeStatementRisk(statement)
		if strings.TrimSpace(analysis.Statement) == "" {
			continue
		}
		analyses = append(analyses, analysis)
		if analysis.Operation != WriteOperationUnknown {
			if _, exists := opsSeen[analysis.Operation]; !exists {
				opsSeen[analysis.Operation] = struct{}{}
				ops = append(ops, analysis.Operation)
			}
		}
		if isWriteOperation(analysis.Operation) {
			hasWrite = true
		}
		if analysis.Destructive {
			hasDestructive = true
		}
		if analysis.UpdateNoWhere {
			hasUpdateNoWhere = true
		}
		if analysis.DeleteNoWhere {
			hasDeleteNoWhere = true
		}
	}

	return SQLRisk{
		Statements:       analyses,
		Operations:       ops,
		HasWrite:         hasWrite,
		HasDestructive:   hasDestructive,
		HasUpdateNoWhere: hasUpdateNoWhere,
		HasDeleteNoWhere: hasDeleteNoWhere,
	}
}

func AnalyzeStatementRisk(statement string) StatementRisk {
	trimmed := strings.TrimSpace(statement)
	tokens := riskTokens(trimmed)
	operation := StatementKind(tokens)
	hasWhere := HasTopLevelKeyword(tokens, "where")
	destructive := isDestructiveOperation(operation)
	updateNoWhere := operation == WriteOperationUpdate && !hasWhere
	deleteNoWhere := operation == WriteOperationDelete && !hasWhere

	return StatementRisk{
		Statement:     trimmed,
		Operation:     operation,
		HasWhere:      hasWhere,
		Destructive:   destructive,
		UpdateNoWhere: updateNoWhere,
		DeleteNoWhere: deleteNoWhere,
	}
}

// ClassifyStatementOperation returns the primary write operation for a single
// SQL statement. Used where only the operation kind is needed (e.g.
// aggregating DML row counts across a script) without full risk analysis.
func ClassifyStatementOperation(statement string) WriteOperation {
	return StatementKind(riskTokens(statement))
}

// riskTokens tokenizes sql for write-safety classification. When the strict
// tokenizer refuses a token form (U&"..." / U&'...', decision D8), it falls
// back to a lenient scan so a write keyword is never masked by the truncation
// that accompanies ErrUnsupportedToken. The lenient scan sees every keyword, so
// the classification stays at least as conservative as the pre-tokenizer
// classifier; the public Tokenize keeps returning ErrUnsupportedToken for the
// MCP tool to reject.
func riskTokens(sql string) []Token {
	tokens, err := Tokenize("", sql)
	if err != nil {
		return tokenizeSQLLenient("", sql)
	}
	return tokens
}

func isWriteOperation(operation WriteOperation) bool {
	switch operation {
	case WriteOperationUpdate, WriteOperationDelete, WriteOperationAlter, WriteOperationDrop,
		WriteOperationTruncate, WriteOperationMerge, WriteOperationReplace,
		WriteOperationInsert, WriteOperationCreate, WriteOperationOtherWrite:
		return true
	default:
		return false
	}
}

func isDestructiveOperation(operation WriteOperation) bool {
	switch operation {
	case WriteOperationUpdate, WriteOperationDelete, WriteOperationAlter,
		WriteOperationDrop, WriteOperationTruncate, WriteOperationMerge, WriteOperationReplace:
		return true
	default:
		return false
	}
}
