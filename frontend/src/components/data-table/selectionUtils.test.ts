// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { DisplayRow } from '../../lib/dataEditing';

import { makeCellKey } from './cells/cellUtils';
import {
    addColumnSelection,
    getArrowNavigationTarget,
    getColumnCellKeys,
    getSelectedColumnIndexesFromCells,
    getVisualIndexRange,
    toggleColumnSelection,
} from './selectionUtils';
import { DataColumnMeta } from './types';

const displayRows: DisplayRow[] = [
    { key: 'p:0', values: ['1', 'alice', 'ops'], kind: 'persisted' },
    { key: 'p:1', values: ['2', 'bob', 'sales'], kind: 'persisted' },
];

const columns = ['id', 'name', 'department'];

function makeDataColumnById(names: string[]): Map<string, DataColumnMeta> {
    const map = new Map<string, DataColumnMeta>();
    names.forEach((name, index) => {
        map.set(`col:${name}`, { id: `col:${name}`, index, name, columnKey: name });
    });
    return map;
}

describe('selectionUtils', () => {
    it('builds full-column cell keys for a selected header', () => {
        expect(getColumnCellKeys(displayRows, columns, 1)).toEqual([
            makeCellKey('p:0', 'name'),
            makeCellKey('p:1', 'name'),
        ]);
    });

    it('adds a range of selected columns on top of a base selection', () => {
        expect(
            addColumnSelection({ [makeCellKey('p:0', 'id')]: true }, displayRows, columns, [1, 2]),
        ).toEqual({
            [makeCellKey('p:0', 'id')]: true,
            [makeCellKey('p:0', 'name')]: true,
            [makeCellKey('p:1', 'name')]: true,
            [makeCellKey('p:0', 'department')]: true,
            [makeCellKey('p:1', 'department')]: true,
        });
    });

    it('toggles a fully selected column off and back on', () => {
        const selected = addColumnSelection({}, displayRows, columns, [1]);
        expect(toggleColumnSelection(selected, displayRows, columns, 1)).toEqual({});
        expect(toggleColumnSelection({}, displayRows, columns, 1)).toEqual(selected);
    });

    it('derives selected column indexes from cell selection', () => {
        expect(
            getSelectedColumnIndexesFromCells(
                {
                    [makeCellKey('p:0', 'department')]: true,
                    [makeCellKey('p:1', 'name')]: true,
                    [makeCellKey('p:1', 'department')]: true,
                },
                columns,
            ),
        ).toEqual([1, 2]);
    });
});

describe('getVisualIndexRange', () => {
    // Data schema is id(0), name(1), department(2).
    const dataColumnById = makeDataColumnById(columns);

    it('matches naive min/max order when columns are unreordered', () => {
        const columnOrder = ['col:id', 'col:name', 'col:department'];
        expect(getVisualIndexRange(columnOrder, dataColumnById, 1, 2)).toEqual([1, 2]);
        expect(getVisualIndexRange(columnOrder, dataColumnById, 2, 1)).toEqual([1, 2]);
    });

    it('resolves the range in visual order after a reorder', () => {
        // Visual order: id, department, name (name and department swapped).
        const columnOrder = ['col:id', 'col:department', 'col:name'];
        // Dragging from "name" to "department" visually spans just those two
        // columns, even though their fixed indexes are 1 and 2.
        expect(getVisualIndexRange(columnOrder, dataColumnById, 1, 2)).toEqual([2, 1]);
        // Dragging from "id" to "name" visually spans all three columns.
        expect(getVisualIndexRange(columnOrder, dataColumnById, 0, 1)).toEqual([0, 2, 1]);
    });

    it('returns a single column when start and end match', () => {
        const columnOrder = ['col:id', 'col:department', 'col:name'];
        expect(getVisualIndexRange(columnOrder, dataColumnById, 2, 2)).toEqual([2]);
    });
});

describe('getArrowNavigationTarget', () => {
    const rowKeys = ['p:2', 'p:0', 'p:1'];
    // Visual order: department, id (name hidden), so schema indexes are 2 then 0.
    const visibleColumns = [
        { columnKey: 'department', index: 2 },
        { columnKey: 'id', index: 0 },
    ];

    it('moves through rows and columns in visual order', () => {
        const current = { rowKey: 'p:0', columnKey: 'department' };
        expect(
            getArrowNavigationTarget({
                key: 'ArrowDown',
                rowKeys,
                columns: visibleColumns,
                current,
            }),
        ).toEqual({ rowKey: 'p:1', colIdx: 2 });
        expect(
            getArrowNavigationTarget({
                key: 'ArrowRight',
                rowKeys,
                columns: visibleColumns,
                current,
            }),
        ).toEqual({ rowKey: 'p:0', colIdx: 0 });
    });

    it('clamps at the grid edges', () => {
        expect(
            getArrowNavigationTarget({
                key: 'ArrowUp',
                rowKeys,
                columns: visibleColumns,
                current: { rowKey: 'p:2', columnKey: 'id' },
            }),
        ).toEqual({ rowKey: 'p:2', colIdx: 0 });
        expect(
            getArrowNavigationTarget({
                key: 'ArrowLeft',
                rowKeys,
                columns: visibleColumns,
                current: { rowKey: 'p:1', columnKey: 'department' },
            }),
        ).toEqual({ rowKey: 'p:1', colIdx: 2 });
    });

    it('starts at the first visible cell when the current cell is gone or unset', () => {
        expect(
            getArrowNavigationTarget({
                key: 'ArrowDown',
                rowKeys,
                columns: visibleColumns,
                current: { rowKey: 'gone', columnKey: 'id' },
            }),
        ).toEqual({ rowKey: 'p:2', colIdx: 2 });
        expect(
            getArrowNavigationTarget({
                key: 'ArrowDown',
                rowKeys: [],
                columns: visibleColumns,
                current: null,
            }),
        ).toBeNull();
    });
});
