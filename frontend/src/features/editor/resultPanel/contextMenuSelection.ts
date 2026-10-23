// SPDX-License-Identifier: GPL-3.0-only

import { parseCellId } from '../resultPanelUtils';

/**
 * Pure selection-resolution helpers used by the result-grid context menu.
 * No React, no toast, no store coupling — these are exhaustively testable.
 *
 * "Effective selection" rule: explicit cell selection wins; otherwise fall
 * back to the right-clicked cell (when the context menu was triggered on a
 * cell). When neither exists the selection is empty.
 *
 * "Target persisted rows" priority chain (Header > Selection > Cells > Right-click)
 * matches what the user expects when right-clicking with a partial selection.
 */

/**
 * Resolve the effective cell selection: explicit cell selection if any,
 * otherwise the single right-clicked cell, otherwise an empty set.
 */
export function getEffectiveSelection(
    selectedCells: Set<string>,
    contextMenuCellId: string | undefined,
): Set<string> {
    if (selectedCells.size > 0) return selectedCells;
    if (!contextMenuCellId) return new Set<string>();
    return new Set([contextMenuCellId]);
}

/**
 * Return the column index when every cell in the effective selection sits in
 * the same column. Returns null if selection is empty, contains NaN, or spans
 * multiple columns.
 */
export function getSingleSelectedColumnIndex(effectiveSelection: Set<string>): number | null {
    if (effectiveSelection.size === 0) return null;
    let columnIndex: number | null = null;
    for (const cellId of effectiveSelection) {
        const { colIdx } = parseCellId(cellId);
        if (Number.isNaN(colIdx)) return null;
        if (columnIndex === null) {
            columnIndex = colIdx;
            continue;
        }
        if (columnIndex !== colIdx) return null;
    }
    return columnIndex;
}

/**
 * Compute [minCol, maxCol] from the effective selection, or null when the
 * selection contains no parseable cell ids.
 */
export function getSelectionColumnRange(
    effectiveSelection: Set<string>,
): { minCol: number; maxCol: number } | null {
    let minCol = Infinity;
    let maxCol = -Infinity;
    effectiveSelection.forEach(cellId => {
        const { colIdx } = parseCellId(cellId);
        if (!Number.isNaN(colIdx)) {
            minCol = Math.min(minCol, colIdx);
            maxCol = Math.max(maxCol, colIdx);
        }
    });
    if (!Number.isFinite(minCol)) return null;
    return { minCol, maxCol };
}

/**
 * Resolve the unique selected column indexes from the effective selection.
 * Falls back to the right-clicked column when the selection is empty.
 */
export function getSelectedColumnIndexes(
    effectiveSelection: Set<string>,
    fallbackColumnIndex?: number | null,
): number[] {
    const selected = new Set<number>();
    effectiveSelection.forEach(cellId => {
        const { colIdx } = parseCellId(cellId);
        if (!Number.isNaN(colIdx)) {
            selected.add(colIdx);
        }
    });
    if (selected.size === 0 && Number.isFinite(fallbackColumnIndex ?? NaN)) {
        return [Number(fallbackColumnIndex)];
    }
    return Array.from(selected).sort((left, right) => left - right);
}

/**
 * Resolve the persisted row indices the user means to act on. Tries header
 * selection first (`selectedRowKeysFromHeader`), then cell-derived row keys
 * (`selectedRowKeys`), then cells in the effective selection, finally the
 * right-clicked row. Each priority is exhaustive — once a tier yields rows we
 * return immediately. Indices are de-duplicated within a tier but order is
 * not stable.
 */
export function getTargetPersistedRowIndices(args: {
    selectedRowKeysFromHeader: string[];
    selectedRowKeys: string[];
    effectiveSelection: Set<string>;
    contextMenuRowKey: string | undefined;
}): number[] {
    const { selectedRowKeysFromHeader, selectedRowKeys, effectiveSelection, contextMenuRowKey } =
        args;

    // Priority 1: explicit row header selection
    const fromHeader = selectedRowKeysFromHeader
        .filter(rowKey => rowKey.startsWith('p:'))
        .map(rowKey => Number(rowKey.slice(2)))
        .filter(rowIndex => Number.isFinite(rowIndex));
    if (fromHeader.length > 0) {
        return Array.from(new Set(fromHeader));
    }

    // Priority 2: cell-derived row keys
    const fromSelection = selectedRowKeys
        .filter(rowKey => rowKey.startsWith('p:'))
        .map(rowKey => Number(rowKey.slice(2)))
        .filter(rowIndex => Number.isFinite(rowIndex));
    if (fromSelection.length > 0) {
        return Array.from(new Set(fromSelection));
    }

    // Priority 3: cells in effective selection
    const fromCells = Array.from(effectiveSelection)
        .map(cellId => parseCellId(cellId).rowKey)
        .filter(rowKey => rowKey.startsWith('p:'))
        .map(rowKey => Number(rowKey.slice(2)))
        .filter(rowIndex => Number.isFinite(rowIndex));
    if (fromCells.length > 0) {
        return Array.from(new Set(fromCells));
    }

    // Priority 4: right-clicked row
    if (contextMenuRowKey?.startsWith('p:')) {
        const rowIndex = Number(contextMenuRowKey.slice(2));
        if (Number.isFinite(rowIndex)) return [rowIndex];
    }
    return [];
}
