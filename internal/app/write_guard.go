// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"errors"
	"strings"

	dbpkg "zentro/internal/db"
)

// errProductionUnlockUnavailable is returned when no installed guard can
// unlock production writes (a build without the paid protection layers).
var errProductionUnlockUnavailable = errors.New("production write unlock is not available")

// WriteGuardInput is what a write guard knows about the query being checked.
type WriteGuardInput struct {
	Query          string
	EnvironmentKey string
	IsProduction   bool
	Risk           dbpkg.SQLRisk
}

// WriteGuard adds protection layers to a query preflight.
//
// Core owns the chain (App.PreflightQuery) and the free baseline: risk
// classification, the production overlay, the affected-rows preview and the
// schema snapshot. A guard fills in only the layers it owns, so the core never
// has to know which layers are paid; a build that installs no guard simply
// has no extra layers.
type WriteGuard interface {
	Apply(in WriteGuardInput, result *QueryPreflightResult)
}

// ProductionUnlocker is implemented by a guard that can open a short
// production-write window (the unlock the preflight asks for).
type ProductionUnlocker interface {
	UnlockProductionWrites(environmentKey string) (ProductionWriteUnlockState, error)
}

// writeGuardFactories are the guards a build adds, in registration order. A
// file that belongs to a paid edition (pro_*.go, ADR 0019) registers one from
// init(); a tree without those files registers none and the preflight reports
// only the free baseline. It is filled while packages initialise and only read
// afterwards, so it needs no lock.
var writeGuardFactories []func(*App) WriteGuard

func registerWriteGuard(factory func(*App) WriteGuard) {
	writeGuardFactories = append(writeGuardFactories, factory)
}

// writeGuardChain returns the installed guards. It is built on first use, from
// the App itself, so an App assembled without NewApp (as the preflight tests
// do) still has its guards.
func (a *App) writeGuardChain() []WriteGuard {
	a.writeGuardsOnce.Do(func() {
		for _, factory := range writeGuardFactories {
			a.writeGuards = append(a.writeGuards, factory(a))
		}
	})
	return a.writeGuards
}

func (a *App) applyWriteGuards(in WriteGuardInput, result *QueryPreflightResult) {
	for _, guard := range a.writeGuardChain() {
		guard.Apply(in, result)
	}
}

// UnlockProductionWrites opens the production-write window through whichever
// installed guard offers one.
func (a *App) UnlockProductionWrites(environmentKey string) (ProductionWriteUnlockState, error) {
	envKey := strings.TrimSpace(environmentKey)
	if envKey == "" {
		envKey = string(a.currentProjectEnvironmentKey())
	}
	for _, guard := range a.writeGuardChain() {
		if unlocker, ok := guard.(ProductionUnlocker); ok {
			return unlocker.UnlockProductionWrites(envKey)
		}
	}
	return ProductionWriteUnlockState{}, errProductionUnlockUnavailable
}
