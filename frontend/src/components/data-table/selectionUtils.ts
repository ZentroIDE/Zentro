// SPDX-License-Identifier: GPL-3.0-only

import { DisplayRow } from '../../lib/dataEditing';

import { makeCellKey, parseCellKey } from './cells/cellUtils';
import { DataColumnMeta, SelectedCells } from './types';

function getColumnKey(columns: string[], colIdx: number): string | null {
    return columns[colIdx] ?? null;
}

export function getColumnCellKeys(
    displayRows: DisplayRow[],
    columns: string[],
    colIdx: number,
): string[] {
    const columnKey = getColumnKey(columns, colIdx);
    if (!columnKey) return [];
    return displayRows.map(row => makeCellKey(row.key, columnKey));
}

export function addColumnSelection(
    baseSelection: SelectedCells,
    displayRows: DisplayRow[],
    columns: string[],
    columnIndexes: number[],
): SelectedCells {
    const next: SelectedCells = { ...baseSelection };
    columnIndexes.forEach(columnIndex => {
        getColumnCellKeys(displayRows, columns, columnIndex).forEach(cellKey => {
            next[cellKey] = true;
        });
    });
    return next;
}

export function toggleColumnSelection(
    selectedCells: SelectedCells,
    displayRows: DisplayRow[],
    columns: string[],
    colIdx: number,
): SelectedCells {
    const columnCellKeys = getColumnCellKeys(displayRows, columns, colIdx);
    if (columnCellKeys.length === 0) return selectedCells;

    const next = { ...selectedCells };
    const isEntireColumnSelected = columnCellKeys.every(cellKey => next[cellKey]);

    columnCellKeys.forEach(cellKey => {
        if (isEntireColumnSelected) {
            delete next[cellKey];
            return;
        }
        next[cellKey] = true;
    });

    return next;
}

/**
 * Column drag ranges (cell drag-select, header shift/ctrl-select) are driven
 * by each column's fixed data-schema index, but "the columns between two
 * endpoints" has to be resolved in current VISUAL order — otherwise a range
 * spanning two endpoints that have been dragged apart (or together) grabs
 * whatever columns used to sit between them, not what's on screen now.
 */
export function getVisualIndexRange(
    columnOrder: string[],
    dataColumnById: Map<string, DataColumnMeta>,
    startColIdx: number,
    endColIdx: number,
): number[] {
    const visualPositionByColIdx = new Map<number, number>();
    columnOrder.forEach((id, position) => {
        const meta = dataColumnById.get(id);
        if (meta) visualPositionByColIdx.set(meta.index, position);
    });

    const startPos = visualPositionByColIdx.get(startColIdx) ?? startColIdx;
    const endPos = visualPositionByColIdx.get(endColIdx) ?? endColIdx;
    const minPos = Math.min(startPos, endPos);
    const maxPos = Math.max(startPos, endPos);

    const result: number[] = [];
    for (let pos = minPos; pos <= maxPos; pos++) {
        const id = columnOrder[pos];
        const meta = id ? dataColumnById.get(id) : undefined;
        if (meta) result.push(meta.index);
    }
    return result;
}

export function getSelectedColumnIndexesFromCells(
    selectedCells: SelectedCells,
    columns: string[],
): number[] {
    const indexes = new Set<number>();
    Object.keys(selectedCells).forEach(cellKey => {
        const { columnKey } = parseCellKey(cellKey);
        const columnIndex = columns.indexOf(columnKey);
        if (columnIndex >= 0) {
            indexes.add(columnIndex);
        }
    });
    return Array.from(indexes).sort((left, right) => left - right);
}

export type ArrowNavigationKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Next cell for an arrow key, in on-screen order. `rowKeys` and `columns` are the
 * visible rows/columns as displayed (sorted, filtered, reordered, minus hidden columns), so
 * navigation follows what the user sees rather than schema order. Clamps at the edges and
 * starts from the first cell when there is no usable current cell.
 */
export function getArrowNavigationTarget(params: {
    key: ArrowNavigationKey;
    rowKeys: string[];
    columns: Array<{ columnKey: string; index: number }>;
    current: { rowKey: string; columnKey: string } | null;
}): { rowKey: string; colIdx: number } | null {
    const { key, rowKeys, columns, current } = params;
    if (rowKeys.length === 0 || columns.length === 0) return null;

    const currentRow = current ? rowKeys.indexOf(current.rowKey) : -1;
    const currentCol = current
        ? columns.findIndex(column => column.columnKey === current.columnKey)
        : -1;
    if (currentRow < 0 || currentCol < 0) {
        return { rowKey: rowKeys[0], colIdx: columns[0].index };
    }

    let nextRow = currentRow;
    let nextCol = currentCol;
    if (key === 'ArrowUp') nextRow = Math.max(0, currentRow - 1);
    else if (key === 'ArrowDown') nextRow = Math.min(rowKeys.length - 1, currentRow + 1);
    else if (key === 'ArrowLeft') nextCol = Math.max(0, currentCol - 1);
    else nextCol = Math.min(columns.length - 1, currentCol + 1);

    return { rowKey: rowKeys[nextRow], colIdx: columns[nextCol].index };
}
