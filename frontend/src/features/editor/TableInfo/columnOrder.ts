// SPDX-License-Identifier: GPL-3.0-only

import type { RowState } from './types';

function hasOriginalIndex(row: RowState): row is RowState & { originalIndex: number } {
    return typeof row.originalIndex === 'number' && Number.isFinite(row.originalIndex);
}

export function hasManualColumnReorder(rows: RowState[]): boolean {
    let previousIndex = -1;

    for (const row of rows) {
        if (row.deleted || row.isNew || !hasOriginalIndex(row)) continue;
        if (row.originalIndex < previousIndex) return true;
        previousIndex = row.originalIndex;
    }

    return false;
}

export function buildPersistedColumnOrder(rows: RowState[]): string[] {
    return rows
        .filter(row => !row.deleted)
        .map(row => row.current.Name.trim())
        .filter(name => name.length > 0);
}
