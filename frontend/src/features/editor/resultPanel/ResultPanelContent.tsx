// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlertCircle, Loader } from 'lucide-react';
import { models } from '../../../../wailsjs/go/models';
import { JsonViewer } from '../../../components/viewers/JsonViewer';
import { ResultTable } from '../ResultTable';
import { ResultRowFetchControls } from './ResultRowFetchControls';
import { ResultContextMenu } from './ResultContextMenu';
import { ResultPanelModals } from './ResultPanelModals';
import { ResultPanelStatusBar } from './ResultPanelStatusBar';
import { DmlResultPanel } from './DmlResultPanel';
import { pluginRegistry } from '../../../lib/plugin/pluginRegistry';
import { PluginErrorBoundary } from '../../../lib/plugin/PluginErrorBoundary';
import type { DraftRow } from '../../../lib/dataEditing';
import type { TabResult } from '../../../stores/resultStore';
import type { FocusCellRequest } from '../resultTable/types';
import type {
    ResultContextMenuPayload,
    ResultContextPasteAction,
    ResultContextCopyAsAction,
    ResultContextWhereAction,
    ResultContextColumnBlurAction,
    ResultContextColumnVisibilityAction,
    TransactionSummary,
} from './types';

interface ResultPanelContentProps {
    // Core data
    result: TabResult | undefined;
    tabId: string;
    generatedKind?: 'result' | 'explain';
    quickFilter: string;
    previewSessionId?: string;
    viewMode: boolean;
    isReadOnlyTab: boolean;
    transactionSummary?: TransactionSummary;

    // Pre-rendered blocks
    writePreviewBanner: React.ReactNode;
    /** "Save your changes?" prompt shown when a reload/run/filter would drop unsaved edits. */
    leaveBanner?: React.ReactNode;
    resultFilterBar: React.ReactNode;
    resultErrorMessage: string;

    // Container config
    containerRef: React.RefObject<HTMLDivElement>;
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onCellContextMenu: (payload: ResultContextMenuPayload) => void;
    onRowHeaderContextMenu: (payload: ResultContextMenuPayload) => void;
    onViewStatsChange: (stats: { visibleRows: number }) => void;

    // Computed values
    explainJsonValue: string | null;
    viewportStrategy: string;
    strategyTooltip: string;
    executionTimeText: string | null;
    executionTimeTooltip: string;
    pendingChangeCounts: { add: number; update: number; del: number };
    totalCount: number | undefined;

    // Editing state
    editedCells: Map<string, string>;
    setEditedCells: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    selectedCells: Set<string>;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedRowKeysFromHeader: Set<string>;
    setSelectedRowKeysFromHeader: React.Dispatch<React.SetStateAction<Set<string>>>;
    deletedRows: Set<number>;
    setDeletedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
    draftRows: DraftRow[];
    setDraftRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
    columnDefs: models.ColumnDef[];
    focusCellRequest: FocusCellRequest | null;
    setFocusCellRequest: React.Dispatch<React.SetStateAction<FocusCellRequest | null>>;
    removeDraftRows: (draftIds: string[]) => void;

    // Column visibility / blur
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    blurredColumnIndexes?: Set<number>;

    // Context menu state
    contextMenu: ResultContextMenuPayload | null;
    contextMenuRef: React.RefObject<HTMLDivElement>;
    contextMenuPosition: { left: number; top: number; submenuOpensLeft?: boolean } | null;
    canCopy: boolean;
    canPaste: boolean;
    canSetNull: boolean;
    canDiscardChanges: boolean;
    canDeleteRows: boolean;
    canDuplicateRows: boolean;
    copyDisabledTitle: string;
    pasteDisabledTitle: string;
    setNullDisabledTitle: string;
    discardChangesDisabledTitle: string;
    duplicateDisabledTitle: string;
    deleteDisabledTitle: string;
    pasteActions: ResultContextPasteAction[];
    copyAsActions: ResultContextCopyAsAction[];
    whereActions: ResultContextWhereAction[];
    columnBlurAction: ResultContextColumnBlurAction | null;
    columnVisibilityActions: ResultContextColumnVisibilityAction[];
    canOpenRowInNewQueryTab: boolean;
    canUndoLastContextAction: boolean;
    undoDisabledTitle: string;
    openRowQueryDisabledTitle: string;
    onCopy: () => void;
    onSetNull: () => void;
    onPaste: () => void;
    onDiscardChanges: () => void;
    onDeleteRow: () => void;
    onDuplicateRow: () => void;
    onOpenRowInNewQueryTab: () => void;
    onUndoLastContextAction: () => void;

