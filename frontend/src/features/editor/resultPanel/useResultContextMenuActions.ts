// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { DraftRow } from '../../../lib/dataEditing';
import {
    getEffectiveSelection as resolveEffectiveSelection,
    getSelectedColumnIndexes as resolveSelectedColumnIndexes,
    getSelectionColumnRange as resolveSelectionColumnRange,
    getSingleSelectedColumnIndex as resolveSingleSelectedColumnIndex,
    getTargetPersistedRowIndices as resolveTargetPersistedRowIndices,
} from './contextMenuSelection';
import { popUndoEntry, pushUndoEntry, type UndoEntry } from '../../../lib/contextMenuUndoStack';
import { useToast } from '../../../components/layout/Toast';
import type { ResultContextMenuDeps } from './types';
import { type ContextMenuSnapshot } from './contextMenuActions/cellActions';
import { useResultContextMenuCellActions } from './contextMenu/useResultContextMenuCellActions';
import { useResultContextMenuColumnActions } from './contextMenu/useResultContextMenuColumnActions';
import { useResultContextMenuCopyActions } from './contextMenu/useResultContextMenuCopyActions';
import { useResultContextMenuRowActions } from './contextMenu/useResultContextMenuRowActions';
import { useResultContextMenuState } from './contextMenu/useResultContextMenuState';

/**
 * Public seam for the result-grid right-click menu: given the grid's current
 * state and mutation callbacks (deps), returns the available actions, their
 * disabled/title strings, and the handlers to invoke them. The cell/column/
 * row/copy hooks in ./contextMenu/ are this module's internal implementation
 * -- split into files for readability, not because they're independently
 * useful seams -- and are not meant to be imported from anywhere else.
 */
