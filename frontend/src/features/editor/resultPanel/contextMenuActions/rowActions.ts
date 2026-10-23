// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayRow, DraftRow } from '../../../../lib/dataEditing';
import {
    buildSelectByPrimaryKeyQuery,
    type SqlLiteralColumnMap,
} from '../../../../features/editor/resultSelectionActions';
import { makeCellId } from '../../../../features/editor/resultPanelUtils';

export function resolveDeleteTargets(args: {
    selectedRowKeys: string[];
    contextMenuRowKey?: string;
}) {
    const targetRowKeys =
        args.selectedRowKeys.length > 0
            ? args.selectedRowKeys
            : args.contextMenuRowKey
              ? [args.contextMenuRowKey]
              : [];

    const targetDraftIds = targetRowKeys
        .filter(rowKey => rowKey.startsWith('d:'))
        .map(rowKey => rowKey.slice(2));
    const targetPersistedIndices = Array.from(
        new Set(
            targetRowKeys
                .filter(rowKey => rowKey.startsWith('p:'))
                .map(rowKey => Number(rowKey.slice(2)))
                .filter(rowIndex => Number.isFinite(rowIndex)),
        ),
    );

    return { targetRowKeys, targetDraftIds, targetPersistedIndices };
}

export function resolveDiscardTargets(args: {
    selectedRowKeys: string[];
    contextMenuRowKey?: string;
    editedCells: Map<string, string>;
    deletedRows: Set<number>;
}) {
    const targetRowKeys =
        args.selectedRowKeys.length > 0
            ? args.selectedRowKeys
            : args.contextMenuRowKey
              ? [args.contextMenuRowKey]
              : [];

    const editedRowKeys = new Set(
        Array.from(args.editedCells.keys()).map(cellKey => `p:${cellKey.split(':')[0]}`),
    );
    const deletedRowKeys = new Set(Array.from(args.deletedRows).map(rowIndex => `p:${rowIndex}`));

    const discardableRowKeys = targetRowKeys.filter(rowKey => {
        if (rowKey.startsWith('d:')) return true;
        return editedRowKeys.has(rowKey) || deletedRowKeys.has(rowKey);
    });

    const targetDraftIds = discardableRowKeys
        .filter(rowKey => rowKey.startsWith('d:'))
        .map(rowKey => rowKey.slice(2));
    const targetPersistedIndices = Array.from(
        new Set(
            discardableRowKeys
                .filter(rowKey => rowKey.startsWith('p:'))
                .map(rowKey => Number(rowKey.slice(2)))
                .filter(rowIndex => Number.isFinite(rowIndex)),
        ),
    );

    return { discardableRowKeys, targetDraftIds, targetPersistedIndices };
}

export function buildDuplicatedDraftRows(args: {
    selectedRowKeys: string[];
    contextMenuRow?: DisplayRow;
    displayRows: DisplayRow[];
    getPersistedRowValues: (rowIndex: number) => string[];
}) {
    const selectedRowSet = new Set(args.selectedRowKeys);
    let targetRows = args.displayRows.filter(
        row => row.kind === 'persisted' && selectedRowSet.has(row.key),
    );
    if (targetRows.length === 0 && args.contextMenuRow?.kind === 'persisted') {
        targetRows = [args.contextMenuRow];
    }
    if (targetRows.length === 0) return null;

    const lastRow = targetRows[targetRows.length - 1];
    const duplicated: DraftRow[] = targetRows.map(row => ({
        id: crypto.randomUUID(),
        kind: 'duplicate',
        values: args.getPersistedRowValues(row.persistedIndex as number),
        insertAfterRowIndex: lastRow.persistedIndex ?? null,
        sourceRowIndex: row.persistedIndex,
    }));

    return {
        duplicated,
        firstDraftKey: `d:${duplicated[0].id}`,
        selectedCell: makeCellId(`d:${duplicated[0].id}`, 0),
    };
}

export function buildOpenRowQueries(args: {
    persistedRowIndices: number[];
    displayRows: DisplayRow[];
    editedCells: Map<string, string>;
    columns: string[];
    pkColumns: string[];
    tableName: string;
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
    maxTabs?: number;
}) {
    const maxTabs = args.maxTabs ?? 5;
    const targetIndices = args.persistedRowIndices.slice(0, maxTabs);
    const queries = targetIndices
        .map(rowIndex =>
            buildSelectByPrimaryKeyQuery({
                persistedRowIndex: rowIndex,
                displayRows: args.displayRows,
                editedCells: args.editedCells,
                columns: args.columns,
                pkColumns: args.pkColumns,
                tableName: args.tableName,
                driver: args.driver,
                columnTypes: args.columnTypes,
            }),
        )
        .filter(Boolean);

    return {
        queries,
        openedCount: queries.length,
        skippedCount: Math.max(0, args.persistedRowIndices.length - maxTabs),
        maxTabs,
    };
}
