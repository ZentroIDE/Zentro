// SPDX-License-Identifier: GPL-3.0-only

import type React from 'react';
import type { DraftRow, DisplayRow } from '../../../lib/dataEditing';
import type { TabResult } from '../../../stores/resultStore';
import type { FocusCellRequest } from '../../../features/editor/useResultEditing';
import type { UiAction } from '../../../types/uiAction';
import type { models } from '../../../../wailsjs/go/models';
import type { RequestResultLeave } from './resultUnsavedGate';
import type {
    WriteGuardNotice,
    WriteGuardOptions,
} from '../../../lib/writeSafety/useWriteSafetyGuard';

export interface TransactionSummaryStatement {
    tabResultKey: string;
    statementText: string;
    affected: number;
    duration: number;
    isSelect: boolean;
    error?: string;
    isDone: boolean;
}

export interface TransactionSummary {
    statements: TransactionSummaryStatement[];
    totalDuration: number;
    isComplete: boolean;
    hasError: boolean;
    /** Backend-computed row totals across every statement actually executed
     *  (not just the ones whose progress event survived IPC throttling).
     *  Prefer this over summing `statements[].affected` when present. */
    aggregateTotals?: { insertedRows: number; updatedRows: number; deletedRows: number };
}

export interface ResultPanelAction extends UiAction {
    variant?: 'ghost' | 'secondary' | 'destructive';
    tone?: 'default' | 'neutral' | 'success' | 'warning' | 'destructive';
    className?: string;
    badge?: React.ReactNode;
    popoverContent?: React.ReactNode;
    popoverOpen?: boolean;
    onPopoverOpenChange?: (open: boolean) => void;
}

export interface ResultPanelProps {
    tabId: string;
    contextTabId?: string;
    result?: TabResult;
    onRun?: () => void;
    onFilterRun?: (filter: string, orderByExpr?: string, filterBaseQuery?: string) => void;
    onActionsChange?: (actions: ResultPanelAction[]) => void;
    baseQuery?: string;
    onAppendToQuery?: (fullQuery: string) => void;
    onOpenInNewTab?: (fullQuery: string) => void;
    isReadOnlyTab?: boolean;
    generatedKind?: 'result' | 'explain';
    isMaximized?: boolean;
    onToggleMaximize?: () => void;
    showMaximizeControl?: boolean;
    showResultFilterBar?: boolean;
    /** Prefer provided baseQuery over runtime lastExecutedQuery when composing filter SQL */
    preferBaseQueryForFilter?: boolean;
    transactionSummary?: TransactionSummary;
    /**
     * Column names/table name to show in the filter bar before `result` exists
     * (e.g. TableInfo's Data tab already knows its columns from the schema
     * fetch). Ignored once `result` arrives — `result.columns`/`result.tableName`
     * take over as the source of truth.
     */
    filterColumns?: string[];
    filterTableName?: string;
    /** Data-tab-only identity for the "Mark as Image Column" feature —
     *  undefined for ad-hoc query tabs, which keeps the feature inert there. */
    dataSchema?: string;
    dataConnectionKey?: string;
    /** Table/Catalog tab's Pinned Environment (ADR-0001) — when set,
     *  write-safety gating and direct-execute (inline cell-edit saves)
     *  target this connection instead of the ambient Active Environment.
     *  Undefined for ad-hoc query tabs, which stay on the ambient path. */
    pinnedConnection?: PinnedResultConnection;
}

export interface PinnedResultConnection {
    connectionID: string;
    dbName: string;
    driver: string;
    environmentKey: string;
}

export interface ResultContextMenuPayload {
    x: number;
    y: number;
    rowKey: string;
    colIdx: number;
    cellId?: string;
    target: 'cell' | 'row-header';
}

export interface ResultContextCopyAsAction {
    id: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    title?: string;
}

export type ResultContextWhereAction = ResultContextCopyAsAction;
export type ResultContextColumnBlurAction = ResultContextCopyAsAction;
export type ResultContextColumnVisibilityAction = ResultContextCopyAsAction;
export type ResultContextPasteAction = ResultContextCopyAsAction;

