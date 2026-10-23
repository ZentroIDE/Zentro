// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { resolveDiscardTargets } from './rowActions';

describe('rowActions', () => {
    it('resolves discard targets from selected dirty persisted and draft rows', () => {
        const result = resolveDiscardTargets({
            selectedRowKeys: ['p:0', 'p:1', 'd:draft-1'],
            editedCells: new Map([['0:1', 'Alice 2']]),
            deletedRows: new Set([1]),
        });

        expect(result.discardableRowKeys).toEqual(['p:0', 'p:1', 'd:draft-1']);
        expect(result.targetPersistedIndices).toEqual([0, 1]);
        expect(result.targetDraftIds).toEqual(['draft-1']);
    });

    it('falls back to the context row and ignores clean persisted rows', () => {
        const cleanResult = resolveDiscardTargets({
            selectedRowKeys: [],
            contextMenuRowKey: 'p:3',
            editedCells: new Map(),
            deletedRows: new Set(),
        });
        const dirtyResult = resolveDiscardTargets({
            selectedRowKeys: [],
            contextMenuRowKey: 'p:4',
            editedCells: new Map([['4:0', 'x']]),
            deletedRows: new Set(),
        });

        expect(cleanResult.discardableRowKeys).toEqual([]);
        expect(dirtyResult.discardableRowKeys).toEqual(['p:4']);
        expect(dirtyResult.targetPersistedIndices).toEqual([4]);
    });
});
