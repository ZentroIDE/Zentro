// SPDX-License-Identifier: GPL-3.0-only

import { makeCellKey, parseCellKey } from '../components/data-table/cells/cellUtils';
import {
    type DeletedRowKeys,
    type EditedCells,
    type SelectedCells,
    type SelectedRowKeys,
} from '../components/data-table/types';

/**
 * Bridge legacy result-editing state into the current data-table contracts
 * while the surrounding editor flow still stores Map/Set-based state.
 */
export function legacyEditedCellsToTableState(
    editedCells: Map<string, string>,
    columns: string[],
): EditedCells {
    const nextEditedCells: EditedCells = {};

    editedCells.forEach((value, legacyCellKey) => {
        const separatorIndex = legacyCellKey.lastIndexOf(':');
        const rowIndex = legacyCellKey.slice(0, separatorIndex);
        const columnIndex = Number(legacyCellKey.slice(separatorIndex + 1));
        const columnName = columns[columnIndex] ?? `col_${columnIndex}`;

        nextEditedCells[makeCellKey(`p:${rowIndex}`, columnName)] = value;
    });

    return nextEditedCells;
}

export function tableEditedCellsToLegacyState(
    editedCells: EditedCells,
    columns: string[],
): Map<string, string> {
    const nextEditedCells = new Map<string, string>();

    Object.entries(editedCells).forEach(([cellKey, value]) => {
        const { rowKey, columnKey } = parseCellKey(cellKey);
        if (!rowKey.startsWith('p:')) return;

        const rowIndex = rowKey.slice(2);
        const columnIndex = columns.indexOf(columnKey);
        if (columnIndex >= 0) {
            nextEditedCells.set(`${rowIndex}:${columnIndex}`, value);
        }
    });

    return nextEditedCells;
}

export function legacyDeletedRowsToTableState(
    deletedRows: Set<number> | undefined,
): DeletedRowKeys {
    const nextDeletedRowKeys: DeletedRowKeys = {};

    deletedRows?.forEach(rowIndex => {
        nextDeletedRowKeys[`p:${rowIndex}`] = true;
    });

    return nextDeletedRowKeys;
}

export function tableDeletedRowsToLegacyState(deletedRowKeys: DeletedRowKeys): Set<number> {
    const nextDeletedRows = new Set<number>();

    Object.keys(deletedRowKeys).forEach(rowKey => {
        if (!rowKey.startsWith('p:')) return;

        const rowIndex = Number(rowKey.slice(2));
        if (Number.isFinite(rowIndex)) {
            nextDeletedRows.add(rowIndex);
        }
    });

    return nextDeletedRows;
}

export function legacySelectedCellsToTableState(
    selectedCells: Set<string>,
    columns: string[],
): SelectedCells {
    const nextSelectedCells: SelectedCells = {};

    selectedCells.forEach(legacyCellKey => {
        const separatorIndex = legacyCellKey.lastIndexOf('|');
        const rowKey = legacyCellKey.slice(0, separatorIndex);
        const columnIndex = Number(legacyCellKey.slice(separatorIndex + 1));
        const columnName = columns[columnIndex] ?? `col_${columnIndex}`;

        nextSelectedCells[makeCellKey(rowKey, columnName)] = true;
    });

    return nextSelectedCells;
}

export function tableSelectedCellsToLegacyState(
    selectedCells: SelectedCells,
    columns: string[],
): Set<string> {
    const nextSelectedCells = new Set<string>();

    Object.keys(selectedCells).forEach(cellKey => {
        const { rowKey, columnKey } = parseCellKey(cellKey);
        const columnIndex = columns.indexOf(columnKey);
        if (columnIndex >= 0) {
            nextSelectedCells.add(`${rowKey}|${columnIndex}`);
        }
    });

    return nextSelectedCells;
}

export function legacySelectedRowKeysToTableState(selectedRowKeys: Set<string>): SelectedRowKeys {
    const nextSelectedRowKeys: SelectedRowKeys = {};

    selectedRowKeys.forEach(rowKey => {
        nextSelectedRowKeys[rowKey] = true;
    });

    return nextSelectedRowKeys;
}

export function tableSelectedRowKeysToLegacyState(selectedRowKeys: SelectedRowKeys): Set<string> {
    return new Set(Object.keys(selectedRowKeys));
}

export function blurredColumnIndexesToTableState(
    blurredColumnIndexes: Set<number> | undefined,
): Record<number, true> | undefined {
    if (!blurredColumnIndexes) return undefined;

    const nextBlurredColumnIndexes: Record<number, true> = {};
    blurredColumnIndexes.forEach(columnIndex => {
        nextBlurredColumnIndexes[columnIndex] = true;
    });

    return nextBlurredColumnIndexes;
}
