// SPDX-License-Identifier: GPL-3.0-only

import { quoteIdent } from '../../lib/driverCapabilities';
import { formatSqlLiteral, type SqlLiteralColumn } from '../../lib/sqlLiteral';
import type { DraftRow } from '../../lib/dataEditing';
import { makeCellId, parseCellId } from './resultPanelUtils';

/**
 * Per-column type metadata for the "Copy as INSERT/UPDATE" helpers, keyed by
 * column name. Optional everywhere — when absent, values fall back to the
 * historical "empty = NULL, everything else = quoted string" behavior.
 */
export type SqlLiteralColumnMap = Map<string, SqlLiteralColumn>;

/** Adapts the ResultPanel's `columnDefsByName` map into a {@link SqlLiteralColumnMap}. */
export function toSqlLiteralColumnMap(
    defs: Map<string, { DataType?: string; IsNullable?: boolean }> | undefined,
): SqlLiteralColumnMap | undefined {
    if (!defs || defs.size === 0) return undefined;
    const out: SqlLiteralColumnMap = new Map();
    defs.forEach((def, name) => {
        out.set(name, { dataType: def.DataType, isNullable: def.IsNullable });
    });
    return out;
}

interface DisplayRowLike {
    key: string;
    kind: 'persisted' | 'draft';
    values: string[];
    persistedIndex?: number | null;
    draft?: { id: string } | null;
}

interface SelectionBounds {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
}

type PasteMode = 'anchor' | 'fill-selected';

function getSelectionBounds(
    selectedCells: Set<string>,
    rowOrder: Map<string, number>,
): SelectionBounds | null {
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minCol = Infinity;
    let maxCol = -Infinity;

    selectedCells.forEach(cellId => {
        const { rowKey, colIdx } = parseCellId(cellId);
        const rowIndex = rowOrder.get(rowKey);
        if (rowIndex === undefined || Number.isNaN(colIdx)) return;
        minRow = Math.min(minRow, rowIndex);
        maxRow = Math.max(maxRow, rowIndex);
        minCol = Math.min(minCol, colIdx);
        maxCol = Math.max(maxCol, colIdx);
    });

    if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) return null;
    return { minRow, maxRow, minCol, maxCol };
}

/** True when any selected cell sits in a blurred column. */
export function selectionTouchesBlurredColumn(
    selectedCells: Set<string>,
    blurredColumnIndexes: ReadonlySet<number> | undefined,
): boolean {
    if (!blurredColumnIndexes || blurredColumnIndexes.size === 0) return false;
    for (const cellId of selectedCells) {
        if (blurredColumnIndexes.has(parseCellId(cellId).colIdx)) return true;
    }
    return false;
}

/**
 * True when a blurred column falls anywhere in the selection's column span. Stricter than
 * {@link selectionTouchesBlurredColumn}: INSERT copies every column between the outermost
 * selected cells, including ones that were not themselves selected.
 */
export function selectionSpanTouchesBlurredColumn(
    selectedCells: Set<string>,
    rowOrder: Map<string, number>,
    blurredColumnIndexes: ReadonlySet<number> | undefined,
): boolean {
    if (!blurredColumnIndexes || blurredColumnIndexes.size === 0) return false;
    const bounds = getSelectionBounds(selectedCells, rowOrder);
    if (!bounds) return false;
    for (let colIdx = bounds.minCol; colIdx <= bounds.maxCol; colIdx += 1) {
        if (blurredColumnIndexes.has(colIdx)) return true;
    }
    return false;
}

