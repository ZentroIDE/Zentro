// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const start = vi.fn(async () => ({ ok: true as const, data: undefined }));
const stop = vi.fn(async () => ({ ok: true as const, data: undefined }));

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({ stats: { start, stop } }),
}));

import { useStatsSampler } from './useStatsSampler';
import { useLiveStatsStore } from '../../stores/liveStatsStore';
import { useStatusBarStatsStore } from '../../stores/statusBarStatsStore';

function resetStore() {
    useStatusBarStatsStore.setState({
        enabled: true,
        showLatency: true,
        showNetwork: true,
        showResources: true,
        intervalMs: 2000,
    });
}

describe('useStatsSampler', () => {
    beforeEach(() => {
        start.mockClear();
        stop.mockClear();
        useLiveStatsStore.getState().clear();
        resetStore();
    });

    it('starts the backend sampler at the configured interval', () => {
        renderHook(() => useStatsSampler());
        expect(start).toHaveBeenCalledWith(2000);
    });

    it('restarts with the new interval when it changes', () => {
        renderHook(() => useStatsSampler());
        start.mockClear();

        act(() => useStatusBarStatsStore.getState().setIntervalMs(5000));

        expect(stop).toHaveBeenCalled();
        expect(start).toHaveBeenCalledWith(5000);
    });

    it('stops sampling and drops the last reading when stats are turned off', () => {
        useLiveStatsStore.getState().setSample({
            at: 1,
            latencyMs: 5,
            latencyState: 'ok',
            rxBytesPerSec: 0,
            txBytesPerSec: 0,
            cpuPercent: 0,
            memBytes: 0,
        });
        renderHook(() => useStatsSampler());
        start.mockClear();

        act(() => useStatusBarStatsStore.getState().setEnabled(false));

        expect(stop).toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
        expect(useLiveStatsStore.getState().sample).toBeNull();
    });

    it('does not run when every individual stat is hidden', () => {
        renderHook(() => useStatsSampler());
        start.mockClear();

        act(() => {
            const s = useStatusBarStatsStore.getState();
            s.setShowLatency(false);
            s.setShowNetwork(false);
            s.setShowResources(false);
        });

        expect(start).not.toHaveBeenCalled();
        expect(stop).toHaveBeenCalled();
    });

    it('stops the sampler when the app unmounts', () => {
        const { unmount } = renderHook(() => useStatsSampler());
        stop.mockClear();
        unmount();
        expect(stop).toHaveBeenCalled();
    });
});
