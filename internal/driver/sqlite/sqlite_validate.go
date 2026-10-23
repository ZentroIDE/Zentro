// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/db"
	"zentro/internal/models"
)

// ValidateStatement implements driver.SQLValidator. DML is prepared (never
// executed); DDL is checked at the token level.
func (d *SQLiteDriver) ValidateStatement(ctx context.Context, sqlDB *sql.DB, _, stmt string) (models.MCPValidationResult, error) {
	kind, tokens, tokErr := db.MCPStatementKind("sqlite", stmt)
	if tokErr != nil {
		return db.TokenUnsupportedResult(tokErr), nil
	}
	if !db.IsDMLForDatabaseCheck(tokens) {
		return db.ValidateDDLByTokens(tokens, kind), nil
	}
	return validateByPrepare(ctx, sqlDB, stmt, kind)
}

func validateByPrepare(ctx context.Context, sqlDB *sql.DB, stmt, kind string) (models.MCPValidationResult, error) {
	tx, err := sqlDB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		tx, err = sqlDB.BeginTx(ctx, nil)
		if err != nil {
			return models.MCPValidationResult{}, fmt.Errorf("sqlite: validate: begin: %w", err)
		}
	}
	defer tx.Rollback()

	prepared, prepErr := tx.PrepareContext(ctx, stmt)
	if prepErr != nil {
		result := models.MCPValidationResult{Kind: kind, CheckedBy: "database"}
		result.Errors = []models.MCPValidationError{{Message: prepErr.Error()}}
		if k, name, ok := db.ParseUnknownObject(prepErr); ok {
			result.UnknownObjects = []models.MCPUnknownObject{{Kind: k, Name: name}}
		}
		return result, nil
	}
	_ = prepared.Close()
	return models.MCPValidationResult{Kind: kind, Valid: true, CheckedBy: "database"}, nil
}