export function buildSelectionMatrix(params: {
    selectedCells: Set<string>;
    displayRows: DisplayRowLike[];
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
}): string[][] {
    const { selectedCells, displayRows, rowOrder, editedCells } = params;
    const bounds = getSelectionBounds(selectedCells, rowOrder);
    if (!bounds) return [];

    const matrix: string[][] = [];
    for (let ri = bounds.minRow; ri <= bounds.maxRow; ri += 1) {
        const displayRow = displayRows[ri];
        if (!displayRow) continue;
        const row: string[] = [];
        for (let ci = bounds.minCol; ci <= bounds.maxCol; ci += 1) {
            const cellId = makeCellId(displayRow.key, ci);
            if (!selectedCells.has(cellId)) {
                row.push('');
                continue;
            }
            row.push(
                displayRow.kind === 'persisted'
                    ? (editedCells.get(`${displayRow.persistedIndex}:${ci}`) ??
                          displayRow.values[ci] ??
                          '')
                    : (displayRow.values[ci] ?? ''),
            );
        }
        matrix.push(row);
    }
    return matrix;
}

/** Whole-row matrix for rows selected via the index column, in grid order. */
export function buildRowSelectionMatrix(params: {
    rowKeys: string[];
    displayRows: DisplayRowLike[];
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    columnCount: number;
}): string[][] {
    const { rowKeys, displayRows, rowOrder, editedCells, columnCount } = params;
    const orders = rowKeys
        .map(key => rowOrder.get(key))
        .filter((order): order is number => order !== undefined)
        .sort((left, right) => left - right);

    const matrix: string[][] = [];
    orders.forEach(order => {
        const displayRow = displayRows[order];
        if (!displayRow) return;
        const row: string[] = [];
        for (let ci = 0; ci < columnCount; ci += 1) {
            row.push(
                displayRow.kind === 'persisted'
                    ? (editedCells.get(`${displayRow.persistedIndex}:${ci}`) ??
                          displayRow.values[ci] ??
                          '')
                    : (displayRow.values[ci] ?? ''),
            );
        }
        matrix.push(row);
    });
    return matrix;
}

export function matrixToTsv(matrix: string[][]): string {
    return matrix.map(row => row.join('\t')).join('\n');
}

function parseClipboardText(text: string): string[][] {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.map(line => line.split('\t'));
}

function applyValueToDisplayCell(args: {
    displayRow: DisplayRowLike;
    colIdx: number;
    value: string;
    nextEdited: Map<string, string>;
    nextDraftById: Map<string, DraftRow>;
}) {
    const { displayRow, colIdx, value, nextEdited, nextDraftById } = args;
    if (displayRow.kind === 'persisted') {
        nextEdited.set(`${displayRow.persistedIndex}:${colIdx}`, value);
        return;
    }

    const draftId = displayRow.draft?.id;
    const target = draftId ? nextDraftById.get(draftId) : null;
    if (target) {
        target.values[colIdx] = value;
    }
}

function buildSelectionTargets(
    selectedCells: Set<string>,
    rowOrder: Map<string, number>,
): Array<{ cellId: string; rowKey: string; colIdx: number; rowIndex: number }> {
    return Array.from(selectedCells)
        .map(cellId => {
            const { rowKey, colIdx } = parseCellId(cellId);
            return { cellId, rowKey, colIdx, rowIndex: rowOrder.get(rowKey) ?? -1 };
        })
        .filter(target => target.rowIndex >= 0 && !Number.isNaN(target.colIdx));
}

