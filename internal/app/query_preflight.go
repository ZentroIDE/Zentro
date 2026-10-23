// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"

	dbpkg "zentro/internal/db"
	"zentro/internal/extensions/license"
)

type ProductionWriteUnlockState struct {
	EnvironmentKey string `json:"environment_key"`
	Unlocked       bool   `json:"unlocked"`
	UnlockUntil    string `json:"unlock_until,omitempty"`
}

type QueryPreflightStatement struct {
	StatementText     string `json:"statement_text"`
	Operation         string `json:"operation"`
	RiskLevel         string `json:"risk_level"`
	HasWhere          bool   `json:"has_where"`
	Destructive       bool   `json:"destructive"`
	PreviewSupported  bool   `json:"preview_supported"`
	TypeToConfirmText string `json:"type_to_confirm_text,omitempty"`
}

type QueryPreflightResult struct {
	Statements               []QueryPreflightStatement  `json:"statements"`
	RiskLevel                string                     `json:"risk_level"`
	RequiresPro              bool                       `json:"requires_pro"`
	RequiresProductionUnlock bool                       `json:"requires_production_unlock"`
	ProductionUnlock         ProductionWriteUnlockState `json:"production_unlock"`
	RequiresTypeToConfirm    bool                       `json:"requires_type_to_confirm"`
	TypeToConfirmText        string                     `json:"type_to_confirm_text,omitempty"`
	RequiresCooldown         bool                       `json:"requires_cooldown"`
	CooldownSeconds          int                        `json:"cooldown_seconds,omitempty"`
	RequiresReason           bool                       `json:"requires_reason"`
	AffectedRowsPreview      QueryPreviewResult         `json:"affected_rows_preview"`
	UsedProtectionLayers     []string                   `json:"used_protection_layers,omitempty"`
	TransactionSuggested     bool                       `json:"transaction_suggested"`
	SnapshotRequired         bool                       `json:"snapshot_required"`
}

// PreflightQuery reports what a query needs before it runs. Core fills the
// free baseline (risk, snapshot, affected-rows preview); the installed write
// guards (write_guard.go) add the protection layers they own.
func (a *App) PreflightQuery(query string, environmentKey string) (QueryPreflightResult, error) {
	risk := dbpkg.AnalyzeSQLRisk(query)
	envKey := strings.TrimSpace(environmentKey)
	if envKey == "" {
		envKey = string(a.currentProjectEnvironmentKey())
	}
	isProd := environmentIsProduction(envKey)

	result := QueryPreflightResult{
		RiskLevel:            aggregateRiskLevel(risk),
		TransactionSuggested: risk.HasWrite && len(risk.Statements) > 1 && !hasExplicitTransaction(query),
		SnapshotRequired:     isProd && hasDDL(risk),
	}

	for _, statement := range risk.Statements {
		typeText := typeToConfirmLabel(statement)
		result.Statements = append(result.Statements, QueryPreflightStatement{
			StatementText:     statement.Statement,
			Operation:         string(statement.Operation),
			RiskLevel:         statementRiskLevel(statement),
			HasWhere:          statement.HasWhere,
			Destructive:       statement.Destructive,
			PreviewSupported:  previewSupportedForStatement(statement.Statement, a.currentDriver()),
			TypeToConfirmText: typeText,
		})
		if result.TypeToConfirmText == "" && typeText != "" {
			result.TypeToConfirmText = typeText
		}
	}

	a.applyWriteGuards(WriteGuardInput{Query: query, EnvironmentKey: envKey, IsProduction: isProd, Risk: risk}, &result)

	if result.SnapshotRequired {
		result.UsedProtectionLayers = append(result.UsedProtectionLayers, string(license.FeatureRecoverySchemaSnapshot))
	}

	if preview, err := a.PreviewAffectedRows(query, envKey); err == nil {
		result.AffectedRowsPreview = preview
		if preview.Supported {
			result.UsedProtectionLayers = append(result.UsedProtectionLayers, string(license.FeatureSafetyAffectedRowsPreview))
		}
	}
	return result, nil
}

func requiresAdvancedSafetyUpsellForSQLRisk(risk dbpkg.SQLRisk) bool {
	return risk.HasDestructive || risk.HasUpdateNoWhere || risk.HasDeleteNoWhere || hasDDL(risk)
}

func aggregateRiskLevel(risk dbpkg.SQLRisk) string {
	if risk.HasUpdateNoWhere || risk.HasDeleteNoWhere || risk.HasDestructive {
		return "danger"
	}
	if risk.HasWrite {
		return "caution"
	}
	return "safe"
}

func statementRiskLevel(risk dbpkg.StatementRisk) string {
	if risk.UpdateNoWhere || risk.DeleteNoWhere || risk.Destructive {
		return "danger"
	}
	if risk.Operation != dbpkg.WriteOperationRead && risk.Operation != dbpkg.WriteOperationUnknown {
		return "caution"
	}
	return "safe"
}

func previewSupportedForStatement(statement string, driver string) bool {
	_, err := firstPreviewStatement(statement, driver)
	return err == nil
}

func typeToConfirmLabel(risk dbpkg.StatementRisk) string {
	switch risk.Operation {
	case dbpkg.WriteOperationDrop, dbpkg.WriteOperationTruncate:
		_, table := dbpkg.ExtractTableFromQuery("SELECT * FROM " + strings.TrimSpace(risk.Statement))
		if table != "" {
			return table
		}
	}
	return strings.ToUpper(string(risk.Operation))
}

func hasExplicitTransaction(query string) bool {
	normalized := strings.ToLower(strings.TrimSpace(query))
	return strings.Contains(normalized, "begin") || strings.Contains(normalized, "start transaction")
}

func hasDDL(risk dbpkg.SQLRisk) bool {
	for _, statement := range risk.Statements {
		switch statement.Operation {
		case dbpkg.WriteOperationCreate, dbpkg.WriteOperationAlter, dbpkg.WriteOperationDrop, dbpkg.WriteOperationTruncate:
			return true
		}
	}
	return false
}

func (a *App) currentDriver() string {
	if a.profile != nil {
		return a.profile.Driver
	}
	return ""
}
