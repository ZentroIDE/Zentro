// SPDX-License-Identifier: GPL-3.0-only

package license

// PlanInfo is what the core shows about the current plan: the AI context tells
// the model which plan is open, and feedback is tied to an installation.
type PlanInfo struct {
	Tier           Tier
	Status         ActivationStatus
	InstallationID string
}

// Entitlements answers what the current plan includes. It is the only thing
// the core asks of the licensing layer, so a tree with no license service
// still builds and runs (LocalEntitlements). A build that sells plans supplies
// a service that checks them with a server; the core cannot tell the two apart.
type Entitlements interface {
	// CanUse reports whether the plan includes the feature.
	CanUse(FeatureID) bool
	// GetLimitValue returns the plan's limit; a negative value means none.
	GetLimitValue(LimitID) int64
	// Plan summarises the plan for display.
	Plan() PlanInfo
	// RecordFeatureUsage tells the licensing layer a feature was used. Local
	// entitlements ignore it.
	RecordFeatureUsage(FeatureID) error
}

// LocalEntitlements is the plan of a tree that has no license service: every
// registered free feature is on, nothing is limited, and nothing leaves the
// machine.
type LocalEntitlements struct{}

// NewLocalEntitlements returns the plan a tree with no license service runs on.
func NewLocalEntitlements() LocalEntitlements { return LocalEntitlements{} }

func (LocalEntitlements) CanUse(id FeatureID) bool {
	for _, def := range RegisteredFeatures() {
		if def.ID == id {
			return def.MinTier == TierFree
		}
	}
	return false
}

func (LocalEntitlements) GetLimitValue(LimitID) int64 { return -1 }

func (LocalEntitlements) Plan() PlanInfo {
	return PlanInfo{Tier: TierFree, Status: StatusInactive}
}

func (LocalEntitlements) RecordFeatureUsage(FeatureID) error { return nil }
