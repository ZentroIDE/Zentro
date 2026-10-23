// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"errors"
	"reflect"
	"testing"

	"zentro/internal/extensions/license"
)

func freeApp(t *testing.T) *App {
	t.Helper()
	return &App{svc: Services{License: license.NewLocalEntitlements()}}
}

// withGuards installs a fixed guard chain, as a build with different guards
// would.
func withGuards(a *App, guards ...WriteGuard) *App {
	a.writeGuardsOnce.Do(func() { a.writeGuards = guards })
	return a
}

type writeGuardFunc func(WriteGuardInput, *QueryPreflightResult)

func (f writeGuardFunc) Apply(in WriteGuardInput, r *QueryPreflightResult) { f(in, r) }

// A build that installs no guard has the free baseline and nothing else: no
// paid layer, no prompt, no upsell.
func TestPreflightWithoutGuardsHasOnlyTheFreeBaseline(t *testing.T) {
	app := withGuards(freeApp(t))

	result, err := app.PreflightQuery("DROP TABLE users;", "pro")
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}

	if result.RiskLevel != "danger" {
		t.Errorf("the free risk classification must still run, got %q", result.RiskLevel)
	}
	if !result.SnapshotRequired {
		t.Error("the schema snapshot is free and must still be required before DDL on production")
	}
	if result.RequiresPro || result.RequiresProductionUnlock || result.RequiresTypeToConfirm ||
		result.RequiresCooldown || result.RequiresReason {
		t.Errorf("no guard is installed, yet a protection layer is required: %+v", result)
	}
	if result.CooldownSeconds != 0 || result.ProductionUnlock != (ProductionWriteUnlockState{}) {
		t.Errorf("guard-owned fields must stay empty without a guard: %+v", result)
	}
	wantLayers := []string{string(license.FeatureRecoverySchemaSnapshot)}
	if !reflect.DeepEqual(result.UsedProtectionLayers, wantLayers) {
		t.Errorf("layers = %v, want only the free ones %v", result.UsedProtectionLayers, wantLayers)
	}
}

func TestUnlockProductionWritesWithoutAGuardIsUnavailable(t *testing.T) {
	app := withGuards(freeApp(t))
	if _, err := app.UnlockProductionWrites("pro"); !errors.Is(err, errProductionUnlockUnavailable) {
		t.Fatalf("expected errProductionUnlockUnavailable, got %v", err)
	}
}

// Guards are chained: the core runs every installed guard, in order, and a
// guard only touches what it owns.
func TestPreflightRunsEveryInstalledGuardInOrder(t *testing.T) {
	var seen []string
	record := func(name string) WriteGuard {
		return writeGuardFunc(func(in WriteGuardInput, r *QueryPreflightResult) {
			seen = append(seen, name+":"+in.EnvironmentKey)
			r.UsedProtectionLayers = append(r.UsedProtectionLayers, name)
		})
	}
	app := withGuards(freeApp(t), record("first"), record("second"))

	result, err := app.PreflightQuery("DELETE FROM users WHERE id = 1;", "pro")
	if err != nil {
		t.Fatalf("preflight failed: %v", err)
	}
	if !reflect.DeepEqual(seen, []string{"first:pro", "second:pro"}) {
		t.Errorf("guards ran as %v", seen)
	}
	if len(result.UsedProtectionLayers) < 2 || result.UsedProtectionLayers[0] != "first" || result.UsedProtectionLayers[1] != "second" {
		t.Errorf("layers = %v", result.UsedProtectionLayers)
	}
}

// A guard registered by a file in the tree is built once per App and reaches
// the chain; the registry is what lets a tree without those files have none.
func TestRegisteredGuardsReachTheChain(t *testing.T) {
	saved := writeGuardFactories
	t.Cleanup(func() { writeGuardFactories = saved })
	writeGuardFactories = nil
	registerWriteGuard(func(*App) WriteGuard { return writeGuardFunc(func(WriteGuardInput, *QueryPreflightResult) {}) })
	registerWriteGuard(func(*App) WriteGuard { return writeGuardFunc(func(WriteGuardInput, *QueryPreflightResult) {}) })

	app := freeApp(t)
	if got := len(app.writeGuardChain()); got != 2 {
		t.Fatalf("the chain has %d guards, want 2", got)
	}
	if got := len(app.writeGuardChain()); got != 2 {
		t.Fatalf("a second read built the chain again: %d guards", got)
	}
}

func TestNoRegisteredGuardsMeansAnEmptyChain(t *testing.T) {
	saved := writeGuardFactories
	t.Cleanup(func() { writeGuardFactories = saved })
	writeGuardFactories = nil

	if got := len(freeApp(t).writeGuardChain()); got != 0 {
		t.Fatalf("expected no guards, got %d", got)
	}
}
