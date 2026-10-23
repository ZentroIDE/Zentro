// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/utils"
)

func newPolicyServiceForTest(initial utils.Preferences) (*EnvironmentPolicyService, *utils.Preferences) {
	prefs := initial
	svc := NewEnvironmentPolicyService(
		func() utils.Preferences { return prefs },
		func(p utils.Preferences) error {
			prefs = p
			return nil
		},
	)
	return svc, &prefs
}

func TestResolveDefaults(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{})

	cases := []struct {
		env          string
		level        string
		isProduction bool
		locked       bool
		rowCap       int
		timeout      int
		strictness   string
	}{
		{"pro", "strict", true, true, 50000, 45, "strict"},
		{"sta", "strict", false, false, 75000, 60, "strict"},
		{"dev", "balanced", false, false, 100000, 60, "normal"},
	}

	for _, tc := range cases {
		got := svc.Resolve(tc.env)
		if got.SafetyLevel != tc.level {
			t.Errorf("%s: SafetyLevel = %q, want %q", tc.env, got.SafetyLevel, tc.level)
		}
		if got.IsProduction != tc.isProduction {
			t.Errorf("%s: IsProduction = %v, want %v", tc.env, got.IsProduction, tc.isProduction)
		}
		if got.Locked != tc.locked {
			t.Errorf("%s: Locked = %v, want %v", tc.env, got.Locked, tc.locked)
		}
		if got.RowCapPerTab != tc.rowCap {
			t.Errorf("%s: RowCapPerTab = %d, want %d", tc.env, got.RowCapPerTab, tc.rowCap)
		}
		if got.TimeoutSeconds != tc.timeout {
			t.Errorf("%s: TimeoutSeconds = %d, want %d", tc.env, got.TimeoutSeconds, tc.timeout)
		}
		if got.EnvironmentStrictness != tc.strictness {
			t.Errorf("%s: EnvironmentStrictness = %q, want %q", tc.env, got.EnvironmentStrictness, tc.strictness)
		}
		if got.DestructiveRules != "prompt" {
			t.Errorf("%s: DestructiveRules = %q, want %q", tc.env, got.DestructiveRules, "prompt")
		}
	}
}

func TestResolveUserTimeoutOverride(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{QueryTimeout: 30})

	for _, env := range []string{"pro", "sta", "dev"} {
		if got := svc.Resolve(env).TimeoutSeconds; got != 30 {
			t.Errorf("%s: TimeoutSeconds = %d, want user override 30", env, got)
		}
	}
}

func TestResolveIsCaseAndSpaceInsensitive(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{})

	got := svc.Resolve(" PRO ")
	if !got.IsProduction || got.SafetyLevel != "strict" {
		t.Errorf("Resolve(\" PRO \") = %+v, want production strict", got)
	}
}

func TestResolveUnknownEnvironmentFallsBackToBalanced(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{})

	for _, env := range []string{"", "qa"} {
		got := svc.Resolve(env)
		if got.SafetyLevel != "balanced" || got.IsProduction {
			t.Errorf("Resolve(%q) = %+v, want balanced non-production", env, got)
		}
	}
}

func TestResolveFloorCoercesTamperedProductionLevel(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{
		EnvironmentSafetyLevels: map[string]string{"pro": "relaxed"},
	})

	got := svc.Resolve("pro")
	if got.SafetyLevel != "strict" || !got.Locked {
		t.Errorf("tampered pro level resolved to %+v, want strict locked", got)
	}
}

func TestSetLevelPersistsAndResolves(t *testing.T) {
	svc, prefs := newPolicyServiceForTest(utils.Preferences{})

	policies, err := svc.SetLevel("sta", "relaxed")
	if err != nil {
		t.Fatalf("SetLevel(sta, relaxed) returned error: %v", err)
	}
	if got := policies["sta"]; got.SafetyLevel != "relaxed" || got.RowCapPerTab != 120000 || got.TimeoutSeconds != 90 {
		t.Errorf("returned sta policy = %+v, want relaxed 120000/90", got)
	}
	if got := svc.Resolve("sta"); got.SafetyLevel != "relaxed" {
		t.Errorf("Resolve(sta) after SetLevel = %q, want relaxed", got.SafetyLevel)
	}
	if prefs.EnvironmentSafetyLevels["sta"] != "relaxed" {
		t.Errorf("persisted level = %q, want relaxed", prefs.EnvironmentSafetyLevels["sta"])
	}
}

func TestSetLevelFloorRejectsLoweringProduction(t *testing.T) {
	svc, prefs := newPolicyServiceForTest(utils.Preferences{})

	if _, err := svc.SetLevel("pro", "balanced"); err == nil {
		t.Fatal("SetLevel(pro, balanced) succeeded, want floor rejection")
	}
	if got := svc.Resolve("pro").SafetyLevel; got != "strict" {
		t.Errorf("Resolve(pro) after rejected SetLevel = %q, want strict", got)
	}
	if _, ok := prefs.EnvironmentSafetyLevels["pro"]; ok {
		t.Error("rejected SetLevel persisted a production level")
	}
}

func TestSetLevelAllowsProductionStrict(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{})

	if _, err := svc.SetLevel("pro", "strict"); err != nil {
		t.Errorf("SetLevel(pro, strict) returned error: %v", err)
	}
}

func TestSetLevelValidatesInput(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{})

	if _, err := svc.SetLevel("bogus", "strict"); err == nil {
		t.Error("SetLevel with unknown environment succeeded, want error")
	}
	if _, err := svc.SetLevel("dev", "bogus"); err == nil {
		t.Error("SetLevel with unknown level succeeded, want error")
	}
}

func TestResolveAllCoversEveryEnvironment(t *testing.T) {
	svc, _ := newPolicyServiceForTest(utils.Preferences{})

	policies := svc.ResolveAll()
	for _, env := range []string{"dev", "sta", "pro"} {
		if _, ok := policies[env]; !ok {
			t.Errorf("ResolveAll missing %q", env)
		}
	}
	if len(policies) != 3 {
		t.Errorf("ResolveAll returned %d entries, want 3", len(policies))
	}
}

func TestEnvironmentIsProduction(t *testing.T) {
	cases := map[string]bool{
		"pro":   true,
		" PRO ": true,
		"sta":   false,
		"":      false,
	}
	for env, want := range cases {
		if got := environmentIsProduction(env); got != want {
			t.Errorf("environmentIsProduction(%q) = %v, want %v", env, got, want)
		}
	}
}
