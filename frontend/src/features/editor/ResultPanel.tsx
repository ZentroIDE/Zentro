// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useResultStore } from '../../stores/resultStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useToast } from '../../components/layout/Toast';
import { useConnectionStore } from '../../stores/connectionStore';
import { useResultEditing } from './useResultEditing';
import { useResultExport } from './useResultExport';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import type { ResultPanelProps } from './resultPanel/types';
import { useResultPanelCommands } from './resultPanel/useResultPanelCommands';
import { useResultPanelFilterSync } from './resultPanel/useResultPanelFilterSync';
import { useGuardedResultReload, useResultReload } from './resultPanel/useResultReload';
import { useResultUnsavedGate } from './resultPanel/useResultUnsavedGate';
import { UnsavedChangesBanner } from './UnsavedChangesBanner';
import { useSecurityStore } from '../../stores/securityStore';
import { useProjectStore } from '../../stores/projectStore';

import { useWritePreview } from './resultPanel/useWritePreview';
import { ResultPanelContent } from './resultPanel/ResultPanelContent';
import {
    useResultPanelDeleteRelationships,
    type ReferencingViewContext,
} from './resultPanel/useResultPanelDeleteRelationships';
import { useResultPanelSaveFlow } from './resultPanel/useResultPanelSaveFlow';
import { useResultPanelRowDetailSync } from './resultPanel/useResultPanelRowDetailSync';
import { useResultPanelEnvironment } from './resultPanel/useResultPanelEnvironment';
import { useResultPanelToolbarState } from './resultPanel/useResultPanelToolbarState';
import { useResultPanelInteractions } from './resultPanel/useResultPanelInteractions';
import { useResultPanelViewState } from './resultPanel/useResultPanelViewState';
import { useResultPanelContentProps } from './resultPanel/useResultPanelContentProps';

export type { ResultPanelAction } from './resultPanel/types';

