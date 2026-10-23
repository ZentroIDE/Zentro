// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { DisplayRow, DraftRow } from '../../../../lib/dataEditing';
import type { FocusCellRequest } from '../../useResultEditing';
import type { ResultContextMenuDeps, ResultContextMenuPayload } from '../types';
import {
    buildDuplicatedDraftRows,
    buildOpenRowQueries,
    resolveDiscardTargets,
    resolveDeleteTargets,
} from '../contextMenuActions/rowActions';
import { toSqlLiteralColumnMap } from '../../resultSelectionActions';

interface Snapshot {
    editedCells: Map<string, string>;
    draftRows: DraftRow[];
    deletedRows: Set<number>;
    selectedCells: Set<string>;
}

interface UseResultContextMenuRowActionsArgs {
    deps: ResultContextMenuDeps;
    contextMenu: ResultContextMenuPayload | null;
    contextMenuRow?: DisplayRow;
    pkColumns: string[];
    canMutateRows: boolean;
    canDiscardChanges: boolean;
    canDeleteRows: boolean;
    canDuplicateRows: boolean;
    getTargetPersistedRowIndices: () => number[];
    closeContextMenu: () => void;
    captureSnapshot: () => Snapshot;
    registerUndoAction: (label: string, snapshot: Snapshot) => void;
    toast: {
        info: (message: string) => void;
        error: (message: string) => void;
    };
}

