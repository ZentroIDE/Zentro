// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../../shared/kernel';
import type { WriteGuardNotice } from '../../../lib/writeSafety/useWriteSafetyGuard';
import type { ResultPanelSaveFlowDeps } from './types';

const mocks = vi.hoisted(() => ({
    executeUpdateSync: vi.fn(),
    executePinnedUpdateSync: vi.fn(),
}));

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        query: {
            executeUpdateSync: mocks.executeUpdateSync,
            executePinnedUpdateSync: mocks.executePinnedUpdateSync,
        },
    }),
}));

import { useResultPanelSaveFlow } from './useResultPanelSaveFlow';

function makeDeps(overrides: Partial<ResultPanelSaveFlowDeps> = {}): ResultPanelSaveFlowDeps {
    return {
        tabId: 'tab-1',
        result: undefined,
        viewMode: false,
        hasPendingChanges: true,
        generatePendingScript: () => 'DELETE FROM users WHERE id = 1;',
        guardSql: vi.fn().mockResolvedValue({ allowed: true }),
        resolveDeleteNotice: vi.fn().mockResolvedValue(null),
        onReloadResult: vi.fn(),
        handleDirectExecute: vi.fn(async runner => {
            await runner('');
            return true;
        }),
        toast: { error: vi.fn() },
        ...overrides,
    };
}

const notice: WriteGuardNotice = { content: () => null };

describe('useResultPanelSaveFlow relationship notice', () => {
    beforeEach(() => {
        mocks.executeUpdateSync.mockReset().mockResolvedValue(ok(1));
        mocks.executePinnedUpdateSync.mockReset().mockResolvedValue(ok(1));
    });

    it('works out the notice first and hands it to the one write confirmation', async () => {
        const order: string[] = [];
        const deps = makeDeps({
            resolveDeleteNotice: vi.fn(async () => {
                order.push('notice');
                return notice;
            }),
            guardSql: vi.fn(async () => {
                order.push('guard');
                return { allowed: true };
            }),
        });
        const { result } = renderHook(() => useResultPanelSaveFlow(deps));

        await act(async () => {
            await result.current.handleSaveRequest();
        });

        expect(order).toEqual(['notice', 'guard']);
        expect(deps.guardSql).toHaveBeenCalledWith('DELETE FROM users WHERE id = 1;', 'Execute', {
            notice,
        });
        expect(mocks.executeUpdateSync).toHaveBeenCalledTimes(1);
    });

    it('guards as it always did when nothing references the deleted rows', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useResultPanelSaveFlow(deps));

        await act(async () => {
            await result.current.handleSaveRequest();
        });

        expect(deps.guardSql).toHaveBeenCalledWith(
            'DELETE FROM users WHERE id = 1;',
            'Execute',
            undefined,
        );
        expect(mocks.executeUpdateSync).toHaveBeenCalledTimes(1);
    });

    it('stops without executing or reloading when the user backs out of the confirmation', async () => {
        const deps = makeDeps({
            resolveDeleteNotice: vi.fn().mockResolvedValue(notice),
            guardSql: vi.fn().mockResolvedValue({ allowed: false }),
        });
        const { result } = renderHook(() => useResultPanelSaveFlow(deps));

        await act(async () => {
            await result.current.handleSaveRequest();
        });

        expect(mocks.executeUpdateSync).not.toHaveBeenCalled();
        expect(deps.onReloadResult).not.toHaveBeenCalled();
        expect(deps.toast.error).not.toHaveBeenCalled();
    });

    it('reports a declined save to the unsaved-changes banner as not saved', async () => {
        const deps = makeDeps({
            resolveDeleteNotice: vi.fn().mockResolvedValue(notice),
            guardSql: vi.fn().mockResolvedValue({ allowed: false }),
        });
        const { result } = renderHook(() => useResultPanelSaveFlow(deps));

        let saved: boolean | undefined;
        await act(async () => {
            saved = await result.current.saveWithoutReload();
        });

        expect(saved).toBe(false);
    });

    it('does not look for a notice when there is nothing to save', async () => {
        const deps = makeDeps({ generatePendingScript: () => '   ' });
        const { result } = renderHook(() => useResultPanelSaveFlow(deps));

        await act(async () => {
            await result.current.handleSaveRequest();
        });

        expect(deps.resolveDeleteNotice).not.toHaveBeenCalled();
        expect(deps.guardSql).not.toHaveBeenCalled();
    });
});
