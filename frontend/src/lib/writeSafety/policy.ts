// SPDX-License-Identifier: GPL-3.0-only

import { useSettingsStore } from '../../stores/settingsStore';
import { ENVIRONMENT_KEY, ENVIRONMENT_STRICTNESS, SAFETY_LEVEL } from '../../lib/constants';
import type { EnvironmentStrictness, ExecutionPolicy, SafetyLevel } from '../../types/policy';
import { analyzeSqlRisk } from './writeSafety';

export interface QueryPolicy {
    queryTimeoutSeconds: number;
    rowCapPerTab: number;
    requireWriteConfirm: boolean;
    destructiveRules: 'prompt' | 'block';
    environmentStrictness: EnvironmentStrictness;
    safetyLevel: SafetyLevel;
}

// Fallback used only before the backend policy cache loads. Mirrors the
// backend defaults' strictness so pro/sta never render weaker than the
// backend enforces (ADR-0008).
function fallbackExecutionPolicy(environmentKey?: string): ExecutionPolicy {
    const isProduction = environmentKey === ENVIRONMENT_KEY.PRODUCTION;
    const storedLevels = useSettingsStore.getState().environmentSafetyLevels || {};
    const storedLevel = environmentKey ? storedLevels[environmentKey] : undefined;
    const effectiveLevel = isProduction
        ? SAFETY_LEVEL.STRICT
        : storedLevel ||
          (environmentKey === ENVIRONMENT_KEY.STAGING
              ? SAFETY_LEVEL.STRICT
              : SAFETY_LEVEL.BALANCED);
    const strict = effectiveLevel === SAFETY_LEVEL.STRICT;
    return {
        timeoutSeconds: isProduction ? 45 : effectiveLevel === SAFETY_LEVEL.RELAXED ? 90 : 60,
        rowCapPerTab: isProduction
            ? 50000
            : strict
              ? 75000
              : effectiveLevel === SAFETY_LEVEL.RELAXED
                ? 120000
                : 100000,
        destructiveRules: 'prompt',
        environmentStrictness: strict
            ? ENVIRONMENT_STRICTNESS.STRICT
            : ENVIRONMENT_STRICTNESS.NORMAL,
        safetyLevel: effectiveLevel,
        isProduction,
        locked: isProduction,
    };
}

export function resolveExecutionPolicy(environmentKey?: string): ExecutionPolicy {
    const policies = useSettingsStore.getState().environmentPolicies;
    return (
        (environmentKey ? policies[environmentKey] : undefined) ||
        fallbackExecutionPolicy(environmentKey)
    );
}

export function resolveQueryPolicy(environmentKey?: string): QueryPolicy {
    const settings = useSettingsStore.getState();
    const policy = resolveExecutionPolicy(environmentKey);
    const timeoutFromSettings = settings.queryTimeout || policy.timeoutSeconds || 60;

    return {
        queryTimeoutSeconds: Math.max(5, timeoutFromSettings),
        rowCapPerTab: Math.max(1000, policy.rowCapPerTab),
        requireWriteConfirm:
            settings.viewMode !== true &&
            (policy.destructiveRules === 'prompt' || policy.destructiveRules === 'block'),
        destructiveRules: policy.destructiveRules,
        environmentStrictness: policy.environmentStrictness,
        safetyLevel: policy.safetyLevel,
    };
}

export function isMutatingSql(sql: string): boolean {
    return analyzeSqlRisk(sql).hasWrite;
}