export function applyClipboardPaste(params: {
    text: string;
    selectedCells: Set<string>;
    displayRows: DisplayRowLike[];
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    draftRows: DraftRow[];
    deletedRows: Set<number>;
    columnCount: number;
    mode?: PasteMode;
    /** Cells in these columns are left untouched: a blurred value must not be edited. */
    blurredColumnIndexes?: ReadonlySet<number>;
}): {
    nextEdited: Map<string, string>;
    nextDraftRows: DraftRow[];
    pastedCells: Set<string>;
    blurredSkippedCount: number;
} | null {
    const {
        text,
        selectedCells,
        displayRows,
        rowOrder,
        editedCells,
        draftRows,
        deletedRows,
        columnCount,
        mode = 'anchor',
        blurredColumnIndexes,
    } = params;

    const matrix = parseClipboardText(text);
    if (matrix.length === 0 || matrix[0].length === 0) return null;

    const nextEdited = new Map(editedCells);
    const nextDraftRows = draftRows.map(draftRow => ({
        ...draftRow,
        values: [...draftRow.values],
    }));
    const nextDraftById = new Map(nextDraftRows.map(draftRow => [draftRow.id, draftRow]));
    const pastedCells = new Set<string>();
    let blurredSkippedCount = 0;

    if (mode === 'fill-selected') {
        const targets = buildSelectionTargets(selectedCells, rowOrder);
        if (targets.length === 0) return null;

        const flattenedValues = matrix.flat();
        if (flattenedValues.length === 0) return null;

        const repeatedSingleValue = flattenedValues.length === 1 ? flattenedValues[0] : null;
        for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
            const target = targets[targetIndex];
            if (target.colIdx >= columnCount) continue;
            if (blurredColumnIndexes?.has(target.colIdx)) {
                blurredSkippedCount += 1;
                continue;
            }

            const displayRow = displayRows[target.rowIndex];
            if (!displayRow) continue;
            if (
                displayRow.kind === 'persisted' &&
                deletedRows.has(displayRow.persistedIndex as number)
            ) {
                continue;
            }

            const value = repeatedSingleValue ?? flattenedValues[targetIndex];
            if (value === undefined) break;

            applyValueToDisplayCell({
                displayRow,
                colIdx: target.colIdx,
                value,
                nextEdited,
                nextDraftById,
            });
            pastedCells.add(target.cellId);
        }

        return { nextEdited, nextDraftRows, pastedCells, blurredSkippedCount };
    }

    const bounds = getSelectionBounds(selectedCells, rowOrder);
    if (!bounds) return null;

    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
        const displayRow = displayRows[bounds.minRow + rowOffset];
        if (!displayRow) break;
        if (displayRow.kind === 'persisted' && deletedRows.has(displayRow.persistedIndex as number))
            continue;

        for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
            const colIdx = bounds.minCol + colOffset;
            if (colIdx >= columnCount) break;
            if (blurredColumnIndexes?.has(colIdx)) {
                blurredSkippedCount += 1;
                continue;
            }
            const value = matrix[rowOffset][colOffset];
            const cellId = makeCellId(displayRow.key, colIdx);

            applyValueToDisplayCell({
                displayRow,
                colIdx,
                value,
                nextEdited,
                nextDraftById,
            });
            pastedCells.add(cellId);
        }
    }

    return { nextEdited, nextDraftRows, pastedCells, blurredSkippedCount };
}

function sqlValueLiteral(
    value: string,
    columnName: string,
    columnTypes: SqlLiteralColumnMap | undefined,
    driver: string | undefined,
): string {
    // Preserve the historical clipboard behavior: a blank cell is NULL
    // regardless of the column's nullability.
    if (value === '') return 'NULL';
    const column = columnTypes?.get(columnName);
    if (!column) return `'${value.replace(/'/g, "''")}'`;
    return formatSqlLiteral(value, column, driver);
}

