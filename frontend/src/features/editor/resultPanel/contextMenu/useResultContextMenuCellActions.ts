// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { DraftRow } from '../../../../lib/dataEditing';
import type {
    ResultContextColumnBlurAction,
    ResultContextMenuDeps,
    ResultContextMenuPayload,
} from '../types';
import { buildSetNullResult } from '../contextMenuActions/cellActions';

interface Snapshot {
    editedCells: Map<string, string>;
    draftRows: DraftRow[];
    deletedRows: Set<number>;
    selectedCells: Set<string>;
}

interface UseResultContextMenuCellActionsArgs {
    deps: ResultContextMenuDeps;
    contextMenu: ResultContextMenuPayload | null;
    selectedColumnIndexes: number[];
    canMutateCells: boolean;
    canSetNull: boolean;
    nullableByColumnIndex: boolean[];
    getEffectiveSelection: () => Set<string>;
    closeContextMenu: () => void;
    captureSnapshot: () => Snapshot;
    registerUndoAction: (label: string, snapshot: Snapshot) => void;
    toast: {
        info: (message: string) => void;
        error: (message: string) => void;
    };
}

export function useResultContextMenuCellActions({
    deps,
    contextMenu,
    selectedColumnIndexes,
    canMutateCells,
    canSetNull,
    nullableByColumnIndex,
    getEffectiveSelection,
    closeContextMenu,
    captureSnapshot,
    registerUndoAction,
    toast,
}: UseResultContextMenuCellActionsArgs) {
    const handleToggleColumnBlur = React.useCallback(() => {
        if (!deps.canBlurColumns) {
            closeContextMenu();
            return;
        }
        if (selectedColumnIndexes.length === 0) {
            toast.info('Right-click a data cell or select at least one column first.');
            closeContextMenu();
            return;
        }
        const shouldBlur = selectedColumnIndexes.some(
            columnIndex => deps.blurredColumnIndexes?.has(columnIndex) !== true,
        );
        selectedColumnIndexes.forEach(columnIndex => {
            deps.setColumnBlurOverride(columnIndex, shouldBlur);
        });
        closeContextMenu();
    }, [closeContextMenu, deps, selectedColumnIndexes, toast]);

    const handleContextSetNull = React.useCallback(() => {
        if (!canMutateCells) {
            toast.error('Result is read-only. Set NULL is unavailable.');
            closeContextMenu();
            return;
        }

        const effectiveSelection = getEffectiveSelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to set NULL.');
            closeContextMenu();
            return;
        }

        const setNullResult = buildSetNullResult({
            selectedCells: effectiveSelection,
            displayRowsByKey: deps.displayRowsByKey,
            editedCells: deps.editedCells,
            draftRows: deps.draftRows,
            nullableByColumnIndex,
            blurredColumnIndexes: deps.blurredColumnIndexes,
        });

        if (setNullResult.updatedCount > 0) {
            registerUndoAction('set NULL', captureSnapshot());
            deps.setEditedCells(setNullResult.nextEdited);
            deps.setDraftRows(setNullResult.nextDraftRows);
            deps.setSelectedCells(setNullResult.updatedCells);
        }

        const skippedParts = [
            setNullResult.skippedCount > 0 ? `${setNullResult.skippedCount} non-nullable` : '',
            setNullResult.blurredSkippedCount > 0
                ? `${setNullResult.blurredSkippedCount} blurred`
                : '',
        ].filter(Boolean);
        if (setNullResult.updatedCount === 0 && skippedParts.length === 0) {
            toast.info('No editable cells in current selection.');
        } else if (setNullResult.updatedCount === 0) {
            toast.info(`Skipped ${skippedParts.join(' and ')} cell(s).`);
        } else if (skippedParts.length > 0) {
            toast.info(
                `Set NULL for ${setNullResult.updatedCount} cell(s), skipped ${skippedParts.join(' and ')} cell(s).`,
            );
        }

        closeContextMenu();
    }, [
        canMutateCells,
        captureSnapshot,
        closeContextMenu,
        deps.blurredColumnIndexes,
        deps.displayRowsByKey,
        deps.draftRows,
        deps.editedCells,
        deps.setDraftRows,
        deps.setEditedCells,
        deps.setSelectedCells,
        getEffectiveSelection,
        nullableByColumnIndex,
        registerUndoAction,
        toast,
    ]);

    const setNullDisabledTitle = canSetNull
        ? 'Set selected editable cells to NULL'
        : !canMutateCells
          ? 'Result is read-only. Set NULL is unavailable.'
          : 'Select at least one editable cell.';

    const canToggleColumnBlur = deps.canBlurColumns && selectedColumnIndexes.length > 0;
    const areAllSelectedColumnsBlurred =
        selectedColumnIndexes.length > 0 &&
        selectedColumnIndexes.every(columnIndex => deps.blurredColumnIndexes?.has(columnIndex));

    const columnBlurAction = React.useMemo<ResultContextColumnBlurAction | null>(() => {
        if (contextMenu?.target !== 'cell' && selectedColumnIndexes.length === 0) {
            return null;
        }
        const isMultiColumn = selectedColumnIndexes.length > 1;
        const label = areAllSelectedColumnsBlurred
            ? isMultiColumn
                ? 'Unblur Selected Columns'
                : 'Unblur Column'
            : isMultiColumn
              ? 'Blur Selected Columns'
              : 'Blur Column';
        return {
            id: areAllSelectedColumnsBlurred ? 'unblur-column' : 'blur-column',
            label,
            onSelect: handleToggleColumnBlur,
            disabled: !canToggleColumnBlur,
            title: canToggleColumnBlur
                ? `${label} in the result grid`
                : !deps.canBlurColumns
                  ? 'Screenshot blur is unavailable for the current license.'
                  : 'Right-click a data cell or select at least one column first.',
        };
    }, [
        areAllSelectedColumnsBlurred,
        canToggleColumnBlur,
        contextMenu?.target,
        deps.canBlurColumns,
        handleToggleColumnBlur,
        selectedColumnIndexes.length,
    ]);

    return {
        setNullDisabledTitle,
        columnBlurAction,
        handleContextSetNull,
    };
}