export function useResultContextMenuActions(deps: ResultContextMenuDeps) {
    const { toast } = useToast();
    const resetSignature = `${deps.result?.isDone ? 1 : 0}:${deps.result?.lastExecutedQuery || ''}`;
    const {
        contextMenu,
        contextMenuRef,
        contextMenuPosition,
        closeContextMenu,
        handleCellContextMenu,
    } = useResultContextMenuState(resetSignature);

    const cloneDraftRows = React.useCallback(
        (rows: DraftRow[]) => rows.map(row => ({ ...row, values: [...row.values] })),
        [],
    );
    const captureSnapshot = React.useCallback(
        () => ({
            editedCells: new Map(deps.editedCells),
            draftRows: cloneDraftRows(deps.draftRows),
            deletedRows: new Set(deps.deletedRows),
            selectedCells: new Set(deps.selectedCells),
        }),
        [cloneDraftRows, deps.deletedRows, deps.draftRows, deps.editedCells, deps.selectedCells],
    );

    type Snapshot = ContextMenuSnapshot;
    const undoStackRef = React.useRef<UndoEntry<Snapshot>[]>([]);
    const [undoStackSize, setUndoStackSize] = React.useState(0);

    const registerUndoAction = React.useCallback((label: string, snapshot: Snapshot) => {
        undoStackRef.current = pushUndoEntry(undoStackRef.current, { label, snapshot });
        setUndoStackSize(undoStackRef.current.length);
    }, []);

    React.useEffect(() => {
        undoStackRef.current = [];
        setUndoStackSize(0);
    }, [resetSignature]);

    const nullableByColumnIndex = React.useMemo(
        () =>
            (deps.result?.columns || []).map(
                columnName => deps.columnDefsByName.get(columnName)?.IsNullable ?? true,
            ),
        [deps.columnDefsByName, deps.result?.columns],
    );
    const contextMenuRow = React.useMemo(
        () => (contextMenu ? deps.displayRowsByKey.get(contextMenu.rowKey) : undefined),
        [contextMenu, deps.displayRowsByKey],
    );

    const hasEditableCellSelection = deps.selectedCells.size > 0 || Boolean(contextMenu?.cellId);
    const canMutateCells =
        deps.isEditable && !deps.isReadOnlyTab && !deps.viewMode && !deps.isSavingDraftRows;
    const canMutateRows =
        deps.canManageDraftRows && !deps.isReadOnlyTab && !deps.viewMode && !deps.isSavingDraftRows;
    const canDeleteRows =
        deps.selectedPersistedRowIndices.length > 0 ||
        deps.selectedDraftIds.length > 0 ||
        Boolean(contextMenuRow);
    const canDiscardChanges =
        deps.selectedRowKeys.length > 0
            ? deps.selectedRowKeys.some(
                  rowKey =>
                      rowKey.startsWith('d:') ||
                      deps.deletedRows.has(Number(rowKey.slice(2))) ||
                      Array.from(deps.editedCells.keys()).some(cellKey =>
                          cellKey.startsWith(`${rowKey.slice(2)}:`),
                      ),
              )
            : Boolean(
                  contextMenuRow &&
                  (contextMenuRow.kind === 'draft' ||
                      (contextMenuRow.kind === 'persisted' &&
                          (deps.deletedRows.has(contextMenuRow.persistedIndex as number) ||
                              Array.from(deps.editedCells.keys()).some(cellKey =>
                                  cellKey.startsWith(`${contextMenuRow.persistedIndex}:`),
                              )))),
              );
    const canDuplicateRows =
        deps.selectedPersistedRowIndices.length > 0 || contextMenuRow?.kind === 'persisted';
    const canCopy = hasEditableCellSelection || deps.selectedRowKeysFromHeader.length > 0;
    const canSetNull = canMutateCells && hasEditableCellSelection;
    const canPaste = canMutateCells && hasEditableCellSelection;

    const pkColumns = React.useMemo(
        () =>
            Array.from(deps.columnDefsByName.values())
                .filter(column => column.IsPrimaryKey)
                .map(column => column.Name),
        [deps.columnDefsByName],
    );

    const getEffectiveSelection = React.useCallback(
        () => resolveEffectiveSelection(deps.selectedCells, contextMenu?.cellId),
        [contextMenu?.cellId, deps.selectedCells],
    );

    const getSingleSelectedColumnIndex = React.useCallback(
        () => resolveSingleSelectedColumnIndex(getEffectiveSelection()),
        [getEffectiveSelection],
    );
    const getSelectedColumnIndexes = React.useCallback(
        () =>
            resolveSelectedColumnIndexes(
                getEffectiveSelection(),
                contextMenu?.target === 'cell' ? contextMenu.colIdx : null,
            ),
        [contextMenu, getEffectiveSelection],
    );

    const targetColumnIndex = React.useMemo(() => {
        if (contextMenu?.target === 'cell') return contextMenu.colIdx;
        return getSingleSelectedColumnIndex();
    }, [contextMenu, getSingleSelectedColumnIndex]);

    const getTargetPersistedRowIndices = React.useCallback(
        (): number[] =>
            resolveTargetPersistedRowIndices({
                selectedRowKeysFromHeader: deps.selectedRowKeysFromHeader,
                selectedRowKeys: deps.selectedRowKeys,
                effectiveSelection: getEffectiveSelection(),
                contextMenuRowKey: contextMenu?.rowKey,
            }),
        [
            contextMenu?.rowKey,
            deps.selectedRowKeys,
            deps.selectedRowKeysFromHeader,
            getEffectiveSelection,
        ],
    );

    const {
        copyDisabledTitle,
        pasteDisabledTitle,
        pasteActions,
        copyAsActions,
        whereActions,
        handleContextCopy,
        handleContextPaste,
    } = useResultContextMenuCopyActions({
        deps,
        contextMenu,
        canCopy,
        canPaste,
        canMutateCells,
        getEffectiveSelection,
        getSingleSelectedColumnIndex,
        getSelectionColumnRange: resolveSelectionColumnRange,
        pkColumns,
        closeContextMenu,
        captureSnapshot,
        registerUndoAction,
        toast,
    });

    const { setNullDisabledTitle, columnBlurAction, handleContextSetNull } =
        useResultContextMenuCellActions({
            deps,
            contextMenu,
            selectedColumnIndexes: getSelectedColumnIndexes(),
            canMutateCells,
            canSetNull,
            nullableByColumnIndex,
            getEffectiveSelection,
            closeContextMenu,
            captureSnapshot,
            registerUndoAction,
            toast,
        });

    const {
        canOpenRowInNewQueryTab,
        discardChangesDisabledTitle,
        duplicateDisabledTitle,
        deleteDisabledTitle,
        openRowQueryDisabledTitle,
        handleContextDiscardChanges,
        handleOpenRowInNewQueryTab,
        handleContextDelete,
        handleContextDuplicate,
    } = useResultContextMenuRowActions({
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
    });

    const columnVisibilityActions = useResultContextMenuColumnActions({
        deps,
        contextMenu,
        selectedColumnIndexes: getSelectedColumnIndexes(),
        closeContextMenu,
    });

    const handleUndoLastContextAction = React.useCallback(() => {
        const { popped, stack } = popUndoEntry(undoStackRef.current);
        if (!popped) {
            toast.info('No context action to undo.');
            closeContextMenu();
            return;
        }
        const { snapshot } = popped;
        deps.setEditedCells(new Map(snapshot.editedCells));
        deps.setDraftRows(cloneDraftRows(snapshot.draftRows));
        deps.setDeletedRows(new Set(snapshot.deletedRows));
        deps.setSelectedCells(new Set(snapshot.selectedCells));
        undoStackRef.current = stack;
        setUndoStackSize(stack.length);
        closeContextMenu();
    }, [closeContextMenu, cloneDraftRows, deps, toast]);

    const undoDisabledTitle = undoStackRef.current[undoStackRef.current.length - 1]
        ? `Undo ${undoStackRef.current[undoStackRef.current.length - 1].label} (${undoStackSize} action${undoStackSize !== 1 ? 's' : ''} available)`
        : 'No context action to undo.';

    return {
        contextMenu,
        contextMenuRef,
        contextMenuPosition,
        canCopy,
        canPaste,
        canSetNull,
        canDiscardChanges: canDiscardChanges && canMutateRows,
        canDeleteRows: canDeleteRows && canMutateRows,
        canDuplicateRows: canDuplicateRows && canMutateRows,
        copyDisabledTitle,
        pasteDisabledTitle,
        pasteActions,
        setNullDisabledTitle,
        discardChangesDisabledTitle,
        duplicateDisabledTitle,
        deleteDisabledTitle,
        undoDisabledTitle,
        openRowQueryDisabledTitle,
        copyAsActions,
        whereActions,
        columnBlurAction,
        columnVisibilityActions,
        canOpenRowInNewQueryTab,
        canUndoLastContextAction: undoStackSize > 0,
        handleCellContextMenu,
        handleContextCopy,
        handleContextSetNull,
        handleContextPaste,
        handleContextDiscardChanges,
        handleContextDelete,
        handleContextDuplicate,
        handleOpenRowInNewQueryTab,
        handleUndoLastContextAction,
    };
}