    // Status bar data
    visibleRowCount: number;
    hasPendingChanges: boolean;

    // Modal data
    showExportModal: boolean;
    setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>;
    exportScope: 'all' | 'view';
    setExportScope: React.Dispatch<React.SetStateAction<'all' | 'view'>>;
    exportFormat: 'csv' | 'json' | 'sql';
    setExportFormat: React.Dispatch<React.SetStateAction<'csv' | 'json' | 'sql'>>;
    exportTableName: string;
    setExportTableName: React.Dispatch<React.SetStateAction<string>>;
    allExportColumns: string[];
    orderedSelectedExportColumns: string[];
    toggleExportColumn: (column: string) => void;
    toggleAllExportColumns: () => void;
    areAllExportColumnsSelected: boolean;
    previewExportRows: string[][];
    blurredExportColumns: ReadonlySet<string>;
    hasBlurredExportColumns: boolean;
    includeBlurredColumns: boolean;
    setIncludeBlurredColumns: (include: boolean) => void;
    handleConfirmExport: () => void;
    writeSafetyModals?: React.ReactNode;

    // Data-tab-only identity for the "Mark as Image Column" feature
    dataSchema?: string;
    dataConnectionKey?: string;
    pinnedConnection?: import('./types').PinnedResultConnection;
}

function renderResultPanelExtension(
    resultType: string,
    props: Record<string, unknown>,
): React.ReactElement | null {
    const extension = pluginRegistry.getResultPanel(resultType);
    if (!extension) return null;

    return (
        <PluginErrorBoundary pluginId={extension.pluginId}>
            <extension.component {...props} />
        </PluginErrorBoundary>
    );
}

