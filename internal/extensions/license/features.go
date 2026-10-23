// SPDX-License-Identifier: GPL-3.0-only

package license

import (
	"fmt"
	"sync"
)

// FeatureDef declares one feature and the lowest tier whose plan includes it.
//
// The registry of FeatureDefs is the only place features are listed. The tier
// catalog is derived from it (see buildTierCatalog) and the frontend's
// fallback matrix is generated from it (scripts/gen-entitlement-matrix.mjs),
// so the backend and the UI cannot disagree about what a plan includes.
type FeatureDef struct {
	ID      FeatureID
	MinTier Tier
}

var (
	featureMu       sync.RWMutex
	featureRegistry []FeatureDef
	featureIDs      = map[FeatureID]struct{}{}
	// featuresChanged, when set, runs (under featureMu) after the registry
	// changes. Whatever derives from the registry uses it to drop its cache.
	featuresChanged func()
)

// tierRank orders the tiers: a plan includes every feature whose MinTier ranks
// at or below its own tier.
func tierRank(tier Tier) (int, bool) {
	switch tier {
	case TierFree:
		return 0, true
	case TierPro:
		return 1, true
	case TierTeam:
		return 2, true
	case TierEnterprise:
		return 3, true
	}
	return 0, false
}

// RegisterFeatures adds feature definitions to the catalog. Core registers the
// Free features; the paid features register themselves the same way from an
// init(), so the core does not need to know which features are paid.
//
// It panics on an empty ID, an unknown tier or an ID registered twice: all are
// programmer errors that must surface at startup, not as a silently wrong plan.
func RegisterFeatures(defs ...FeatureDef) {
	featureMu.Lock()
	defer featureMu.Unlock()
	for _, def := range defs {
		if def.ID == "" {
			panic("license: RegisterFeatures: empty feature id")
		}
		if _, ok := tierRank(def.MinTier); !ok {
			panic(fmt.Sprintf("license: RegisterFeatures: feature %q has unknown tier %q", def.ID, def.MinTier))
		}
		if _, dup := featureIDs[def.ID]; dup {
			panic(fmt.Sprintf("license: RegisterFeatures: feature %q registered twice", def.ID))
		}
		featureIDs[def.ID] = struct{}{}
		featureRegistry = append(featureRegistry, def)
	}
	if featuresChanged != nil {
		featuresChanged()
	}
}

// RegisteredFeatures returns a copy of every registered feature definition in
// registration order.
func RegisteredFeatures() []FeatureDef {
	featureMu.RLock()
	defer featureMu.RUnlock()
	return append([]FeatureDef(nil), featureRegistry...)
}
