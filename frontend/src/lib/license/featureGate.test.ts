// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { FEATURE } from './entitlementMatrix';
import { FeatureGate } from './featureGate';
import { createLicenseState, type LicenseState } from './types';

const LICENSE_ONLINE_REFRESH_FEATURE_ID = 'license.online.refresh';

const activeState: LicenseState = createLicenseState({
    status: 'active',
    tier: 'pro',
    entitlements: [
        { featureId: FEATURE.PLUGIN_UI_COMMANDS, enabled: true },
        { featureId: LICENSE_ONLINE_REFRESH_FEATURE_ID, enabled: false },
    ],
    capabilities: {
        [FEATURE.PLUGIN_UI_COMMANDS]: { enabled: true },
        [LICENSE_ONLINE_REFRESH_FEATURE_ID]: { enabled: false },
    },
});

describe('FeatureGate', () => {
    it('allows entitlement when license is active', () => {
        const gate = new FeatureGate(activeState);
        expect(gate.canUse(FEATURE.PLUGIN_UI_COMMANDS)).toBe(true);
        expect(gate.canUse(LICENSE_ONLINE_REFRESH_FEATURE_ID)).toBe(false);
    });

    it('uses matrix defaults when entitlement is missing', () => {
        const gate = new FeatureGate({
            ...activeState,
            status: 'inactive',
            tier: 'free',
            entitlements: [],
        });
        expect(gate.canUse(FEATURE.SCHEMA_DIFF_BASIC)).toBe(true);
        expect(gate.canUse(FEATURE.QUERY_ADVANCED_AI_ASSIST)).toBe(true);
        expect(gate.canUse(FEATURE.SECURITY_APP_LOCK)).toBe(false);
    });

    it('reads limits from the normalized limit map', () => {
        const gate = new FeatureGate(
            createLicenseState({
                limits: [{ id: 'max_projects', value: 5 }],
                limitMap: { max_projects: 5 },
            }),
        );

        expect(gate.getLimit('max_projects')).toBe(5);
        expect(gate.projectLimit).toBe(5);
        expect(gate.hasUnlimitedProjects).toBe(false);
        expect(gate.getProjectUsageLabel(3)).toBe('3 / 5 projects used');
    });

    it('returns upgrade UI access metadata for pro-only features on free', () => {
        const gate = new FeatureGate(
            createLicenseState({
                status: 'inactive',
                tier: 'free',
            }),
        );

        expect(gate.getFeatureAccess(FEATURE.SECURITY_APP_LOCK)).toEqual({
            state: 'upgrade',
            badgeLabel: 'Pro',
            helperText: 'Upgrade to unlock this feature.',
            ctaLabel: 'Unlock in Pro',
        });
    });

    it('returns project-limit UI access metadata when the cap is reached', () => {
        const gate = new FeatureGate(
            createLicenseState({
                limits: [{ id: 'max_projects', value: 5 }],
                limitMap: { max_projects: 5 },
            }),
        );

        expect(gate.getProjectLimitAccess(5)).toEqual({
            state: 'upgrade',
            badgeLabel: 'Pro',
            helperText: 'Free includes up to 5 projects on this installation.',
            ctaLabel: 'Unlock unlimited projects',
        });
        expect(gate.isProjectLimitReached(5)).toBe(true);
    });
});
