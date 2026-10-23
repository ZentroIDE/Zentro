// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"

	"zentro/internal/extensions/license"
)

// CheckFeatureAccess returns the full access result for featureID.
// Use when the UI needs contextual tier information for upgrade prompts.
// For bulk capability checks, read the capabilities map from GetLicenseState() instead.
func (a *App) CheckFeatureAccess(featureID string) license.AccessResult {
	return a.eval.Check(context.Background(), license.FeatureID(featureID))
}