export interface ResultContextMenuDeps {
    result: TabResult | undefined;
    driver: string | undefined;
    displayRows: DisplayRow[];
    displayRowsByKey: Map<string, DisplayRow>;
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    selectedCells: Set<string>;
    selectedRowKeys: string[];
    selectedRowKeysFromHeader: string[];
    selectedPersistedRowIndices: number[];
    selectedDraftIds: string[];
    draftRows: DraftRow[];
    deletedRows: Set<number>;
    columnDefsByName: Map<
        string,
        { Name: string; IsPrimaryKey: boolean; IsNullable: boolean; DataType?: string }
    >;
    isEditable: boolean;
    canManageDraftRows: boolean;
    isReadOnlyTab: boolean;
    viewMode: boolean;
    isSavingDraftRows: boolean;
    getPersistedRowValues: (rowIndex: number) => string[];
    removeDraftRows: (draftIds: string[]) => void;
    openQueryTab: (query: string, title?: string) => void;
    setEditedCells: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    setDraftRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    setDeletedRows: React.Dispatch<React.SetStateAction<Set<number>>>;
    setFocusCellRequest: React.Dispatch<React.SetStateAction<FocusCellRequest | null>>;
    blurredColumnIndexes?: Set<number>;
    canBlurColumns: boolean;
    setColumnBlurOverride: (colIdx: number, blurred: boolean) => void;
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export interface ResultPanelCommandDeps {
    tabId: string;
    result: TabResult | undefined;
    viewMode: boolean;
    hasPendingChanges: boolean;
    hasLegacyChanges: boolean;
    isSavingDraftRows: boolean;
    generatePendingScript: () => string;
    handleDirectExecute: () => Promise<void>;
    onSaveRequest: () => Promise<void>;
    onRun?: () => void;
}

export interface ResultPanelToolbarDeps {
    tabId: string;
    result: TabResult | undefined;
    onRun?: () => void;
    environmentKey?: string | null;
    onActionsChange?: (actions: ResultPanelAction[]) => void;
    canManageDraftRows: boolean;
    isSavingDraftRows: boolean;
    hasPendingChanges: boolean;
    viewMode: boolean;
    selectedPersistedRowIndices: number[];
    selectedDraftIds: string[];
    canUseResultExport: boolean;
    showMaximizeControl: boolean;
    isMaximized: boolean;
    onToggleMaximize?: () => void;
    exportRunningSignature?: string;
    handleAddRow: () => void;
    handleDuplicateRows: () => void;
    requestDeleteSelectedRows: () => void;
    resetEditState: () => void;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    handleSaveRequest: () => Promise<void>;
    handleOpenExportModal: () => void;
    cancelExport: () => void;
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    showColumnsPopover: boolean;
    setShowColumnsPopover: React.Dispatch<React.SetStateAction<boolean>>;
    canUseScreenshotBlur: boolean;
    showBlurToggle: boolean;
    screenshotBlurEnabled: boolean;
    setScreenshotBlurEnabled: (enabled: boolean) => void;
}

export interface ResultPanelSaveFlowDeps {
    tabId: string;
    result: TabResult | undefined;
    viewMode: boolean;
    hasPendingChanges: boolean;
    generatePendingScript: () => string;
    guardSql: (
        sql: string,
        action: string,
        options?: WriteGuardOptions,
    ) => Promise<{
        allowed: boolean;
        blockedReason?: string;
        sqlOverride?: string;
        auditMeta?: unknown;
    }>;
    /**
     * What to show in the write confirmation about rows in other tables that
     * reference the ones being deleted, or `null` when none do.
     */
    resolveDeleteNotice: () => Promise<WriteGuardNotice | null>;
    onReloadResult: () => void;
    handleDirectExecute: (runner: (script: string) => Promise<number>) => Promise<boolean>;
    pinnedConnection?: PinnedResultConnection;
    toast: {
        error: (message: string) => void;
    };
}

export interface ResultPanelRowDetailSyncDeps {
    result: TabResult | undefined;
    showRightSidebar: boolean;
    selectedRowKeys: string[];
    displayRowsByKey: Map<string, DisplayRow>;
    getPersistedRowValues: (rowIndex: number) => string[];
    columnDefsByName: Map<string, models.ColumnDef>;
    qualifiedTableName?: string;
    blurredColumnIndexes?: ReadonlySet<number>;
    setEditedCells: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    setDraftRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
}

export interface ResultPanelEnvironmentDeps {
    // Callers resolve Pinned Environment (ADR-0001) precedence over the
    // ambient Active Environment before passing this in — see ResultPanel.tsx.
    activeEnvironmentKey: string | null;
    activeProject: {
        environments?: Array<{
            key: string;
            last_schema?: string | null;
        }>;
    } | null;
    result: TabResult | undefined;
    addTab: (input: { name: string; query: string }) => void;
    toast: {
        success: (message: string) => void;
        error: (message: string) => void;
    };
}

export interface ResultPanelViewStateDeps {
    result: TabResult | undefined;
    generatedKind?: 'result' | 'explain';
    showResultFilterBar: boolean;
    isWritePreviewTab: boolean;
    filterColumns?: string[];
    filterTableName?: string;
    filterExpr: string;
    setFilterExpr: (value: string) => void;
    orderByExpr: string;
    setOrderByExpr: (value: string) => void;
    sourceQuery: string;
    onFilterRun?: (filter: string, orderByExpr?: string, filterBaseQuery?: string) => void;
    requestLeave: RequestResultLeave;
    onAppendToQuery?: (fullQuery: string) => void;
    onOpenInNewTab?: (fullQuery: string) => void;
    onActionsChange?: (actions: ResultPanelAction[]) => void;
    panelActions: ResultPanelAction[];
    renderPanelAction: (action: ResultPanelAction) => React.ReactNode;
    keepFilterFocusRef: React.MutableRefObject<boolean>;
    writePreviewActionLoading: 'confirm' | 'cancel' | null;
    onCancelWritePreview: () => void;
    onConfirmWritePreview: () => void;
    editedCells: Map<string, string>;
    deletedRows: Set<number>;
    draftRows: DraftRow[];
    quickFilter: string;
    visibleRows: number;
}
