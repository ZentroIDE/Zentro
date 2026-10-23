// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ok, fail } from '../../shared/kernel/result';
import { requirePermission, resetPermissionGate, setPermissionGate } from './requirePermission';
import { FeatureGate } from './featureGate';
import { createLicenseState } from './types';

describe('requirePermission', () => {
    beforeEach(() => {
        resetPermissionGate();
    });

    it('allows execution when permission is granted', async () => {
        setPermissionGate(
            new FeatureGate(
                createLicenseState({
                    status: 'active',
                    tier: 'pro',
                    capabilities: {
                        'security.app_lock': { enabled: true },
                    },
                }),
            ),
        );

        const fn = vi.fn().mockResolvedValue(ok('executed'));
        const wrapped = requirePermission('security.app-lock', 'LOCK', 'denied')(fn);
        const result = await wrapped('arg1');

        expect(result).toEqual({ ok: true, data: 'executed' });
        expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('blocks execution when permission is denied', async () => {
        setPermissionGate(new FeatureGate(createLicenseState()));

        const fn = vi.fn();
        const wrapped = requirePermission('security.app-lock', 'LOCK', 'App lock unavailable')(fn);
        const result = await wrapped('arg1');

        expect(result).toEqual({
            ok: false,
            error: expect.objectContaining({
                code: 'LOCK',
                message: expect.any(String),
                context: expect.objectContaining({
                    permission: 'security.app-lock',
                }),
            }),
        });
        expect(fn).not.toHaveBeenCalled();
    });

    it('falls back to default license when no gate is set', async () => {
        resetPermissionGate();

        const fn = vi.fn().mockResolvedValue(ok('ok'));
        const wrapped = requirePermission('query.execute', 'QUERY', 'denied')(fn);
        const result = await wrapped();

        expect(result).toEqual({ ok: true, data: 'ok' });
        expect(fn).toHaveBeenCalled();
    });
});
