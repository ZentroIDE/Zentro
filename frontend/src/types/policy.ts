// SPDX-License-Identifier: GPL-3.0-only

// Execution Policy — the resolved safety bundle for one environment.
// Resolved by the backend (EnvironmentPolicyService, ADR-0008); the frontend
// only renders it. See CONTEXT.md for the domain terms.

import { ENVIRONMENT_STRICTNESS, SAFETY_LEVEL } from '../lib/constants';

export type SafetyLevel = (typeof SAFETY_LEVEL)[keyof typeof SAFETY_LEVEL];
export type EnvironmentStrictness =
    (typeof ENVIRONMENT_STRICTNESS)[keyof typeof ENVIRONMENT_STRICTNESS];

export interface ExecutionPolicy {
    timeoutSeconds: number;
    rowCapPerTab: number;
    destructiveRules: 'prompt' | 'block';
    environmentStrictness: EnvironmentStrictness;
    safetyLevel: SafetyLevel;
    isProduction: boolean;
    /** Safety Floor: production's level cannot be lowered. */
    locked: boolean;
}
