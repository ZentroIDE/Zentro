// SPDX-License-Identifier: GPL-3.0-only

package license

import "testing"

// The core asks only this interface, so the local plan must be a complete
// answer on its own: a tree with no license service has nothing else.
func TestLocalEntitlementsAnswerWithoutAnyLicenseService(t *testing.T) {
	local := NewLocalEntitlements()

	if !local.CanUse(FeatureQueryExecuteBasic) {
		t.Error("a registered free feature must be on")
	}
	if local.CanUse("no.such.feature") {
		t.Error("a feature nobody registered must be off")
	}
	if got := local.GetLimitValue(LimitMaxProjects); got >= 0 {
		t.Errorf("nothing is limited locally, got %d", got)
	}
	if plan := local.Plan(); plan.Tier != TierFree || plan.Status != StatusInactive || plan.InstallationID != "" {
		t.Errorf("plan = %+v, want a free, inactive plan with no installation", plan)
	}
	if err := local.RecordFeatureUsage(FeatureQueryExecuteBasic); err != nil {
		t.Errorf("recording usage locally must be a no-op, got %v", err)
	}
}

// Only features registered as free are on locally: a paid one must stay off
// even though the local plan has no way to buy it.
func TestLocalEntitlementsKeepPaidFeaturesOff(t *testing.T) {
	local := NewLocalEntitlements()
	for _, def := range RegisteredFeatures() {
		if got, want := local.CanUse(def.ID), def.MinTier == TierFree; got != want {
			t.Errorf("%s: CanUse = %v, want %v (min tier %q)", def.ID, got, want, def.MinTier)
		}
	}
}
