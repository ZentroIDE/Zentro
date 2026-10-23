// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
    getEffectiveSelection,
    getSelectedColumnIndexes,
    getSelectionColumnRange,
    getSingleSelectedColumnIndex,
    getTargetPersistedRowIndices,
} from './contextMenuSelection';

describe('getEffectiveSelection', () => {
    it('returns the explicit selection when non-empty', () => {
        const selected = new Set(['p:0|1']);
        const result = getEffectiveSelection(selected, 'p:5|2');
        expect(result).toBe(selected);
    });

    it('falls back to the right-clicked cell when selection is empty', () => {
        const result = getEffectiveSelection(new Set(), 'p:5|2');
        expect(Array.from(result)).toEqual(['p:5|2']);
    });

    it('returns empty set when both empty', () => {
        const result = getEffectiveSelection(new Set(), undefined);
        expect(result.size).toBe(0);
    });
});

describe('getSingleSelectedColumnIndex', () => {
    it('returns null for empty selection', () => {
        expect(getSingleSelectedColumnIndex(new Set())).toBeNull();
    });

    it('returns the column index when all cells share one column', () => {
        expect(getSingleSelectedColumnIndex(new Set(['p:0|3', 'p:1|3']))).toBe(3);
    });

    it('returns null when cells span multiple columns', () => {
        expect(getSingleSelectedColumnIndex(new Set(['p:0|3', 'p:1|4']))).toBeNull();
    });
});

describe('getSelectionColumnRange', () => {
    it('returns null for empty selection', () => {
        expect(getSelectionColumnRange(new Set())).toBeNull();
    });

    it('returns [min, max] across columns', () => {
        expect(getSelectionColumnRange(new Set(['p:0|1', 'p:1|4', 'p:2|3']))).toEqual({
            minCol: 1,
            maxCol: 4,
        });
    });
});

describe('getSelectedColumnIndexes', () => {
    it('returns sorted unique column indexes from the effective selection', () => {
        expect(getSelectedColumnIndexes(new Set(['p:0|3', 'p:1|1', 'p:2|3']))).toEqual([1, 3]);
    });

    it('falls back to the right-clicked column when selection is empty', () => {
        expect(getSelectedColumnIndexes(new Set(), 4)).toEqual([4]);
    });

    it('returns empty when no selection and no fallback exist', () => {
        expect(getSelectedColumnIndexes(new Set(), null)).toEqual([]);
    });
});

describe('getTargetPersistedRowIndices', () => {
    it('returns header selection first when present', () => {
        const indices = getTargetPersistedRowIndices({
            selectedRowKeysFromHeader: ['p:7', 'p:8', 'd:abc'],
            selectedRowKeys: ['p:99'],
            effectiveSelection: new Set(['p:100|0']),
            contextMenuRowKey: 'p:200',
        });
        expect(indices.sort()).toEqual([7, 8]);
    });

    it('falls back to selectedRowKeys when header empty', () => {
        const indices = getTargetPersistedRowIndices({
            selectedRowKeysFromHeader: [],
            selectedRowKeys: ['p:3', 'p:3', 'd:abc'],
            effectiveSelection: new Set(['p:100|0']),
            contextMenuRowKey: 'p:200',
        });
        // deduplicated
        expect(indices).toEqual([3]);
    });

    it('falls back to effective selection cells when prior tiers empty', () => {
        const indices = getTargetPersistedRowIndices({
            selectedRowKeysFromHeader: [],
            selectedRowKeys: [],
            effectiveSelection: new Set(['p:42|0', 'p:42|1', 'p:43|0']),
            contextMenuRowKey: 'p:99',
        });
        expect(indices.sort()).toEqual([42, 43]);
    });

    it('falls back to the right-clicked row last', () => {
        const indices = getTargetPersistedRowIndices({
            selectedRowKeysFromHeader: [],
            selectedRowKeys: [],
            effectiveSelection: new Set(),
            contextMenuRowKey: 'p:99',
        });
        expect(indices).toEqual([99]);
    });

    it('returns empty when no tier yields anything', () => {
        const indices = getTargetPersistedRowIndices({
            selectedRowKeysFromHeader: [],
            selectedRowKeys: [],
            effectiveSelection: new Set(),
            contextMenuRowKey: undefined,
        });
        expect(indices).toEqual([]);
    });

    it('ignores draft (d:) rows in every tier', () => {
        const indices = getTargetPersistedRowIndices({
            selectedRowKeysFromHeader: ['d:foo'],
            selectedRowKeys: ['d:bar'],
            effectiveSelection: new Set(['d:baz|0']),
            contextMenuRowKey: 'd:qux',
        });
        expect(indices).toEqual([]);
    });
});
