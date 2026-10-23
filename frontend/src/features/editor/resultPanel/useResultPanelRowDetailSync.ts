// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { models } from '../../../../wailsjs/go/models';
import { useRowDetailStore } from '../../../stores/rowDetailStore';
import type { ResultPanelRowDetailSyncDeps } from './types';

export function useResultPanelRowDetailSync({
    result,
    showRightSidebar,
    selectedRowKeys,
    displayRowsByKey,
    getPersistedRowValues,
    columnDefsByName,
    qualifiedTableName,
    blurredColumnIndexes,
    setEditedCells,
    setDraftRows,
}: ResultPanelRowDetailSyncDeps) {
    const { openDetail, clearDetail } = useRowDetailStore();

    const handleRowDetailSave = React.useCallback(
        (rowKey: string, colIdx: number, newVal: string) => {
            if (rowKey.startsWith('p:')) {
                const persistedIndex = Number(rowKey.slice(2));
                setEditedCells(prev => {
                    const next = new Map(prev);
                    next.set(`${persistedIndex}:${colIdx}`, newVal);
                    return next;
                });
                return;
            }

            const draftId = rowKey.slice(2);
            setDraftRows(prev =>
                prev.map(dr => {
                    if (dr.id !== draftId) return dr;
                    const vals = [...dr.values];
                    vals[colIdx] = newVal;
                    return { ...dr, values: vals };
                }),
            );
        },
        [setDraftRows, setEditedCells],
    );

    React.useEffect(() => {
        if (!showRightSidebar || selectedRowKeys.length === 0 || !result?.isDone) {
            clearDetail();
            return;
        }

        const activeRowKey = selectedRowKeys[0];
        const displayRow = displayRowsByKey.get(activeRowKey);
        if (!displayRow) {
            clearDetail();
            return;
        }

        const rowValues =
            displayRow.kind === 'persisted'
                ? getPersistedRowValues(displayRow.persistedIndex as number)
                : [...displayRow.values];

        openDetail({
            columns: result.columns,
            columnTypes: result.columns.map(col => columnDefsByName.get(col)?.DataType || ''),
            columnDefs: result.columns.map(
                col =>
                    columnDefsByName.get(col) ||
                    models.ColumnDef.createFrom({
                        Name: col,
                        DataType: '',
                        IsNullable: true,
                        IsPrimaryKey: false,
                        DefaultValue: '',
                    }),
            ),
            row: rowValues,
            tableName: qualifiedTableName || result.tableName,
            primaryKeys: result.primaryKeys,
            blurredColumnIndexes,
            onSave: (colIdx, newVal) => handleRowDetailSave(activeRowKey, colIdx, newVal),
        });
    }, [
        blurredColumnIndexes,
        clearDetail,
        columnDefsByName,
        displayRowsByKey,
        getPersistedRowValues,
        handleRowDetailSave,
        openDetail,
        qualifiedTableName,
        result,
        selectedRowKeys,
        showRightSidebar,
    ]);
}
