// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/db"
	"zentro/internal/models"
)

func (d *MySQLDriver) ValidateStatement(ctx context.Context, sqlDB *sql.DB, schema, stmt string) (models.MCPValidationResult, error) {
	kind, tokens, tokErr := db.MCPStatementKind("mysql", stmt)
	if tokErr != nil {
		return db.TokenUnsupportedResult(tokErr), nil
	}
	if !db.IsDMLForDatabaseCheck(tokens) {
		return db.ValidateDDLByTokens(tokens, kind), nil
	}
	tx, err := sqlDB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		tx, err = sqlDB.BeginTx(ctx, nil)
		if err != nil {
			return models.MCPValidationResult{}, fmt.Errorf("mysql: validate: begin: %w", err)
		}
	}
	defer tx.Rollback()
	if schema != "" {
		if _, err := tx.ExecContext(ctx, "USE "+d.QuoteIdentifier(schema)); err != nil {
			return models.MCPValidationResult{}, fmt.Errorf("mysql: validate: use: %w", err)
		}
	}
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
