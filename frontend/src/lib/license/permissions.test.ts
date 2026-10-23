// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { FeatureGate } from './featureGate';
import { createLicenseState } from './types';
import { checkPermission } from './permissions';

describe('checkPermission', () => {
    it('allows query.execute with default free license', () => {
        const gate = new FeatureGate(createLicenseState());
        const result = checkPermission(gate, 'query.execute');
        expect(result.allowed).toBe(true);
    });

    it('blocks security.app-lock with default free license', () => {
        const gate = new FeatureGate(createLicenseState());
        const result = checkPermission(gate, 'security.app-lock');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeTruthy();
    });

    it('allows security.app-lock with active pro license', () => {
        const gate = new FeatureGate(
            createLicenseState({
                status: 'active',
                tier: 'pro',
                capabilities: {
                    'security.app_lock': { enabled: true },
                },
            }),
        );
        const result = checkPermission(gate, 'security.app-lock');
        expect(result.allowed).toBe(true);
    });

    it('blocks admin.settings with pro license', () => {
        const gate = new FeatureGate(
            createLicenseState({
                status: 'active',
                tier: 'pro',
            }),
        );
        const result = checkPermission(gate, 'admin.settings');
        expect(result.allowed).toBe(false);
    });

    it('returns expected featureId for each permission', () => {
        const gate = new FeatureGate(createLicenseState());
        expect(checkPermission(gate, 'query.execute').featureId).toBe('query.execute.basic');
        expect(checkPermission(gate, 'security.pii-detection').featureId).toBe(
            'security.pii_detection',
        );
    });
});
