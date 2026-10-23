// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { DraftRow, DisplayRow } from '../../../lib/dataEditing';
import type { TabResult } from '../../../stores/resultStore';
import type { FocusCellRequest } from '../../../features/editor/useResultEditing';
import { useResultKeyboard } from '../../../features/editor/useResultKeyboard';
import { useSearchHits } from './useSearchHits';
import { useResultContextMenuActions } from './useResultContextMenuActions';

interface UseResultPanelInteractionsOptions {
    tabId: string;
    result: TabResult | undefined;
    driver: string | undefined;
    quickFilter: string;
    isReadOnlyTab: boolean;
    viewMode: boolean;
    isEditable: boolean;
    hasPendingChanges: boolean;
    isSavingDraftRows: boolean;
    canManageDraftRows: boolean;
    canUseResultSearch: boolean;
    canUseResultJump: boolean;
    canUseScreenshotBlur: boolean;
    selectedCells: Set<string>;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedRowKeys: string[];
    selectedRowKeysFromHeader: Set<string>;
    selectedPersistedRowIndices: number[];
    selectedDraftIds: string[];
    displayRows: DisplayRow[];
    displayRowsByKey: Map<string, DisplayRow>;
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    setEditedCells: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    deletedRows: Set<number>;
    setDeletedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
    draftRows: DraftRow[];
    setDraftRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
    columnDefsByName: Map<string, { Name: string; IsPrimaryKey: boolean; IsNullable: boolean }>;
    getPersistedRowValues: (rowIndex: number) => string[];
    removeDraftRows: (draftIds: string[]) => void;
    openContextQueryTab: (query: string, title?: string) => void;
    blurredColumnIndexes?: Set<number>;
    setColumnBlurOverride: (colIdx: number, blurred: boolean) => void;
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    setShowColumnsPopover: React.Dispatch<React.SetStateAction<boolean>>;
    quickFilterRef: React.RefObject<HTMLInputElement>;
    jumpRowRef: React.RefObject<HTMLInputElement>;
    setFocusCellRequest: React.Dispatch<React.SetStateAction<FocusCellRequest | null>>;
    onRun?: () => void;
    onSaveRequest: () => Promise<void>;
    onSetShowRightSidebar: (show: boolean) => void;
}

export function useResultPanelInteractions({
    tabId,
    result,
    driver,
    quickFilter,
    isReadOnlyTab,
    viewMode,
    isEditable,
    hasPendingChanges,
    isSavingDraftRows,
    canManageDraftRows,
    canUseResultSearch,
    canUseResultJump,
    canUseScreenshotBlur,
    selectedCells,
    setSelectedCells,
    selectedRowKeys,
    selectedRowKeysFromHeader,
    selectedPersistedRowIndices,
    selectedDraftIds,
    displayRows,
    displayRowsByKey,
    rowOrder,
    editedCells,
    setEditedCells,
    deletedRows,
    setDeletedRows,
    draftRows,
    setDraftRows,
    columnDefsByName,
    getPersistedRowValues,
    removeDraftRows,
    openContextQueryTab,
    blurredColumnIndexes,
    setColumnBlurOverride,
    columnVisibility,
    setColumnVisibility,
    setShowColumnsPopover,
    quickFilterRef,
    jumpRowRef,
    setFocusCellRequest,
    onRun,
    onSaveRequest,
    onSetShowRightSidebar,
}: UseResultPanelInteractionsOptions) {
    const { jumpToNextHit, jumpToPrevHit } = useSearchHits({
        result,
        quickFilter,
        setFocusCellRequest,
    });

    const contextMenuActions = useResultContextMenuActions({
        result,
        driver,
        displayRows,
        displayRowsByKey,
        rowOrder,
        editedCells,
        selectedCells,
        selectedRowKeys,
        selectedRowKeysFromHeader: Array.from(selectedRowKeysFromHeader),
        selectedPersistedRowIndices,
        selectedDraftIds,
        draftRows,
        deletedRows,
        columnDefsByName,
        isEditable,
        canManageDraftRows,
        isReadOnlyTab,
        viewMode,
        isSavingDraftRows,
        getPersistedRowValues,
        removeDraftRows,
        setEditedCells,
        setDraftRows,
        setSelectedCells,
        setDeletedRows,
        setFocusCellRequest,
        openQueryTab: openContextQueryTab,
        blurredColumnIndexes,
        canBlurColumns: canUseScreenshotBlur,
        setColumnBlurOverride,
        columnVisibility,
        setColumnVisibility,
    });

    const handleCellContextMenuWithTarget = React.useCallback(
        (payload: { x: number; y: number; rowKey: string; colIdx: number; cellId?: string }) => {
            contextMenuActions.handleCellContextMenu({ ...payload, target: 'cell' });
        },
        [contextMenuActions],
    );

    const handleRowHeaderContextMenuWithTarget = React.useCallback(
        (payload: { x: number; y: number; rowKey: string; colIdx: number; cellId?: string }) => {
            contextMenuActions.handleCellContextMenu({ ...payload, target: 'row-header' });
        },
        [contextMenuActions],
    );

    React.useEffect(() => {
        setColumnVisibility({});
        setShowColumnsPopover(false);
    }, [result?.lastExecutedQuery, setColumnVisibility, setShowColumnsPopover]);

    const { handleKeyDown } = useResultKeyboard({
        tabId,
        result,
        hasPendingChanges,
        viewMode,
        isEditable,
        selectedCells,
        setSelectedCells,
        selectedRowKeys,
        displayRows,
        displayRowsByKey,
        rowOrder,
        editedCells,
        deletedRows,
        draftRows,
        isSavingDraftRows,
        blurredColumnIndexes,
        onRun,
        onSaveRequest,
        onDeleteSelected: contextMenuActions.handleContextDelete,
        onUndoLastAction: contextMenuActions.handleUndoLastContextAction,
        onSetShowRightSidebar,
        onFocusSearch: () => {
            if (canUseResultSearch) quickFilterRef.current?.focus();
        },
        onFocusJump: () => {
            if (canUseResultJump) jumpRowRef.current?.focus();
        },
        onSearchNext: () => {
            if (canUseResultSearch) jumpToNextHit();
        },
        onSearchPrev: () => {
            if (canUseResultSearch) jumpToPrevHit();
        },
        setEditedCells,
        setDraftRows,
    });

    return {
        ...contextMenuActions,
        handleCellContextMenuWithTarget,
        handleRowHeaderContextMenuWithTarget,
        handleKeyDown,
    } as const;
}
