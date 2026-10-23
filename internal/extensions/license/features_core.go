// SPDX-License-Identifier: GPL-3.0-only

package license

// Features every plan includes, Free included. Anything not listed here is
// paid and registers itself (see pro_features.go).
func init() {
	RegisterFeatures(
		FeatureDef{ID: FeatureQueryExecuteBasic, MinTier: TierFree},
		FeatureDef{ID: FeatureQueryResultSearch, MinTier: TierFree},
		FeatureDef{ID: FeatureQueryResultJump, MinTier: TierFree},
		FeatureDef{ID: FeatureQueryResultBookmark, MinTier: TierFree},
		FeatureDef{ID: FeatureQueryResultExport, MinTier: TierFree},
		FeatureDef{ID: FeatureQueryResultCompare, MinTier: TierFree},
		FeatureDef{ID: FeatureSchemaDiffBasic, MinTier: TierFree},
		FeatureDef{ID: FeaturePluginUICommands, MinTier: TierFree},
		FeatureDef{ID: FeaturePluginDataProviders, MinTier: TierFree},
		// The data-protection floor is free on every plan (ADR 0017).
		FeatureDef{ID: FeatureSafetyProductionOverlay, MinTier: TierFree},
		FeatureDef{ID: FeatureSafetyAffectedRowsPreview, MinTier: TierFree},
		FeatureDef{ID: FeatureSafetyQueryRiskClassify, MinTier: TierFree},
		FeatureDef{ID: FeatureRecoverySchemaSnapshot, MinTier: TierFree},
		// Bring-your-own-key AI is free on every plan (ADR 0019).
		FeatureDef{ID: FeatureQueryAdvancedAIAssist, MinTier: TierFree},
	)
}
