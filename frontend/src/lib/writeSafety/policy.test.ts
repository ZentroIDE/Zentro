// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { isMutatingSql, resolveExecutionPolicy, resolveQueryPolicy } from './policy';
import { useSettingsStore } from '../../stores/settingsStore';

describe('query policy', () => {
    it('detects mutating statements', () => {
        expect(isMutatingSql('UPDATE users SET a = 1')).toBe(true);
        expect(isMutatingSql('delete from users')).toBe(true);
    });

    it('keeps select as non-mutating', () => {
        expect(isMutatingSql('SELECT * FROM users')).toBe(false);
    });

    it('uses the backend-resolved policy for the environment', () => {
        useSettingsStore.setState({
            queryTimeout: 120,
            viewMode: false,
            environmentPolicies: {
                dev: {
                    timeoutSeconds: 30,
                    rowCapPerTab: 25000,
                    destructiveRules: 'block',
                    environmentStrictness: 'strict',
                    safetyLevel: 'strict',
                    isProduction: false,
                    locked: false,
                },
            },
        });

        const policy = resolveQueryPolicy('dev');
        expect(policy.rowCapPerTab).toBe(25000);
        expect(policy.destructiveRules).toBe('block');
        expect(policy.environmentStrictness).toBe('strict');
        expect(policy.safetyLevel).toBe('strict');
        expect(policy.queryTimeoutSeconds).toBe(120);
    });

    it('falls back to backend-default strictness before policies load', () => {
        useSettingsStore.setState({ environmentPolicies: {}, environmentSafetyLevels: {} });

        const production = resolveExecutionPolicy('pro');
        expect(production.safetyLevel).toBe('strict');
        expect(production.isProduction).toBe(true);
        expect(production.locked).toBe(true);

        const staging = resolveExecutionPolicy('sta');
        expect(staging.safetyLevel).toBe('strict');
        expect(staging.locked).toBe(false);

        const local = resolveExecutionPolicy('dev');
        expect(local.safetyLevel).toBe('balanced');
    });

    it('uses persisted safety levels during startup before policy cache loads', () => {
        useSettingsStore.setState({
            environmentPolicies: {},
            environmentSafetyLevels: {
                dev: 'strict',
                sta: 'relaxed',
            },
        });

        expect(resolveExecutionPolicy('dev').safetyLevel).toBe('strict');
        expect(resolveExecutionPolicy('dev').rowCapPerTab).toBe(75000);
        expect(resolveExecutionPolicy('sta').safetyLevel).toBe('relaxed');
        expect(resolveExecutionPolicy('sta').rowCapPerTab).toBe(120000);
    });
});
