// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';

import { runRowFetch, type RowFetchSnapshot } from './rowFetchRunner';

function makeSource(total: number, batch: number) {
    let loaded = 0;
    const snapshot = (): RowFetchSnapshot => ({
        absEnd: loaded,
        hasMore: loaded < total,
        hasError: false,
    });
    const fetchBatch = vi.fn(async () => {
        loaded = Math.min(total, loaded + batch);
    });
    return { snapshot, fetchBatch };
}

describe('runRowFetch', () => {
    it('fetches whole batches until the target is reached', async () => {
        const { snapshot, fetchBatch } = makeSource(1000, 100);
        const outcome = await runRowFetch({
            target: 250,
            getSnapshot: snapshot,
            fetchBatch,
            isCancelled: () => false,
        });
        expect(outcome).toEqual({ fetched: 300, reason: 'reached' });
        expect(fetchBatch).toHaveBeenCalledTimes(3);
    });

    it('fetches everything for "all" and stops when the result runs out', async () => {
        const { snapshot, fetchBatch } = makeSource(250, 100);
        const outcome = await runRowFetch({
            target: 'all',
            getSnapshot: snapshot,
            fetchBatch,
            isCancelled: () => false,
        });
        expect(outcome).toEqual({ fetched: 250, reason: 'done' });
    });

    it('stops between batches when cancelled', async () => {
        const { snapshot, fetchBatch } = makeSource(1000, 100);
        let cancelled = false;
        const cancellingBatch = vi.fn(async () => {
            await fetchBatch();
            cancelled = true;
        });
        const outcome = await runRowFetch({
            target: 'all',
            getSnapshot: snapshot,
            fetchBatch: cancellingBatch,
            isCancelled: () => cancelled,
        });
        expect(outcome).toEqual({ fetched: 100, reason: 'cancelled' });
        expect(cancellingBatch).toHaveBeenCalledTimes(1);
    });

    it('bails out instead of looping when a batch adds nothing', async () => {
        const outcome = await runRowFetch({
            target: 'all',
            getSnapshot: () => ({ absEnd: 100, hasMore: true, hasError: false }),
            fetchBatch: vi.fn(async () => {}),
            isCancelled: () => false,
        });
        expect(outcome).toEqual({ fetched: 0, reason: 'stalled' });
    });

    it('reports an error from the batch', async () => {
        let loaded = 0;
        const outcome = await runRowFetch({
            target: 'all',
            getSnapshot: () => ({ absEnd: loaded, hasMore: true, hasError: loaded > 0 }),
            fetchBatch: async () => {
                loaded += 100;
            },
            isCancelled: () => false,
        });
        expect(outcome).toEqual({ fetched: 100, reason: 'error' });
    });
});