export function useResultContextMenuRowActions({
    deps,
    contextMenu,
    contextMenuRow,
    pkColumns,
    canMutateRows,
    canDiscardChanges,
    canDeleteRows,
    canDuplicateRows,
    getTargetPersistedRowIndices,
    closeContextMenu,
    captureSnapshot,
    registerUndoAction,
    toast,
}: UseResultContextMenuRowActionsArgs) {
    const handleOpenRowInNewQueryTab = React.useCallback(() => {
        const persistedRowIndices = getTargetPersistedRowIndices();
        if (persistedRowIndices.length === 0) {
            toast.info('Right-click a persisted row (or select one) to open row query.');
            closeContextMenu();
            return;
        }
        if (!deps.result?.tableName) {
            toast.info('No table context available for this result.');
            closeContextMenu();
            return;
        }
        if (pkColumns.length === 0) {
            toast.info('Primary key is required to open row query.');
            closeContextMenu();
            return;
        }
        const columns = deps.result.columns ?? [];
        // The generated SELECT embeds the PK values as literals in a visible editor tab.
        if (pkColumns.some(pk => deps.blurredColumnIndexes?.has(columns.indexOf(pk)))) {
            toast.info('Primary key column is blurred. Unblur it to open the row query.');
            closeContextMenu();
            return;
        }
        const tableName = deps.result.tableName;
        const { queries, openedCount, skippedCount, maxTabs } = buildOpenRowQueries({
            persistedRowIndices,
            displayRows: deps.displayRows,
            editedCells: deps.editedCells,
            columns,
            pkColumns,
            tableName,
            driver: deps.driver || '',
            columnTypes: toSqlLiteralColumnMap(deps.columnDefsByName),
        });
        queries.forEach(query => {
            deps.openQueryTab(query, `Row ${tableName}`);
        });
        if (openedCount === 0) {
            toast.info('Unable to build query from selected row.');
            closeContextMenu();
            return;
        }
        if (skippedCount > 0) {
            toast.info(`Opened ${maxTabs} tabs (capped). ${skippedCount} rows skipped.`);
        }
        closeContextMenu();
    }, [closeContextMenu, deps, getTargetPersistedRowIndices, pkColumns, toast]);

    const handleContextDelete = React.useCallback(() => {
        if (!canMutateRows) {
            toast.error('Row actions are unavailable in current mode.');
            closeContextMenu();
            return;
        }

        const { targetRowKeys, targetDraftIds, targetPersistedIndices } = resolveDeleteTargets({
            selectedRowKeys: deps.selectedRowKeys,
            contextMenuRowKey: contextMenu?.rowKey,
        });
        if (targetRowKeys.length === 0) {
            toast.info('Select row(s) to delete.');
            closeContextMenu();
            return;
        }

        if (targetPersistedIndices.length > 0 && !deps.isEditable) {
            toast.error('Result is read-only. Make sure the query includes the primary key(s).');
            closeContextMenu();
            return;
        }

        if (targetDraftIds.length > 0) {
            registerUndoAction('delete row', captureSnapshot());
            deps.removeDraftRows(targetDraftIds);
        }
        if (targetPersistedIndices.length > 0) {
            if (targetDraftIds.length === 0) {
                registerUndoAction('delete row', captureSnapshot());
            }
            deps.setDeletedRows(prev => {
                const next = new Set(prev);
                targetPersistedIndices.forEach(rowIndex => next.add(rowIndex));
                return next;
            });
        }

        closeContextMenu();
    }, [
        canMutateRows,
        captureSnapshot,
        closeContextMenu,
        contextMenu?.rowKey,
        deps,
        registerUndoAction,
        toast,
    ]);

    const handleContextDiscardChanges = React.useCallback(() => {
        if (!canMutateRows) {
            toast.error('Row actions are unavailable in current mode.');
            closeContextMenu();
            return;
        }

        const { discardableRowKeys, targetDraftIds, targetPersistedIndices } =
            resolveDiscardTargets({
                selectedRowKeys: deps.selectedRowKeys,
                contextMenuRowKey: contextMenu?.rowKey,
                editedCells: deps.editedCells,
                deletedRows: deps.deletedRows,
            });
        if (discardableRowKeys.length === 0) {
            toast.info('Select modified row(s) to discard changes.');
            closeContextMenu();
            return;
        }

        registerUndoAction('discard changes', captureSnapshot());

        if (targetDraftIds.length > 0) {
            deps.removeDraftRows(targetDraftIds);
        }

        if (targetPersistedIndices.length > 0) {
            deps.setEditedCells(prev => {
                const next = new Map(prev);
                targetPersistedIndices.forEach(rowIndex => {
                    Array.from(next.keys()).forEach(cellKey => {
                        if (cellKey.startsWith(`${rowIndex}:`)) {
                            next.delete(cellKey);
                        }
                    });
                });
                return next;
            });
            deps.setDeletedRows(prev => {
                const next = new Set(prev);
                targetPersistedIndices.forEach(rowIndex => next.delete(rowIndex));
                return next;
            });
        }

        closeContextMenu();
    }, [
        canMutateRows,
        captureSnapshot,
        closeContextMenu,
        contextMenu?.rowKey,
        deps,
        registerUndoAction,
        toast,
    ]);

    const handleContextDuplicate = React.useCallback(() => {
        if (!canMutateRows) {
            toast.error('Row actions are unavailable in current mode.');
            closeContextMenu();
            return;
        }

        const duplicatedResult = buildDuplicatedDraftRows({
            selectedRowKeys: deps.selectedRowKeys,
            contextMenuRow,
            displayRows: deps.displayRows,
            getPersistedRowValues: deps.getPersistedRowValues,
        });
        if (!duplicatedResult) {
            toast.info('Select at least one persisted row to duplicate.');
            closeContextMenu();
            return;
        }

        registerUndoAction('duplicate row', captureSnapshot());
        deps.setDraftRows(prev => [...prev, ...duplicatedResult.duplicated]);
        deps.setSelectedCells(new Set([duplicatedResult.selectedCell]));
        deps.setFocusCellRequest({
            rowKey: duplicatedResult.firstDraftKey,
            colIdx: 0,
            nonce: Date.now(),
        } as FocusCellRequest);
        closeContextMenu();
    }, [
        canMutateRows,
        captureSnapshot,
        closeContextMenu,
        contextMenuRow,
        deps,
        registerUndoAction,
        toast,
    ]);

    const canOpenRowInNewQueryTab =
        Boolean(deps.result?.tableName) &&
        getTargetPersistedRowIndices().length > 0 &&
        pkColumns.length > 0;
    const duplicateDisabledTitle =
        canDuplicateRows && canMutateRows
            ? 'Duplicate selected persisted row(s)'
            : !canMutateRows
              ? 'Row actions are unavailable in current mode.'
              : 'Select at least one persisted row to duplicate.';
    const deleteDisabledTitle =
        canDeleteRows && canMutateRows
            ? 'Delete selected row(s)'
            : !canMutateRows
              ? 'Row actions are unavailable in current mode.'
              : 'Select row(s) to delete.';
    const discardChangesDisabledTitle =
        canDiscardChanges && canMutateRows
            ? 'Discard pending changes for selected row(s)'
            : !canMutateRows
              ? 'Row actions are unavailable in current mode.'
              : 'Select modified row(s) to discard changes.';
    const openRowQueryDisabledTitle = canOpenRowInNewQueryTab
        ? 'Open SELECT query in a new tab for the selected row'
        : pkColumns.length === 0
          ? 'Primary key is required to open row query.'
          : 'Select a persisted row first.';

    return {
        canOpenRowInNewQueryTab,
        discardChangesDisabledTitle,
        duplicateDisabledTitle,
        deleteDisabledTitle,
        openRowQueryDisabledTitle,
        handleContextDiscardChanges,
        handleOpenRowInNewQueryTab,
        handleContextDelete,
        handleContextDuplicate,
    };
}
