// SPDX-License-Identifier: GPL-3.0-only

package license

// ---------------------------------------------------------------------------
// Typed string enums — prevents bare string literals throughout the codebase.
// ---------------------------------------------------------------------------

type ActivationStatus string
type Tier string
type FeatureID string
type LimitID string
type ErrCode string

// ---------------------------------------------------------------------------
// ActivationStatus values
// ---------------------------------------------------------------------------

const (
	StatusInactive   ActivationStatus = "inactive"
	StatusActivating ActivationStatus = "activating"
	StatusActive     ActivationStatus = "active"
	StatusExpired    ActivationStatus = "expired"
	StatusRevoked    ActivationStatus = "revoked"
	StatusError      ActivationStatus = "error"
)

// ---------------------------------------------------------------------------
// Tier values
// ---------------------------------------------------------------------------

const (
	TierFree       Tier = "free"
	TierPro        Tier = "pro"
	TierTeam       Tier = "team"       // seat-based multi-user workspace
	TierEnterprise Tier = "enterprise" // seat-based, SSO, compliance, airgap
)

// ---------------------------------------------------------------------------
// ErrCode values — carried in AccessResult.Code for UI upgrade prompts.
// ---------------------------------------------------------------------------

const (
	ErrCodeOK                 ErrCode = "ok"
	ErrCodeTierRequired       ErrCode = "tier_required"
	ErrCodeSeatLimitExceeded  ErrCode = "seat_limit_exceeded"
	ErrCodeAppLocked          ErrCode = "app_locked"
	ErrCodeOfflineGrace       ErrCode = "offline_grace"
	ErrCodeSSORequired        ErrCode = "sso_required"
	ErrCodeDeviceLimitReached ErrCode = "device_limit_reached"
)

// ---------------------------------------------------------------------------
// Feature ID constants for the features every build has. The paid ones are
// declared next to their registration (pro_features.go).
// ---------------------------------------------------------------------------

const (
	FeatureQueryExecuteBasic         FeatureID = "query.execute.basic"
	FeatureQueryResultSearch         FeatureID = "query.result.search"
	FeatureQueryResultJump           FeatureID = "query.result.jump"
	FeatureQueryResultBookmark       FeatureID = "query.result.bookmark"
	FeatureQueryResultExport         FeatureID = "query.result.export"
	FeatureQueryResultCompare        FeatureID = "query.result.compare"
	FeatureSchemaDiffBasic           FeatureID = "schema.diff.basic"
	FeaturePluginUICommands          FeatureID = "plugin.ui.commands"
	FeaturePluginDataProviders       FeatureID = "plugin.data.providers"
	FeatureSafetyProductionOverlay   FeatureID = "safety.production_overlay" // red-border UI warning only, no enforcement.
	FeatureSafetyAffectedRowsPreview FeatureID = "safety.affected_rows_preview"
	FeatureSafetyQueryRiskClassify   FeatureID = "safety.query_risk_classification"
	FeatureRecoverySchemaSnapshot    FeatureID = "recovery.schema_snapshot"
	FeatureQueryAdvancedAIAssist     FeatureID = "query.advanced.ai-assist"
)

// ---------------------------------------------------------------------------
// Limit ID constants
// ---------------------------------------------------------------------------

const (
	LimitMaxProjects LimitID = "max_projects"
)

// AccessResult carries the full result of a feature access check.
// Richer than a bool — enables contextual upgrade prompts in the UI.
type AccessResult struct {
	Allowed      bool    `json:"allowed"`
	Code         ErrCode `json:"code"`
	RequiredTier Tier    `json:"required_tier,omitempty"`
}
