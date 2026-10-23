// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { isJsonValue } from '../../../components/viewers/JsonViewer';
import { resolveResultFetchStrategy } from '../../../lib/resultStrategy';
import { ResultPanelToolbar } from './ResultPanelToolbar';
import { WritePreviewBanner } from './WritePreviewBanner';
import type { ResultPanelViewStateDeps } from './types';

export function useResultPanelViewState({
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
    onCancelWritePreview,
    onConfirmWritePreview,
    editedCells,
    deletedRows,
    draftRows,
    quickFilter,
    visibleRows,
}: ResultPanelViewStateDeps) {
    const shouldShowFilterInput = generatedKind !== 'explain' && !isWritePreviewTab;
    const resultFilterBar =
        showResultFilterBar && !isWritePreviewTab ? (
            <ResultPanelToolbar
                result={result}
                filterColumns={filterColumns}
                filterTableName={filterTableName}
                filterExpr={filterExpr}
                setFilterExpr={setFilterExpr}
                orderByExpr={orderByExpr}
                setOrderByExpr={setOrderByExpr}
                sourceQuery={sourceQuery}
                showFilterInput={shouldShowFilterInput}
                onFilterRun={onFilterRun}
                requestLeave={requestLeave}
                onAppendToQuery={onAppendToQuery}
                onOpenInNewTab={onOpenInNewTab}
                renderActionsInline={!onActionsChange}
                panelActions={panelActions}
                renderPanelAction={renderPanelAction}
                keepFilterFocusRef={keepFilterFocusRef}
            />
        ) : null;

    const writePreviewBanner = isWritePreviewTab ? (
        <WritePreviewBanner
            writePreviewActionLoading={writePreviewActionLoading}
            onCancel={onCancelWritePreview}
            onConfirm={onConfirmWritePreview}
        />
    ) : null;

    const canCompute = result && result.isSelect && !result.error;
    const explainJsonValue =
        canCompute &&
        generatedKind === 'explain' &&
        result.rows.length === 1 &&
        result.rows[0]?.length === 1 &&
        isJsonValue(result.rows[0][0])
            ? result.rows[0][0]
            : null;

    const totalCount = canCompute && result.hasMore ? result.totalCount : undefined;
    const viewportState = canCompute
        ? resolveResultFetchStrategy(result.rows.length, result.hasMore, result.isDone)
        : null;
    const strategyTooltip = (() => {
        if (!viewportState) return '';
        switch (viewportState.strategy) {
            case 'server_aware':
                return 'Server-aware: result may still stream or has more rows on server.';
            case 'incremental_client':
                return 'Incremental client: large completed dataset, client handles viewport incrementally.';
            case 'client_full':
            default:
                return 'Client full: result fits comfortably, client can handle all rows directly.';
        }
    })();

    const executionTimestamp = canCompute
        ? (result.lastFetchedAt ?? result.progress?.startedAt)
        : undefined;
    const executionTimeText = (() => {
        if (!executionTimestamp) return null;
        return new Date(executionTimestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    })();
    const executionTimeTooltip = (() => {
        if (!executionTimestamp) return '';
        const label = result?.lastFetchedAt ? 'Last fetched at' : 'Execution started at';
        return `${label} ${new Date(executionTimestamp).toLocaleString()}`;
    })();

    const pendingChangeCounts = (() => {
        const updatedRowIndices = new Set<number>();
        editedCells.forEach((_, cellId) => {
            const [rowIndexRaw] = cellId.split(':');
            const rowIndex = Number(rowIndexRaw);
            if (!Number.isFinite(rowIndex) || deletedRows.has(rowIndex)) return;
            updatedRowIndices.add(rowIndex);
        });
        return {
            add: draftRows.length,
            update: updatedRowIndices.size,
            del: deletedRows.size,
        };
    })();

    const visibleRowCount = quickFilter.trim()
        ? visibleRows
        : result
          ? result.rows.length + draftRows.length
          : 0;

    return {
        writePreviewBanner,
        resultFilterBar,
        explainJsonValue,
        viewportStrategy: viewportState?.strategy ?? 'server_aware',
        strategyTooltip,
        executionTimeText,
        executionTimeTooltip,
        pendingChangeCounts,
        totalCount,
        visibleRowCount,
    } as const;
}
