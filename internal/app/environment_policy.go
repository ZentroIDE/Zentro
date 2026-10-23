// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"

	"zentro/internal/constant"
	"zentro/internal/models"
	"zentro/internal/utils"
)

// ExecutionPolicy is the resolved policy bundle for one environment: the
// Safety Level plus everything derived from it. Resolved by the backend;
// the frontend only renders it (ADR-0008).
type ExecutionPolicy struct {
	TimeoutSeconds        int    `json:"timeout_seconds"`
	RowCapPerTab          int    `json:"row_cap_per_tab"`
	DestructiveRules      string `json:"destructive_rules"`
	EnvironmentStrictness string `json:"environment_strictness"` // "strict" | "normal"
	SafetyLevel           string `json:"safety_level"`           // "strict" | "balanced" | "relaxed"
	IsProduction          bool   `json:"is_production"`
	Locked                bool   `json:"locked"` // Safety Floor: production cannot be lowered
}

// Safety-level values are owned by internal/constant (wire-paired with the
// frontend); aliased here so the many package-local references stay short.
const (
	SafetyLevelStrict   = constant.SafetyLevelStrict
	SafetyLevelBalanced = constant.SafetyLevelBalanced
	SafetyLevelRelaxed  = constant.SafetyLevelRelaxed
)

var defaultEnvironmentSafetyLevels = map[models.EnvironmentKey]string{
	models.EnvironmentDevelopment: SafetyLevelBalanced,
	models.EnvironmentStaging:     SafetyLevelStrict,
	models.EnvironmentProduction:  SafetyLevelStrict,
}

func normalizeEnvironmentKey(envKey string) string {
	return strings.ToLower(strings.TrimSpace(envKey))
}

// environmentIsProduction is the Production identity predicate. Production
// ceremonies (unlock, type-to-confirm, cooldown, reason, pre-DDL snapshot)
// key off this, never off Safety Level.
func environmentIsProduction(envKey string) bool {
	return normalizeEnvironmentKey(envKey) == string(models.EnvironmentProduction)
}

func isKnownEnvironmentKey(envKey string) bool {
	_, ok := defaultEnvironmentSafetyLevels[models.EnvironmentKey(envKey)]
	return ok
}

func isValidSafetyLevel(level string) bool {
	switch level {
	case SafetyLevelStrict, SafetyLevelBalanced, SafetyLevelRelaxed:
		return true
	}
	return false
}

// resolveSafetyLevel answers the Safety Level for an environment from
// preferences, applying defaults and the Safety Floor: production is always
// strict, even if a tampered config file says otherwise.
func resolveSafetyLevel(prefs utils.Preferences, envKey string) string {
	key := normalizeEnvironmentKey(envKey)
	if environmentIsProduction(key) {
		return SafetyLevelStrict
	}
	if stored, ok := prefs.EnvironmentSafetyLevels[key]; ok && isValidSafetyLevel(stored) {
		return stored
	}
	if def, ok := defaultEnvironmentSafetyLevels[models.EnvironmentKey(key)]; ok {
		return def
	}
	return SafetyLevelBalanced
}

func resolveExecutionPolicy(prefs utils.Preferences, envKey string) ExecutionPolicy {
	level := resolveSafetyLevel(prefs, envKey)
	isProd := environmentIsProduction(envKey)

	rowCap, timeout := 100000, 60
	switch {
	case level == SafetyLevelStrict && isProd:
		rowCap, timeout = 50000, 45
	case level == SafetyLevelStrict:
		rowCap, timeout = 75000, 60
	case level == SafetyLevelRelaxed:
		rowCap, timeout = 120000, 90
	}
	if prefs.QueryTimeout > 0 {
		timeout = prefs.QueryTimeout
	}

	strictness := constant.EnvironmentStrictnessNormal
	if level == SafetyLevelStrict {
		strictness = constant.EnvironmentStrictnessStrict
	}

	return ExecutionPolicy{
		TimeoutSeconds:        timeout,
		RowCapPerTab:          rowCap,
		DestructiveRules:      "prompt",
		EnvironmentStrictness: strictness,
		SafetyLevel:           level,
		IsProduction:          isProd,
		Locked:                isProd,
	}
}

// EnvironmentPolicyService owns per-environment Safety Level assignments and
// resolves Execution Policies. All environment strictness/production
// predicates in the app converge here (ADR-0008).
type EnvironmentPolicyService struct {
	getPrefs func() utils.Preferences
	setPrefs func(utils.Preferences) error
}

func NewEnvironmentPolicyService(
	getPrefs func() utils.Preferences,
	setPrefs func(utils.Preferences) error,
) *EnvironmentPolicyService {
	return &EnvironmentPolicyService{getPrefs: getPrefs, setPrefs: setPrefs}
}

func (s *EnvironmentPolicyService) Resolve(envKey string) ExecutionPolicy {
	return resolveExecutionPolicy(s.getPrefs(), envKey)
}

func (s *EnvironmentPolicyService) ResolveAll() map[string]ExecutionPolicy {
	prefs := s.getPrefs()
	policies := make(map[string]ExecutionPolicy, len(defaultEnvironmentSafetyLevels))
	for key := range defaultEnvironmentSafetyLevels {
		policies[string(key)] = resolveExecutionPolicy(prefs, string(key))
	}
	return policies
}

// SetLevel assigns a Safety Level to an environment and persists it.
// The Safety Floor rejects lowering production below strict.
func (s *EnvironmentPolicyService) SetLevel(envKey, level string) (map[string]ExecutionPolicy, error) {
	key := normalizeEnvironmentKey(envKey)
	if !isKnownEnvironmentKey(key) {
		return nil, fmt.Errorf("unknown environment key %q", envKey)
	}
	if !isValidSafetyLevel(level) {
		return nil, fmt.Errorf("unknown safety level %q", level)
	}
	if environmentIsProduction(key) && level != SafetyLevelStrict {
		return nil, fmt.Errorf("safety floor: production is always strict and cannot be lowered")
	}

	prefs := s.getPrefs()
	levels := make(map[string]string, len(prefs.EnvironmentSafetyLevels)+1)
	for k, v := range prefs.EnvironmentSafetyLevels {
		levels[k] = v
	}
	levels[key] = level
	prefs.EnvironmentSafetyLevels = levels
	if err := s.setPrefs(prefs); err != nil {
		return nil, err
	}
	return s.ResolveAll(), nil
}
