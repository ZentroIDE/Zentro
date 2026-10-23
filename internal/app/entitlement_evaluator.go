// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"sync"

	"zentro/internal/extensions/license"
)

// FeatureChecker is one link in the entitlement decision chain.
// Plugin packages and tier-specific modules implement this interface.
type FeatureChecker interface {
	// Check returns (result, handled).
	//   handled=true  — result is final, chain stops.
	//   handled=false — this checker does not own featureID, continue chain.
	// ctx may carry identity information for Team/Enterprise user-scoped checks.
	Check(ctx context.Context, featureID license.FeatureID) (license.AccessResult, bool)
}

// EntitlementEvaluator is the single gate for feature access across all tiers.
// Supports Free, Pro, Team, and Enterprise via a pluggable checker chain.
// Checkers are evaluated in registration order; the first that returns handled=true wins.
type EntitlementEvaluator struct {
	mu    sync.RWMutex
	chain []FeatureChecker
}

// NewEntitlementEvaluator creates an evaluator with the given initial checkers.
func NewEntitlementEvaluator(checkers ...FeatureChecker) *EntitlementEvaluator {
	e := &EntitlementEvaluator{}
	e.chain = append(e.chain, checkers...)
	return e
}

// Register appends a checker to the chain. Thread-safe. Call from plugin init.
// Checkers registered later have lower priority than those registered earlier.
func (e *EntitlementEvaluator) Register(c FeatureChecker) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.chain = append(e.chain, c)
}

// Check returns the full AccessResult for featureID.
// Use when the UI needs contextual tier information for upgrade prompts.
func (e *EntitlementEvaluator) Check(ctx context.Context, featureID license.FeatureID) license.AccessResult {
	e.mu.RLock()
	chain := make([]FeatureChecker, len(e.chain))
	copy(chain, e.chain)
	e.mu.RUnlock()

	for _, checker := range chain {
		result, handled := checker.Check(ctx, featureID)
		if handled {
			return result
		}
	}
	// Default deny when no checker claims ownership.
	return license.AccessResult{
		Allowed: false,
		Code:    license.ErrCodeTierRequired,
	}
}

// CanUse is a convenience bool wrapper over Check (context.Background).
// Use for simple gates; use Check when you need the full AccessResult.
func (e *EntitlementEvaluator) CanUse(featureID license.FeatureID) bool {
	return e.Check(context.Background(), featureID).Allowed
}

// ---------------------------------------------------------------------------
// LicenseChecker — delegates to LicenseService. Base checker for all tiers.
// ---------------------------------------------------------------------------

// LicenseChecker reads the license state to determine feature access.
// It populates AccessResult.RequiredTier from the capability map so the UI
// can show contextual upgrade prompts without a separate RPC call.
type LicenseChecker struct {
	getLicense func() license.Entitlements
}

// requiredTierer is implemented by an entitlement source that can say which
// tier enables a feature the plan lacks.
type requiredTierer interface {
	RequiredTier(license.FeatureID) license.Tier
}

// NewLicenseChecker creates a LicenseChecker using the provided getter.
func NewLicenseChecker(getLicense func() license.Entitlements) *LicenseChecker {
	return &LicenseChecker{getLicense: getLicense}
}

func (c *LicenseChecker) Check(_ context.Context, featureID license.FeatureID) (license.AccessResult, bool) {
	svc := c.getLicense()
	if svc == nil {
		return license.AccessResult{Allowed: false, Code: license.ErrCodeTierRequired}, true
	}
	if svc.CanUse(featureID) {
		return license.AccessResult{Allowed: true, Code: license.ErrCodeOK}, true
	}
	// Feature is disabled: ask which tier enables it, if the source knows.
	var requiredTier license.Tier
	if source, ok := svc.(requiredTierer); ok {
		requiredTier = source.RequiredTier(featureID)
	}
	return license.AccessResult{
		Allowed:      false,
		Code:         license.ErrCodeTierRequired,
		RequiredTier: requiredTier,
	}, true
}
