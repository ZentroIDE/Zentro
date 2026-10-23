// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"

	"zentro/internal/db"
	"zentro/internal/models"
)

// ValidateStatement implements driver.SQLValidator at the token level only
// (spec: SQL Server is "Một phần (token)").
func (d *MSSQLDriver) ValidateStatement(_ context.Context, _ *sql.DB, _, stmt string) (models.MCPValidationResult, error) {
	kind, tokens, tokErr := db.MCPStatementKind("sqlserver", stmt)
	if tokErr != nil {
		return db.TokenUnsupportedResult(tokErr), nil
	}
	return db.ValidateDDLByTokens(tokens, kind), nil
}