export const ResultPanel: React.FC<ResultPanelProps> = ({
    tabId,
    contextTabId,
    result,
    onRun,
    onFilterRun,
    onActionsChange,
    baseQuery,
    onAppendToQuery,
    onOpenInNewTab,
    isReadOnlyTab = false,
    generatedKind,
    isMaximized = false,
    onToggleMaximize,
    showMaximizeControl = true,
    showResultFilterBar = true,
    preferBaseQueryForFilter = false,
    transactionSummary,
    filterColumns,
    filterTableName,
    dataSchema,
    dataConnectionKey,
    pinnedConnection,
}) => {
    const { viewMode } = useSettingsStore();
    const ambientDriver = useConnectionStore(state => state.activeProfile?.driver);
    const driver = pinnedConnection?.driver ?? ambientDriver;
    const ambientEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    // A Pinned Environment (ADR-0001) always wins over the ambient Active
    // Environment for a Table/Catalog tab's own write-safety, toolbar label,
    // and schema-context lookups.
    const activeEnvironmentKey = pinnedConnection?.environmentKey ?? ambientEnvironmentKey;
    const activeProject = useProjectStore(state => state.activeProject);
    const addTab = useEditorStore(s => s.addTab);
    const updateTabContext = useEditorStore(s => s.updateTabContext);
    const persistedContext = useEditorStore(state => {
        const targetId = contextTabId || tabId;
        for (const group of state.groups) {
            const match = group.tabs.find(tab => tab.id === targetId);
            if (match) return match.context;
        }
        return undefined;
    });
    const { toast } = useToast();
    const featureGate = useFeatureGate();
    const screenshotBlurEnabled = useSecurityStore(state => state.screenshotBlurEnabled);
    const setScreenshotBlurEnabled = useSecurityStore(state => state.setScreenshotBlurEnabled);
    const { showRightSidebar, setShowRightSidebar } = useLayoutStore();
    const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({});
    const [showColumnsPopover, setShowColumnsPopover] = React.useState(false);
    const [visibleRows, setVisibleRows] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const keepFilterFocusRef = React.useRef(false);
    const quickFilterRef = React.useRef<HTMLInputElement>(null);
    const jumpRowRef = React.useRef<HTMLInputElement>(null);

    const { guardSql, writeSafetyModals, resultErrorMessage } = useResultPanelEnvironment({
        activeEnvironmentKey,
        activeProject,
        result,
        addTab,
        toast,
    });

    const editing = useResultEditing({ tabId, result });
    const {
        columnDefs,
        columnDefsByName,
        displayRows,
        displayRowsByKey,
        rowOrder,
        editedCells,
        setEditedCells,
        selectedCells,
        setSelectedCells,
        selectedRowKeysFromHeader,
        setSelectedRowKeysFromHeader,
        deletedRows,
        setDeletedRows,
        draftRows,
        setDraftRows,
        isSavingDraftRows,
        focusCellRequest,
        setFocusCellRequest,
        selectedRowKeys,
        selectedPersistedRowIndices,
        selectedDraftIds,
        qualifiedTableName,
        tableRef,
        isEditable,
        canManageDraftRows,
        hasLegacyChanges,
        hasPendingChanges,
        removeDraftRows,
        getPersistedRowValues,
        resetEditState,
        generatePendingScript,
        handleAddRow,
        handleDuplicateRows,
        handleDirectExecute,
    } = editing;

    // Toolbar, keyboard shortcut, and context menu must all delete rows
    // through the exact same action (handleContextDelete, below) rather than
    // three separate implementations that can drift out of sync. It isn't
    // available yet at this point in the render (useResultPanelInteractions
    // runs after useResultPanelToolbarState, since the toolbar computes
    // things like canUseScreenshotBlur that interactions depends on) — a ref
    // lets the toolbar's onClick always reach the latest handleContextDelete
    // without introducing a hook-ordering cycle. Safe because the ref is
    // only read from an event handler (after render), never during render.
    const handleContextDeleteRef = React.useRef<() => void>(() => {});
    const requestDeleteSelectedRows = React.useCallback(() => {
        handleContextDeleteRef.current();
    }, []);

    const setFilterExprStore = React.useCallback((id: string, value: string) => {
        useResultStore.getState().setFilterExpr(id, value);
    }, []);
    const setOrderByExprStore = React.useCallback((id: string, value: string) => {
        useResultStore.getState().setOrderByExpr(id, value);
    }, []);

    const {
        quickFilter,
        setQuickFilter,
        filterExpr,
        orderByExpr,
        setFilterExpr,
        setOrderByExpr,
        sourceQuery,
    } = useResultPanelFilterSync({
        tabId,
        contextTabId,
        result,
        baseQuery,
        preferBaseQueryForFilter,
        persistedContext,
        updateTabContext,
        setFilterExprStore,
        setOrderByExprStore,
    });

    // Unguarded reload: what the save flow and the unsaved-changes banner run
    // once it's safe. Everything user-facing goes through handleReloadResult.
    const reloadNow = useResultReload({
        filterExpr,
        orderByExpr,
        sourceQuery,
        onFilterRun,
        onRun,
    });

    // Filled in below, once the blurred columns and the tab opener exist; only
    // read when a save is confirmed.
    const referencingViewContextRef = React.useRef<ReferencingViewContext | null>(null);
    const { resolveDeleteNotice } = useResultPanelDeleteRelationships({
        deletedRowCount: deletedRows.size,
        tableRef,
        fallbackTableName: result?.tableName,
        viewMode,
        pinnedConnection,
        viewContextRef: referencingViewContextRef,
    });

    const { handleDirectExecuteRequest, handleSaveRequest, saveWithoutReload } =
        useResultPanelSaveFlow({
            tabId,
            result,
            viewMode,
            hasPendingChanges,
            generatePendingScript,
            guardSql,
            resolveDeleteNotice,
            onReloadResult: reloadNow,
            handleDirectExecute,
            pinnedConnection,
            toast,
        });

    const { requestLeave, bannerProps: leaveBannerProps } = useResultUnsavedGate({
        tabId,
        hasPendingChanges,
        save: saveWithoutReload,
        discard: resetEditState,
    });

    const handleReloadResult = useGuardedResultReload({
        reload: reloadNow,
        isReadOnlyTab,
        requestLeave,
    });

    const openContextQueryTab = React.useCallback(
        (query: string, title?: string) => {
            addTab({
                name: title || `Row ${result?.tableName || 'query'}`,
                query,
            });
        },
        [addTab, result?.tableName],
    );

    const {
        isWritePreviewTab,
        writePreviewActionLoading,
        handleCancelWritePreview,
        handleConfirmWritePreview,
    } = useWritePreview({
        tabId,
        persistedContext,
        updateTabContext,
        toast,
    });

    const { runExport, exportJob, cancelExport, setKnownTotal } = useResultExport({
        tabId,
        result,
    });
    const {
        canUseResultSearch,
        canUseResultJump,
        canUseScreenshotBlur,
        blurredColumnIndexes,
        setColumnBlurOverride,
        panelActions,
        renderPanelAction,
        showExportModal,
        setShowExportModal,
        exportScope,
        setExportScope,
        exportFormat,
        setExportFormat,
        exportTableName,
        setExportTableName,
        allExportColumns,
        orderedSelectedExportColumns,
        areAllExportColumnsSelected,
        previewExportRows,
        blurredExportColumns,
        hasBlurredExportColumns,
        includeBlurredColumns,
        setIncludeBlurredColumns,
        toggleExportColumn,
        toggleAllExportColumns,
        handleConfirmExport,
        handleOpenExportModal,
    } = useResultPanelToolbarState({
        tabId,
        result,
        activeEnvironmentKey,
        onActionsChange,
        canManageDraftRows,
        isSavingDraftRows,
        hasPendingChanges,
        viewMode,
        selectedPersistedRowIndices,
        selectedDraftIds,
        showMaximizeControl,
        isMaximized,
        onToggleMaximize,
        handleAddRow,
        handleDuplicateRows,
        requestDeleteSelectedRows,
        resetEditState,
        setSelectedCells,
        handleSaveRequest,
        screenshotBlurEnabled,
        setScreenshotBlurEnabled,
        columnVisibility,
        setColumnVisibility,
        showColumnsPopover,
        setShowColumnsPopover,
        runExport,
        exportJob,
        cancelExport,
        toast,
        featureGate,
        onRun: handleReloadResult,
    });

    referencingViewContextRef.current = {
        result,
        deletedRows,
        driver,
        columnDefsByName,
        blurredColumnIndexes,
        openQueryTab: openContextQueryTab,
    };

    // After the toolbar state: the sidebar must know which columns the grid blurs.
    useResultPanelRowDetailSync({
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
    });

    useResultPanelCommands({
        tabId,
        result,
        viewMode,
        hasPendingChanges,
        hasLegacyChanges,
        isSavingDraftRows,
        generatePendingScript,
        handleDirectExecute: handleDirectExecuteRequest,
        onSaveRequest: handleSaveRequest,
        onRun: handleReloadResult,
        keepFilterFocusRef,
        containerRef,
        resetEditState,
        hasColumns: Boolean(result?.columns?.length),
        openExportModal: handleOpenExportModal,
    });

    const {
        contextMenu,
        contextMenuRef,
        contextMenuPosition,
        canCopy,
        canPaste,
        canSetNull,
        canDiscardChanges,
        canDeleteRows,
        canDuplicateRows,
        copyDisabledTitle,
        pasteDisabledTitle,
        setNullDisabledTitle,
        discardChangesDisabledTitle,
        duplicateDisabledTitle,
        deleteDisabledTitle,
        pasteActions,
        copyAsActions,
        handleContextCopy,
        handleContextSetNull,
        handleContextPaste,
        handleContextDiscardChanges,
        handleContextDelete,
        handleContextDuplicate,
        whereActions,
        columnBlurAction,
        columnVisibilityActions,
        canOpenRowInNewQueryTab,
        canUndoLastContextAction,
        undoDisabledTitle,
        openRowQueryDisabledTitle,
        handleOpenRowInNewQueryTab,
        handleUndoLastContextAction,
        handleCellContextMenuWithTarget,
        handleRowHeaderContextMenuWithTarget,
        handleKeyDown,
    } = useResultPanelInteractions({
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
        onRun: handleReloadResult,
        onSaveRequest: handleSaveRequest,
        onSetShowRightSidebar: setShowRightSidebar,
    });
    handleContextDeleteRef.current = handleContextDelete;

    const {
        writePreviewBanner,
        resultFilterBar,
        explainJsonValue,
        viewportStrategy,
        strategyTooltip,
        executionTimeText,
        executionTimeTooltip,
        pendingChangeCounts,
        totalCount,
        visibleRowCount,
    } = useResultPanelViewState({
        result,
        generatedKind,
        showResultFilterBar,
        isWritePreviewTab,
        filterColumns,
        filterTableName,
        filterExpr,
        setFilterExpr,
        orderByExpr,
        setOrderByExpr,
        sourceQuery,
        onFilterRun,
        requestLeave,
        onAppendToQuery,
        onOpenInNewTab,
        onActionsChange,
        panelActions,
        renderPanelAction,
        keepFilterFocusRef,
        writePreviewActionLoading,
        onCancelWritePreview: handleCancelWritePreview,
        onConfirmWritePreview: handleConfirmWritePreview,
        editedCells,
        deletedRows,
        draftRows,
        quickFilter,
        visibleRows,
    });

    // Feeds "export all rows" a total it can report real percentage
    // progress against, once the result panel's own background COUNT(*)
    // (query:count) lands — see useResultExport's setKnownTotal.
    React.useEffect(() => {
        setKnownTotal(totalCount);
    }, [totalCount, setKnownTotal]);

    const contentProps = useResultPanelContentProps({
        result,
        tabId,
        generatedKind,
        quickFilter,
        previewSessionId: persistedContext?.writePreviewSessionId,
        viewMode,
        isReadOnlyTab,
        transactionSummary,
        writePreviewBanner,
        leaveBanner: <UnsavedChangesBanner {...leaveBannerProps} />,
        resultFilterBar,
        resultErrorMessage,
        containerRef,
        onKeyDown: handleKeyDown,
        onCellContextMenu: handleCellContextMenuWithTarget,
        onRowHeaderContextMenu: handleRowHeaderContextMenuWithTarget,
        onViewStatsChange: ({ visibleRows: nextVisible }) => setVisibleRows(nextVisible),
        explainJsonValue,
        viewportStrategy,
        strategyTooltip,
        executionTimeText,
        executionTimeTooltip,
        pendingChangeCounts,
        totalCount,
        editedCells,
        setEditedCells,
        selectedCells,
        setSelectedCells,
        selectedRowKeysFromHeader,
        setSelectedRowKeysFromHeader,
        deletedRows,
        setDeletedRows,
        draftRows,
        setDraftRows,
        columnDefs,
        focusCellRequest,
        setFocusCellRequest,
        removeDraftRows,
        columnVisibility,
        setColumnVisibility,
        blurredColumnIndexes,
        contextMenu,
        contextMenuRef,
        contextMenuPosition,
        canCopy,
        canPaste,
        canSetNull,
        canDiscardChanges,
        canDeleteRows,
        canDuplicateRows,
        copyDisabledTitle,
        pasteDisabledTitle,
        setNullDisabledTitle,
        discardChangesDisabledTitle,
        duplicateDisabledTitle,
        deleteDisabledTitle,
        pasteActions,
        copyAsActions,
        whereActions,
        columnBlurAction,
        columnVisibilityActions,
        canOpenRowInNewQueryTab,
        canUndoLastContextAction,
        undoDisabledTitle,
        openRowQueryDisabledTitle,
        onCopy: handleContextCopy,
        onSetNull: handleContextSetNull,
        onPaste: handleContextPaste,
        onDiscardChanges: handleContextDiscardChanges,
        onDeleteRow: handleContextDelete,
        onDuplicateRow: handleContextDuplicate,
        onOpenRowInNewQueryTab: handleOpenRowInNewQueryTab,
        onUndoLastContextAction: handleUndoLastContextAction,
        visibleRowCount,
        hasPendingChanges,
        showExportModal,
        setShowExportModal,
        exportScope,
        setExportScope,
        exportFormat,
        setExportFormat,
        exportTableName,
        setExportTableName,
        allExportColumns,
        orderedSelectedExportColumns,
        toggleExportColumn,
        toggleAllExportColumns,
        areAllExportColumnsSelected,
        previewExportRows,
        blurredExportColumns,
        hasBlurredExportColumns,
        includeBlurredColumns,
        setIncludeBlurredColumns,
        handleConfirmExport,
        writeSafetyModals,
        dataSchema,
        dataConnectionKey,
        pinnedConnection,
    });

    return <ResultPanelContent {...contentProps} />;
};
