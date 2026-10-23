// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLicenseState, type LicenseState } from './types';

const mockGetLicenseState = vi.fn();

vi.mock('./service', () => ({
    getLicenseState: () => mockGetLicenseState(),
    LICENSE_STATE_CHANGED_EVENT: 'zentro:license-state-changed',
}));

import { useFeatureGate } from './useFeatureGate';
import { FeatureGate } from './featureGate';

const activeProState: LicenseState = createLicenseState({
    status: 'active',
    tier: 'pro',
    entitlements: [{ featureId: 'demo-feature', enabled: true }],
    capabilities: { 'demo-feature': { enabled: true } },
});

describe('useFeatureGate', () => {
    beforeEach(() => {
        mockGetLicenseState.mockReset();
    });

    it('returns a FeatureGate instance with the FALLBACK_STATE before load', () => {
        // Pending promise so the effect resolves after the synchronous render.
        mockGetLicenseState.mockReturnValue(new Promise(() => {}));
        const { result } = renderHook(() => useFeatureGate());

        expect(result.current).toBeInstanceOf(FeatureGate);
        expect(result.current.hasFullAccess).toBe(false);
    });

    it('updates the gate after getLicenseState resolves with ok=true', async () => {
        mockGetLicenseState.mockResolvedValue({ ok: true, data: activeProState });
        const { result } = renderHook(() => useFeatureGate());

        await waitFor(() => expect(result.current.hasFullAccess).toBe(true));
        expect(result.current.isPro).toBe(true);
    });

    it('ignores ok=false results', async () => {
        mockGetLicenseState.mockResolvedValue({ ok: false, error: 'boom' });
        const { result } = renderHook(() => useFeatureGate());

        // Give the microtask queue a tick to settle, then assert no upgrade.
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.hasFullAccess).toBe(false);
    });

    it('ignores the result if the hook unmounted before the promise resolved', async () => {
        let resolvePromise: ((value: { ok: true; data: LicenseState }) => void) | null = null;
        mockGetLicenseState.mockReturnValue(
            new Promise(resolve => {
                resolvePromise = resolve;
            }),
        );

        const { result, unmount } = renderHook(() => useFeatureGate());
        unmount();

        // Resolve after unmount — there's no rerender after unmount, so we just
        // assert no throw and that the captured result reference is unchanged.
        const beforeResolve = result.current;
        await act(async () => {
            resolvePromise?.({ ok: true, data: activeProState });
            await Promise.resolve();
        });
        expect(result.current).toBe(beforeResolve);
        expect(beforeResolve.hasFullAccess).toBe(false);
    });

    it('refreshes when the license-state-changed event is dispatched', async () => {
        mockGetLicenseState
            .mockResolvedValueOnce({
                ok: true,
                data: {
                    ...activeProState,
                    status: 'inactive',
                    tier: 'free',
                    entitlements: [],
                },
            })
            .mockResolvedValueOnce({ ok: true, data: activeProState });

        const { result } = renderHook(() => useFeatureGate());

        await waitFor(() => expect(result.current.hasFullAccess).toBe(false));

        await act(async () => {
            window.dispatchEvent(new Event('zentro:license-state-changed'));
            await Promise.resolve();
        });

        await waitFor(() => expect(result.current.hasFullAccess).toBe(true));
    });

    it('keeps pro access when a verified cached entitlement is returned', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'active',
                tier: 'pro',
                entitlements: [{ featureId: 'demo-feature', enabled: true }],
                capabilities: { 'demo-feature': { enabled: true } },
                offlineGraceUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                signature: {
                    verified: true,
                    source: 'signed',
                    keyId: 'entitlement-v1',
                },
            }),
        });

        const { result } = renderHook(() => useFeatureGate());

        await waitFor(() => expect(result.current.hasFullAccess).toBe(true));
        expect(result.current.isPro).toBe(true);
    });

    it('falls back to free access when an expired cached state is returned', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'error',
                tier: 'free',
                offlineGraceUntil: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                signature: {
                    verified: false,
                    source: 'signed',
                    reason: 'offline grace expired',
                },
            }),
        });

        const { result } = renderHook(() => useFeatureGate());

        await waitFor(() => expect(result.current.hasFullAccess).toBe(false));
        expect(result.current.isPro).toBe(false);
    });
});