export const ResultPanelContent: React.FC<ResultPanelContentProps> = ({
    result,
    tabId,
    generatedKind,
    quickFilter,
    previewSessionId,
    viewMode,
    isReadOnlyTab,
    transactionSummary,

    writePreviewBanner,
    leaveBanner,
    resultFilterBar,
    resultErrorMessage,

    containerRef,
    onKeyDown,
    onCellContextMenu,
    onRowHeaderContextMenu,
    onViewStatsChange,

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
    onCopy,
    onSetNull,
    onPaste,
    onDiscardChanges,
    onDeleteRow,
    onDuplicateRow,
    onOpenRowInNewQueryTab,
    onUndoLastContextAction,

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
}) => {
    const extensionProps = {
        result,
        tabId,
        generatedKind,
        quickFilter,
        previewSessionId,
        viewMode,
        isReadOnlyTab,
        transactionSummary,
    } satisfies Record<string, unknown>;

    // ── Early returns for non-tabular results (no WHERE filter bar makes
    // sense here — nothing to filter) ───────────────────────────────────────
    if (transactionSummary) {
        const extension = renderResultPanelExtension('transaction-summary', extensionProps);
        if (extension) return extension;
        return (
            <DmlResultPanel result={result} tabId={tabId} transactionSummary={transactionSummary} />
        );
    }

    if (result && !result.error && !result.isSelect) {
        const extension = renderResultPanelExtension('dml', extensionProps);
        if (extension) return extension;
        return <DmlResultPanel result={result} tabId={tabId} />;
    }

    // ── Table body: the WHERE filter bar always renders below; only this
    // part switches between empty / error / loading / table states. ────────
    const tableBody = (() => {
        if (!result) {
            const extension = renderResultPanelExtension('empty', extensionProps);
            if (extension) return extension;
            return (
                <div className='flex items-center justify-center h-full text-small text-muted-foreground'>
                    <span>Run a query (Ctrl+Enter) to see results</span>
                </div>
            );
        }

        if (result.error) {
            const extension = renderResultPanelExtension('error', extensionProps);
            if (extension) return extension;
            return (
                <div className='flex items-center justify-center flex-1 text-destructive gap-2'>
                    <AlertCircle size={16} />
                    <span>{resultErrorMessage}</span>
                </div>
            );
        }

        const hasData = result.columns.length > 0;
        const isLoading = !result.isDone;

        if (isLoading && !hasData) {
            return (
                <div className='flex flex-row items-center gap-2 px-3 py-2 text-small border-b border-border shrink-0 text-success'>
                    <Loader size={14} className='animate-spin' />
                    <span className='text-muted-foreground'>
                        {result.rows.length > 0
                            ? `Streaming… ${result.rows.length.toLocaleString()} rows`
                            : 'Executing query…'}
                    </span>
                </div>
            );
        }

        return (
            <>
                <div
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        opacity: isLoading ? 0.5 : 1,
                    }}
                >
                    {explainJsonValue
                        ? (renderResultPanelExtension('explain', {
                              ...extensionProps,
                              explainJsonValue,
                          }) ?? (
                              <div className='flex-1 overflow-hidden p-3'>
                                  <JsonViewer
                                      value={explainJsonValue}
                                      height='100%'
                                      useMonaco={true}
                                  />
                              </div>
                          ))
                        : (renderResultPanelExtension('table', extensionProps) ?? (
                              <ResultTable
                                  tabId={tabId}
                                  previewSessionId={previewSessionId}
                                  columns={result.columns}
                                  rows={result.rows}
                                  isDone={result.isDone}
                                  quickFilter={quickFilter}
                                  onViewStatsChange={({ visibleRows: nextVisible }) =>
                                      onViewStatsChange({ visibleRows: nextVisible })
                                  }
                                  editedCells={editedCells}
                                  setEditedCells={setEditedCells}
                                  selectedCells={selectedCells}
                                  setSelectedCells={setSelectedCells}
                                  selectedRowKeys={selectedRowKeysFromHeader}
                                  setSelectedRowKeys={setSelectedRowKeysFromHeader}
                                  deletedRows={deletedRows}
                                  setDeletedRows={setDeletedRows}
                                  draftRows={draftRows}
                                  setDraftRows={setDraftRows}
                                  columnDefs={columnDefs}
                                  focusCellRequest={focusCellRequest}
                                  onFocusCellRequestHandled={() => setFocusCellRequest(null)}
                                  onRemoveDraftRows={removeDraftRows}
                                  readOnlyMode={viewMode || isReadOnlyTab}
                                  onCellContextMenu={onCellContextMenu}
                                  onRowHeaderContextMenu={onRowHeaderContextMenu}
                                  columnVisibility={columnVisibility}
                                  onColumnVisibilityChange={setColumnVisibility}
                                  blurredColumnIndexes={blurredColumnIndexes}
                                  dataSchema={dataSchema}
                                  dataConnectionKey={dataConnectionKey}
                                  // Pass through directly (ResultTable only
                                  // reads profileName/dbName off it, and a
                                  // wider object satisfies that structurally)
                                  // — rebuilding a subset object literal here
                                  // on every render broke reference equality
                                  // downstream. See TableInfo.tsx's own
                                  // pinnedConnection prop for the full story.
                                  pinnedConnection={pinnedConnection}
                              />
                          ))}
                </div>
            </>
        );
    })();

    return (
        <div
            className='flex flex-col items-stretch justify-start h-full text-small text-muted-foreground overflow-hidden gap-1 bg-card'
            ref={containerRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{ outline: 'none' }}
        >
            <div className='flex flex-col flex-1 overflow-hidden min-h-0 relative bg-card border border-(--border-panel)/50 rounded-md'>
                {writePreviewBanner}
                {leaveBanner}
                {resultFilterBar}
                {tableBody}
            </div>

            {result && !result.error && (
                <>
                    <ResultContextMenu
                        contextMenu={contextMenu}
                        contextMenuRef={contextMenuRef}
                        contextMenuPosition={contextMenuPosition}
                        canCopy={canCopy}
                        canPaste={canPaste}
                        canSetNull={canSetNull}
                        canDiscardChanges={canDiscardChanges}
                        canDeleteRows={canDeleteRows}
                        canDuplicateRows={canDuplicateRows}
                        copyDisabledTitle={copyDisabledTitle}
                        pasteDisabledTitle={pasteDisabledTitle}
                        setNullDisabledTitle={setNullDisabledTitle}
                        discardChangesDisabledTitle={discardChangesDisabledTitle}
                        duplicateDisabledTitle={duplicateDisabledTitle}
                        deleteDisabledTitle={deleteDisabledTitle}
                        pasteActions={pasteActions}
                        copyAsActions={copyAsActions}
                        whereActions={whereActions}
                        columnBlurAction={columnBlurAction}
                        columnVisibilityActions={columnVisibilityActions}
                        canOpenRowInNewQueryTab={canOpenRowInNewQueryTab}
                        canUndoLastContextAction={canUndoLastContextAction}
                        undoDisabledTitle={undoDisabledTitle}
                        openRowQueryDisabledTitle={openRowQueryDisabledTitle}
                        onCopy={onCopy}
                        onSetNull={onSetNull}
                        onPaste={onPaste}
                        onDiscardChanges={onDiscardChanges}
                        onDeleteRow={onDeleteRow}
                        onDuplicateRow={onDuplicateRow}
                        onOpenRowInNewQueryTab={onOpenRowInNewQueryTab}
                        onUndoLastContextAction={onUndoLastContextAction}
                    />

                    <ResultPanelStatusBar
                        visibleRowCount={visibleRowCount}
                        totalCount={totalCount}
                        hasMore={result.hasMore}
                        duration={result.duration}
                        strategyLabel={viewportStrategy}
                        strategyTooltip={strategyTooltip}
                        executionTimeText={executionTimeText}
                        executionTimeTooltip={executionTimeTooltip}
                        fetchControls={
                            result.isSelect ? (
                                <ResultRowFetchControls
                                    tabId={tabId}
                                    previewSessionId={previewSessionId}
                                    pinnedConnection={pinnedConnection}
                                    hasMore={Boolean(result.hasMore)}
                                    totalCount={totalCount}
                                />
                            ) : null
                        }
                        hasPendingChanges={hasPendingChanges}
                        pendingChangeCounts={pendingChangeCounts}
                    />

                    <ResultPanelModals
                        showExportModal={showExportModal}
                        setShowExportModal={setShowExportModal}
                        resultTableName={result.tableName}
                        exportScope={exportScope}
                        setExportScope={setExportScope}
                        exportFormat={exportFormat}
                        setExportFormat={setExportFormat}
                        exportTableName={exportTableName}
                        setExportTableName={setExportTableName}
                        allExportColumns={allExportColumns}
                        orderedSelectedExportColumns={orderedSelectedExportColumns}
                        toggleExportColumn={toggleExportColumn}
                        toggleAllExportColumns={toggleAllExportColumns}
                        areAllExportColumnsSelected={areAllExportColumnsSelected}
                        previewExportRows={previewExportRows}
                        blurredExportColumns={blurredExportColumns}
                        hasBlurredExportColumns={hasBlurredExportColumns}
                        includeBlurredColumns={includeBlurredColumns}
                        setIncludeBlurredColumns={setIncludeBlurredColumns}
                        handleConfirmExport={handleConfirmExport}
                        writeSafetyModals={writeSafetyModals}
                    />
                </>
            )}
        </div>
    );
};
