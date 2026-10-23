// SPDX-License-Identifier: GPL-3.0-only

package license

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// freshRegistry swaps in an empty registry for one test and restores it after.
func freshRegistry(t *testing.T) {
	t.Helper()
	featureMu.Lock()
	prevRegistry, prevIDs := featureRegistry, featureIDs
	featureRegistry, featureIDs = nil, map[FeatureID]struct{}{}
	featureMu.Unlock()
	t.Cleanup(func() {
		featureMu.Lock()
		featureRegistry, featureIDs = prevRegistry, prevIDs
		featureMu.Unlock()
	})
}

func TestRegisterFeaturesRejectsProgrammerErrors(t *testing.T) {
	cases := map[string]func(){
		"empty id":     func() { RegisterFeatures(FeatureDef{MinTier: TierFree}) },
		"unknown tier": func() { RegisterFeatures(FeatureDef{ID: "x.a", MinTier: "gold"}) },
		"duplicate id": func() {
			RegisterFeatures(FeatureDef{ID: "x.dup", MinTier: TierFree})
			RegisterFeatures(FeatureDef{ID: "x.dup", MinTier: TierPro})
		},
	}
	for name, register := range cases {
		t.Run(name, func(t *testing.T) {
			freshRegistry(t)
			defer func() {
				if recover() == nil {
					t.Fatal("expected a panic")
				}
			}()
			register()
		})
	}
}

func TestRegisteredFeaturesAreReturnedInRegistrationOrderAsACopy(t *testing.T) {
	freshRegistry(t)
	RegisterFeatures(FeatureDef{ID: "x.a", MinTier: TierFree}, FeatureDef{ID: "x.b", MinTier: TierFree})

	got := RegisteredFeatures()
	if len(got) != 2 || got[0].ID != "x.a" || got[1].ID != "x.b" {
		t.Fatalf("RegisteredFeatures = %v", got)
	}
	got[0].ID = "x.scribble"
	if again := RegisteredFeatures(); again[0].ID != "x.a" {
		t.Fatal("a caller's write leaked into the registry")
	}
}

// The registry tells anything derived from it when it changes.
func TestRegisterFeaturesNotifiesWhatDerivesFromIt(t *testing.T) {
	freshRegistry(t)
	prev := featuresChanged
	t.Cleanup(func() { featuresChanged = prev })
	calls := 0
	featuresChanged = func() { calls++ }

	RegisterFeatures(FeatureDef{ID: "x.a", MinTier: TierFree}, FeatureDef{ID: "x.b", MinTier: TierFree})
	if calls != 1 {
		t.Fatalf("featuresChanged ran %d times for one RegisterFeatures call, want 1", calls)
	}
}

// Every feature id a file in this directory declares must be in the registry,
// or a plan could silently lose it (and CanUse would answer false for everyone).
func TestEveryFeatureConstantIsRegistered(t *testing.T) {
	registered := map[FeatureID]bool{}
	for _, def := range RegisteredFeatures() {
		registered[def.ID] = true
	}
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	declaration := regexp.MustCompile(`(?m)^\s*Feature\w+\s+FeatureID\s*=\s*"([^"]+)"`)
	found := 0
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range declaration.FindAllStringSubmatch(string(src), -1) {
			found++
			if !registered[FeatureID(m[1])] {
				t.Errorf("feature %q is declared in %s but never registered", m[1], file)
			}
		}
	}
	if found == 0 {
		t.Fatal("found no feature constants; the pattern is out of date")
	}
}
