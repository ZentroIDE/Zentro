// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastProvider } from '../../../components/layout/Toast';
import { ResultPanelContent } from './ResultPanelContent';
import { pluginRegistry } from '../../../lib/plugin/pluginRegistry';
import type { TabResult } from '../../../stores/resultStore';

const cleanupCallbacks: Array<() => void> = [];

afterEach(() => {
    while (cleanupCallbacks.length > 0) {
        cleanupCallbacks.pop()?.();
    }
});

function createResult(overrides: Partial<TabResult> = {}): TabResult {
    return {
        columns: ['id'],
        rows: [['1']],
        isDone: true,
        affected: 1,
        duration: 8,
        isSelect: true,
        hasMore: false,
        offset: 0,
        isFetchingMore: false,
        filterExpr: '',
        orderByExpr: '',
        executionState: 'done',
        failureCode: 'none',
        progress: {
            startedAt: Date.now(),
            rowsReceived: 1,
            chunksReceived: 1,
        },
        windowStartOffset: 0,
        ...overrides,
    };
}

function createProps(overrides: Partial<React.ComponentProps<typeof ResultPanelContent>> = {}) {
    return {
        result: createResult(),
        tabId: 'result-tab',
        generatedKind: 'result' as const,
        quickFilter: '',
        previewSessionId: undefined,
        viewMode: false,
        isReadOnlyTab: false,
        transactionSummary: undefined,
        writePreviewBanner: null,
        resultFilterBar: null,
        resultErrorMessage: '',
        containerRef: React.createRef<HTMLDivElement>(),
        onKeyDown: () => undefined,
        onCellContextMenu: () => undefined,
        onRowHeaderContextMenu: () => undefined,
        onViewStatsChange: () => undefined,
        explainJsonValue: null,
        viewportStrategy: 'windowed',
        strategyTooltip: '',
        executionTimeText: null,
        executionTimeTooltip: '',
        pendingChangeCounts: { add: 0, update: 0, del: 0 },
        totalCount: 1,
        editedCells: new Map(),
        setEditedCells: () => undefined,
        selectedCells: new Set<string>(),
        setSelectedCells: () => undefined,
        selectedRowKeysFromHeader: new Set<string>(),
        setSelectedRowKeysFromHeader: () => undefined,
        deletedRows: new Set<number>(),
        setDeletedRows: () => undefined,
        draftRows: [],
        setDraftRows: () => undefined,
        columnDefs: [],
        focusCellRequest: null,
        setFocusCellRequest: () => undefined,
        removeDraftRows: () => undefined,
        columnVisibility: {},
        setColumnVisibility: () => undefined,
        blurredColumnIndexes: undefined,
        contextMenu: null,
        contextMenuRef: React.createRef<HTMLDivElement>(),
        contextMenuPosition: null,
        canCopy: false,
        canPaste: false,
        canSetNull: false,
        canDiscardChanges: false,
        canDeleteRows: false,
        canDuplicateRows: false,
        copyDisabledTitle: '',
        pasteDisabledTitle: '',
        setNullDisabledTitle: '',
        discardChangesDisabledTitle: '',
        duplicateDisabledTitle: '',
        deleteDisabledTitle: '',
        pasteActions: [],
        copyAsActions: [],
        whereActions: [],
        columnBlurAction: null,
        columnVisibilityActions: [],
        canOpenRowInNewQueryTab: false,
        canUndoLastContextAction: false,
        undoDisabledTitle: '',
        openRowQueryDisabledTitle: '',
        onCopy: () => undefined,
        onSetNull: () => undefined,
        onPaste: () => undefined,
        onDiscardChanges: () => undefined,
        onDeleteRow: () => undefined,
        onDuplicateRow: () => undefined,
        onOpenRowInNewQueryTab: () => undefined,
        onUndoLastContextAction: () => undefined,
        visibleRowCount: 1,
        exportJob: null,
        hasPendingChanges: false,
        showExportModal: false,
        setShowExportModal: () => undefined,
        exportScope: 'all' as const,
        setExportScope: () => undefined,
        exportFormat: 'csv' as const,
        setExportFormat: () => undefined,
        exportTableName: 'users',
        setExportTableName: () => undefined,
        allExportColumns: ['id'],
        orderedSelectedExportColumns: ['id'],
        toggleExportColumn: () => undefined,
        toggleAllExportColumns: () => undefined,
        areAllExportColumnsSelected: true,
        previewExportRows: [['1']],
        blurredExportColumns: new Set<string>(),
        hasBlurredExportColumns: false,
        includeBlurredColumns: false,
        setIncludeBlurredColumns: () => undefined,
        handleConfirmExport: () => undefined,
        writeSafetyModals: null,
        ...overrides,
    };
}

describe('ResultPanelContent plugin integration', () => {
    it('renders a registered table plugin extension before the default table view', () => {
        cleanupCallbacks.push(
            pluginRegistry.registerResultPanel({
                pluginId: 'plugin.test',
                resultType: 'table',
                component: () => <div>Plugin Table View</div>,
            }),
        );

        render(
            <ToastProvider>
                <ResultPanelContent {...createProps()} />
            </ToastProvider>,
        );

        expect(screen.getByText('Plugin Table View')).toBeInTheDocument();
    });
});