function buildRowValueBlock(
    displayRow: DisplayRowLike,
    columns: string[],
    editedCells: Map<string, string>,
    withComments: boolean,
    columnTypes: SqlLiteralColumnMap | undefined,
    driver: string | undefined,
): string {
    const valueLines = columns.map((col, ci) => {
        const raw =
            displayRow.kind === 'persisted'
                ? (editedCells.get(`${displayRow.persistedIndex}:${ci}`) ??
                  displayRow.values[ci] ??
                  '')
                : (displayRow.values[ci] ?? '');
        const literal = sqlValueLiteral(raw, col, columnTypes, driver);
        return withComments ? `    ${literal}, --[${col}]` : `    ${literal},`;
    });
    const lastIdx = valueLines.length - 1;
    valueLines[lastIdx] = withComments
        ? valueLines[lastIdx].replace(/,\s*(--\[)/, ' $1')
        : valueLines[lastIdx].slice(0, -1);
    return `(\n${valueLines.join('\n')}\n)`;
}

export function buildRowsAsInsertStatements(params: {
    selectedCells: Set<string>;
    selectedRowKeys: string[];
    displayRows: DisplayRowLike[];
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    columns: string[];
    tableName: string;
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    const {
        selectedCells,
        selectedRowKeys,
        displayRows,
        rowOrder,
        editedCells,
        columns,
        tableName,
        driver,
        columnTypes,
    } = params;

    const tbl = quoteIdent(tableName, driver);
    const quotedCols = columns.map(c => quoteIdent(c, driver));
    const colList = quotedCols.join(',\n    ');

    // Row-header selection: multi-row INSERT with full columns + comments
    if (selectedRowKeys.length > 0) {
        const displayRowsByKey = new Map(displayRows.map(r => [r.key, r]));
        const rows = selectedRowKeys
            .map(key => displayRowsByKey.get(key))
            .filter((row): row is DisplayRowLike => Boolean(row));
        if (rows.length === 0) return '';
        const valueBlocks = rows.map(row =>
            buildRowValueBlock(row, columns, editedCells, true, columnTypes, driver),
        );
        return `INSERT INTO ${tbl} (\n    ${colList}\n)\nVALUES\n${valueBlocks.join(',\n')};`;
    }

    // Cell selection: multi-row INSERT with only selected columns (no comments)
    const bounds = getSelectionBounds(selectedCells, rowOrder);
    if (!bounds) return '';

    const selectedColumns = columns.slice(bounds.minCol, bounds.maxCol + 1);
    const selectedColList = selectedColumns.map(c => quoteIdent(c, driver)).join(', ');
    const valueBlocks: string[] = [];
    for (let ri = bounds.minRow; ri <= bounds.maxRow; ri++) {
        const displayRow = displayRows[ri];
        if (!displayRow) continue;
        const subRow: DisplayRowLike = {
            ...displayRow,
            values: selectedColumns.map((_, offset) => {
                const ci = bounds.minCol + offset;
                return displayRow.kind === 'persisted'
                    ? (editedCells.get(`${displayRow.persistedIndex}:${ci}`) ??
                          displayRow.values[ci] ??
                          '')
                    : (displayRow.values[ci] ?? '');
            }),
        };
        valueBlocks.push(
            buildRowValueBlock(subRow, selectedColumns, new Map(), false, columnTypes, driver),
        );
    }
    if (valueBlocks.length === 0) return '';
    return `INSERT INTO ${tbl} (${selectedColList}) VALUES\n${valueBlocks.join(',\n')};`;
}

export function buildRowAsUpdateStatement(params: {
    selectedCells: Set<string>;
    displayRows: DisplayRowLike[];
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    columns: string[];
    pkColumns: string[];
    tableName: string;
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    const {
        selectedCells,
        displayRows,
        editedCells,
        columns,
        pkColumns,
        tableName,
        driver,
        columnTypes,
    } = params;
    if (selectedCells.size === 0) return '';

    const tbl = quoteIdent(tableName, driver);

    const persistedRowIndices = Array.from(
        new Set(
            Array.from(selectedCells)
                .map(cellId => parseCellId(cellId).rowKey)
                .filter(rowKey => rowKey.startsWith('p:'))
                .map(rowKey => Number(rowKey.slice(2)))
                .filter(rowIndex => Number.isFinite(rowIndex)),
        ),
    ).sort((a, b) => a - b);
    if (persistedRowIndices.length === 0) return '';

    const displayRowsByPersistedIndex = new Map<number, DisplayRowLike>();
    displayRows.forEach(row => {
        if (row.kind === 'persisted' && typeof row.persistedIndex === 'number') {
            displayRowsByPersistedIndex.set(row.persistedIndex, row);
        }
    });

    return persistedRowIndices
        .map(rowIndex => {
            const row = displayRowsByPersistedIndex.get(rowIndex);
            if (!row) return '';
            const setClauses = columns
                .map((col, colIdx) => {
                    const val =
                        editedCells.get(`${rowIndex}:${colIdx}`) ?? row.values[colIdx] ?? '';
                    return `${quoteIdent(col, driver)} = ${sqlValueLiteral(val, col, columnTypes, driver)}`;
                })
                .join(',\n    ');
            const whereClauses =
                pkColumns.length > 0
                    ? pkColumns
                          .map(pkCol => {
                              const colIdx = columns.indexOf(pkCol);
                              const val =
                                  colIdx >= 0
                                      ? (editedCells.get(`${rowIndex}:${colIdx}`) ??
                                        row.values[colIdx] ??
                                        '')
                                      : '';
                              return `${quoteIdent(pkCol, driver)} = ${sqlValueLiteral(val, pkCol, columnTypes, driver)}`;
                          })
                          .join('\n    AND ')
                    : '/* add WHERE condition */';
            return `UPDATE ${tbl}\nSET\n    ${setClauses}\nWHERE\n    ${whereClauses};`;
        })
        .filter(Boolean)
        .join('\n\n');
}

function getPersistedRowByIndex(
    displayRows: DisplayRowLike[],
    rowIndex: number,
): DisplayRowLike | undefined {
    return displayRows.find(row => row.kind === 'persisted' && row.persistedIndex === rowIndex);
}

export function buildWhereClauseByPrimaryKeys(params: {
    persistedRowIndices: number[];
    displayRows: DisplayRowLike[];
    editedCells: Map<string, string>;
    columns: string[];
    pkColumns: string[];
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    const {
        persistedRowIndices,
        displayRows,
        editedCells,
        columns,
        pkColumns,
        driver,
        columnTypes,
    } = params;
    if (persistedRowIndices.length === 0 || pkColumns.length === 0) return '';

    const rowClauses = persistedRowIndices
        .map(rowIndex => {
            const row = getPersistedRowByIndex(displayRows, rowIndex);
            if (!row) return '';
            const parts = pkColumns
                .map(pkCol => {
                    const colIdx = columns.indexOf(pkCol);
                    if (colIdx < 0) return '';
                    const value =
                        editedCells.get(`${rowIndex}:${colIdx}`) ?? row.values[colIdx] ?? '';
                    return `${quoteIdent(pkCol, driver)} = ${sqlValueLiteral(value, pkCol, columnTypes, driver)}`;
                })
                .filter(Boolean);
            if (parts.length === 0) return '';
            return parts.length > 1 ? `(${parts.join(' AND ')})` : parts[0];
        })
        .filter(Boolean);

    if (rowClauses.length === 0) return '';
    return rowClauses.join(' OR ');
}

export function buildWhereClauseBySelectionIn(params: {
    selectedCells: Set<string>;
    displayRowsByKey: Map<string, DisplayRowLike>;
    editedCells: Map<string, string>;
    columns: string[];
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    const { selectedCells, displayRowsByKey, editedCells, columns, driver, columnTypes } = params;
    if (selectedCells.size === 0) return '';

    let selectedColIdx: number | null = null;
    const values: string[] = [];

    selectedCells.forEach(cellId => {
        const { rowKey, colIdx } = parseCellId(cellId);
        const row = displayRowsByKey.get(rowKey);
        if (!row || colIdx < 0 || colIdx >= columns.length) return;
        if (selectedColIdx === null) selectedColIdx = colIdx;
        if (selectedColIdx !== colIdx) {
            selectedColIdx = -1;
            return;
        }
        const value =
            row.kind === 'persisted'
                ? (editedCells.get(`${row.persistedIndex}:${colIdx}`) ?? row.values[colIdx] ?? '')
                : (row.values[colIdx] ?? '');
        values.push(value);
    });

    if (selectedColIdx === null || selectedColIdx < 0) return '';
    const column = columns[selectedColIdx];
    if (!column) return '';

    const uniqueValues = Array.from(new Set(values));
    if (uniqueValues.length === 0) return '';

    const nonNullValues = uniqueValues.filter(value => value !== '');
    const hasNull = uniqueValues.length !== nonNullValues.length;
    const clauses: string[] = [];
    const quotedColumn = quoteIdent(column, driver);

    if (nonNullValues.length === 1) {
        clauses.push(
            `${quotedColumn} = ${sqlValueLiteral(nonNullValues[0], column, columnTypes, driver)}`,
        );
    } else if (nonNullValues.length > 1) {
        clauses.push(
            `${quotedColumn} IN (${nonNullValues
                .map(value => sqlValueLiteral(value, column, columnTypes, driver))
                .join(', ')})`,
        );
    }

    if (hasNull) {
        clauses.push(`${quotedColumn} IS NULL`);
    }

    if (clauses.length === 0) return '';
    return clauses.length > 1 ? `(${clauses.join(' OR ')})` : clauses[0];
}

export function buildSelectByPrimaryKeyQuery(params: {
    persistedRowIndex: number;
    displayRows: DisplayRowLike[];
    editedCells: Map<string, string>;
    columns: string[];
    pkColumns: string[];
    tableName: string;
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    const {
        persistedRowIndex,
        displayRows,
        editedCells,
        columns,
        pkColumns,
        tableName,
        driver,
        columnTypes,
    } = params;
    if (!tableName || pkColumns.length === 0) return '';
    const whereClause = buildWhereClauseByPrimaryKeys({
        persistedRowIndices: [persistedRowIndex],
        displayRows,
        editedCells,
        columns,
        pkColumns,
        driver,
        columnTypes,
    });
    if (!whereClause) return '';
    return `SELECT * FROM ${quoteIdent(tableName, driver)} WHERE ${whereClause};`;
}

export function applySetNullToSelection(params: {
    selectedCells: Set<string>;
    displayRowsByKey: Map<string, DisplayRowLike>;
    editedCells: Map<string, string>;
    draftRows: DraftRow[];
    nullableByColumnIndex: boolean[];
    /** Cells in these columns are left untouched: a blurred value must not be edited. */
    blurredColumnIndexes?: ReadonlySet<number>;
}): {
    nextEdited: Map<string, string>;
    nextDraftRows: DraftRow[];
    updatedCells: Set<string>;
    updatedCount: number;
    skippedCount: number;
    blurredSkippedCount: number;
} {
    const {
        selectedCells,
        displayRowsByKey,
        editedCells,
        draftRows,
        nullableByColumnIndex,
        blurredColumnIndexes,
    } = params;
    const nextEdited = new Map(editedCells);
    const nextDraftRows = draftRows.map(draftRow => ({
        ...draftRow,
        values: [...draftRow.values],
    }));
    const nextDraftById = new Map(nextDraftRows.map(draftRow => [draftRow.id, draftRow]));
    const updatedCells = new Set<string>();
    let updatedCount = 0;
    let skippedCount = 0;
    let blurredSkippedCount = 0;

    selectedCells.forEach(cellId => {
        const { rowKey, colIdx } = parseCellId(cellId);
        if (colIdx < 0 || colIdx >= nullableByColumnIndex.length) return;

        if (blurredColumnIndexes?.has(colIdx)) {
            blurredSkippedCount += 1;
            return;
        }

        if (!nullableByColumnIndex[colIdx]) {
            skippedCount += 1;
            return;
        }

        const displayRow = displayRowsByKey.get(rowKey);
        if (!displayRow) return;

        if (displayRow.kind === 'persisted') {
            nextEdited.set(`${displayRow.persistedIndex}:${colIdx}`, '');
        } else {
            const draftId = displayRow.draft?.id;
            const target = draftId ? nextDraftById.get(draftId) : null;
            if (!target) return;
            target.values[colIdx] = '';
        }

        updatedCells.add(cellId);
        updatedCount += 1;
    });

    return {
        nextEdited,
        nextDraftRows,
        updatedCells,
        updatedCount,
        skippedCount,
        blurredSkippedCount,
    };
}
