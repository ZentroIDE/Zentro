// SPDX-License-Identifier: GPL-3.0-only

package app

// Wails facade for environment safety policy. Logic lives in
// environment_policy.go (EnvironmentPolicyService) per ADR-0007/ADR-0008.

func (a *App) GetExecutionPolicy(environmentKey string) ExecutionPolicy {
	return a.svc.Policy.Resolve(environmentKey)
}

func (a *App) GetEnvironmentPolicies() map[string]ExecutionPolicy {
	return a.svc.Policy.ResolveAll()
}

func (a *App) SetEnvironmentSafetyLevel(environmentKey, level string) (map[string]ExecutionPolicy, error) {
	return a.svc.Policy.SetLevel(environmentKey, level)
}
