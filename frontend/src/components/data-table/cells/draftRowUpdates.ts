// SPDX-License-Identifier: GPL-3.0-only

import { DraftRow } from '../../../lib/dataEditing';

interface DraftValueChange {
    rowKey: string;
    colIdx: number;
    value: string;
}

export function applyDraftRowValueChanges(
    draftRows: DraftRow[],
    changes: DraftValueChange[],
): DraftRow[] {
    if (changes.length === 0) return draftRows;

    return draftRows.map(draftRow => {
        const rowKey = `d:${draftRow.id}`;
        const rowChanges = changes.filter(change => change.rowKey === rowKey);
        if (rowChanges.length === 0) return draftRow;

        const nextValues = [...draftRow.values];
        rowChanges.forEach(change => {
            nextValues[change.colIdx] = change.value;
        });

        return { ...draftRow, values: nextValues };
    });
}
