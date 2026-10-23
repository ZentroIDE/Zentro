// SPDX-License-Identifier: GPL-3.0-only

/** What the runner needs to know about a tab's loaded rows after each batch. */
export interface RowFetchSnapshot {
    /** Absolute offset one past the last loaded row (windowStartOffset + rows.length). */
    absEnd: number;
    hasMore: boolean;
    hasError: boolean;
}

export type RowFetchStopReason = 'done' | 'reached' | 'cancelled' | 'error' | 'stalled' | 'gone';

export interface RowFetchOutcome {
    fetched: number;
    reason: RowFetchStopReason;
}

/**
 * Repeats single-batch fetches until `target` rows were added (rounded up to whole batches,
 * because the backend pages a fixed size), the result runs out, or something goes wrong.
 * `fetchBatch` must resolve only once that batch has been applied to the store.
 */
export async function runRowFetch(params: {
    target: number | 'all';
    getSnapshot: () => RowFetchSnapshot | null;
    fetchBatch: () => Promise<void>;
    isCancelled: () => boolean;
}): Promise<RowFetchOutcome> {
    const { target, getSnapshot, fetchBatch, isCancelled } = params;
    let fetched = 0;

    for (;;) {
        if (isCancelled()) return { fetched, reason: 'cancelled' };
        const before = getSnapshot();
        if (!before) return { fetched, reason: 'gone' };
        if (!before.hasMore) return { fetched, reason: 'done' };
        if (target !== 'all' && fetched >= target) return { fetched, reason: 'reached' };

        await fetchBatch();

        const after = getSnapshot();
        if (!after) return { fetched, reason: 'gone' };
        const added = Math.max(0, after.absEnd - before.absEnd);
        fetched += added;
        if (after.hasError) return { fetched, reason: 'error' };
        // A batch that adds nothing while claiming more exists would loop forever.
        if (added === 0 && after.hasMore) return { fetched, reason: 'stalled' };
    }
}
