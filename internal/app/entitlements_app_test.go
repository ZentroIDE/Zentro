// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/extensions/license"
)

func localApp() *App {
	return &App{svc: Services{License: license.NewLocalEntitlements()}}
}

// A build with no license service still runs the preflight: the free baseline
// does not depend on any plan.
func TestPreflightRunsOnLocalEntitlements(t *testing.T) {
	useTempQueryPreflightConfigDir(t)
	app := withGuards(localApp())

	result, err := app.PreflightQuery("DROP TABLE users;", "pro")
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	if result.RiskLevel != "danger" || !result.SnapshotRequired {
		t.Errorf("the free baseline did not run: %+v", result)
	}
}

// The project cap is a plan limit; the local plan has none.
func TestLocalEntitlementsNeverCapProjects(t *testing.T) {
	atCap, err := localApp().isAtFreeTierProjectCap()
	if err != nil || atCap {
		t.Fatalf("isAtFreeTierProjectCap = %v, %v; want false, nil", atCap, err)
	}
}
