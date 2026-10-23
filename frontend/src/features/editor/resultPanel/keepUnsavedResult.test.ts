// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_ID } from '../../../stores/result/types';
import { ok } from '../../../shared/kernel';

const mocks = vi.hoisted(() => ({ copyActiveQuery: vi.fn() }));

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({ query: { copyActiveQuery: mocks.copyActiveQuery } }),
}));

import { useResultStore } from '../../../stores/resultStore';
import { keepUnsavedResult } from './keepUnsavedResult';

function loadResult(tabId: string, { edited }: { edited: boolean }) {
    const store = useResultStore.getState();
    store.initTab(tabId);
    store.appendRows(tabId, ['id'], [['1'], ['2']], 'users', ['id']);
    store.setDone(tabId, 0, 5, true, false);
    if (edited) store.updatePendingState(tabId, new Map([['0:0', 'x']]), new Set(), []);
}

describe('keepUnsavedResult', () => {
    beforeEach(() => {
        mocks.copyActiveQuery.mockReset().mockResolvedValue(ok(true));
        useResultStore.setState({
            results: {},
            projectResults: { [DEFAULT_WORKSPACE_ID]: {} },
            activeProjectId: DEFAULT_WORKSPACE_ID,
            resultEpochs: {},
        } as never);
    });

    it('sets an edited result aside under a kept key and reports it', async () => {
        loadResult('tab-1', { edited: true });

        const key = await keepUnsavedResult('tab-1');

        expect(key).toBe('tab-1::result:kept-1');
        const kept = useResultStore.getState().results['tab-1::result:kept-1'];
        expect(kept.pendingEdits?.size).toBe(1);
        expect(useResultStore.getState().results['tab-1'].pendingEdits?.size).toBe(0);
    });

    it('lets the backend know so the kept result can still page and export', async () => {
        loadResult('tab-1', { edited: true });

        await keepUnsavedResult('tab-1');

        expect(mocks.copyActiveQuery).toHaveBeenCalledWith('tab-1', 'tab-1::result:kept-1');
    });

    it('leaves a clean result alone', async () => {
        loadResult('tab-1', { edited: false });

        const key = await keepUnsavedResult('tab-1');

        expect(key).toBeNull();
        expect(mocks.copyActiveQuery).not.toHaveBeenCalled();
        expect(Object.keys(useResultStore.getState().results)).toEqual(['tab-1']);
    });

    it('does nothing for a tab with no result', async () => {
        expect(await keepUnsavedResult('nothing')).toBeNull();
    });

    it('numbers each kept result after the last', async () => {
        loadResult('tab-1', { edited: true });
        await keepUnsavedResult('tab-1');
        useResultStore
            .getState()
            .updatePendingState('tab-1', new Map([['1:0', 'y']]), new Set(), []);

        const second = await keepUnsavedResult('tab-1');

        expect(second).toBe('tab-1::result:kept-2');
    });

    it('still keeps the result when the backend call fails', async () => {
        mocks.copyActiveQuery.mockRejectedValue(new Error('boom'));
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        loadResult('tab-1', { edited: true });

        const key = await keepUnsavedResult('tab-1');

        expect(key).toBe('tab-1::result:kept-1');
        expect(useResultStore.getState().results['tab-1::result:kept-1']).toBeDefined();
    });

    it('backs out if the edits were saved while the backend call was in flight', async () => {
        loadResult('tab-1', { edited: true });
        mocks.copyActiveQuery.mockImplementation(async () => {
            useResultStore.getState().updatePendingState('tab-1', new Map(), new Set(), []);
            return ok(true);
        });

        const key = await keepUnsavedResult('tab-1');

        expect(key).toBeNull();
        expect(useResultStore.getState().results['tab-1::result:kept-1']).toBeUndefined();
    });
});
