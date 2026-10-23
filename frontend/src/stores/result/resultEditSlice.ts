// SPDX-License-Identifier: GPL-3.0-only

import type { StateCreator } from 'zustand';
import type { ResultState } from './types';
import { updateActiveBucket } from './types';
import type { DraftRow } from '../../lib/dataEditing';

export interface ResultEditSlice {
    applyEdits: (tabId: string, edits: Map<string, string>, deletedRows?: Set<number>) => void;
    appendInsertedRows: (tabId: string, rows: string[][]) => void;
    updatePendingState: (
        tabId: string,
        pendingEdits: Map<string, string>,
        pendingDeletions: Set<number>,
        pendingDraftRows: DraftRow[],
    ) => void;
}

export const createResultEditSlice: StateCreator<ResultState, [], [], ResultEditSlice> = set => ({
    applyEdits: (tabId, edits, deletedRows) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                const windowStart = prev.windowStartOffset ?? 0;
                let rows = [...prev.rows];
                edits.forEach((value, cellId) => {
                    const [logicalRowIdx, columnIndex] = cellId.split(':').map(Number);
                    const arrayIdx = logicalRowIdx - windowStart;
                    if (arrayIdx < 0 || arrayIdx >= rows.length) return;
                    const nextRow = [...rows[arrayIdx]];
                    nextRow[columnIndex] = value;
                    rows[arrayIdx] = nextRow;
                });

                if (deletedRows && deletedRows.size > 0) {
                    const deleteSet = new Set(
                        Array.from(deletedRows)
                            .map(i => i - windowStart)
                            .filter(i => i >= 0),
                    );
                    rows = rows.filter((_, index) => !deleteSet.has(index));
                }

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        rows,
                    },
                };
            }),
        ),

    appendInsertedRows: (tabId, rows) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev || rows.length === 0) return bucket;

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        rows: [...prev.rows, ...rows],
                        affected: prev.affected + rows.length,
                    },
                };
            }),
        ),

    updatePendingState: (tabId, pendingEdits, pendingDeletions, pendingDraftRows) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        pendingEdits,
                        pendingDeletions,
                        pendingDraftRows,
                    },
                };
            }),
        ),
});
