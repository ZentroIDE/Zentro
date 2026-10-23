// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ResultFilterBar } from '../../../features/editor/ResultFilterBar';
import type { TabResult } from '../../../stores/resultStore';
import type { ResultPanelAction } from './types';
import type { RequestResultLeave } from './resultUnsavedGate';

// Stable reference so `columns={result?.columns ?? filterColumns ?? []}`
// below doesn't hand ResultFilterBar a brand-new empty array every render
// when there's no result/filterColumns yet (e.g. an empty query tab) — a
// fresh `[]` there cascades into completionColumns/registerCompletion
// disposing and re-registering the Monaco completion provider on every
// render, which resets any OTHER open suggest widget for the 'sql'
// language (Monaco refreshes all open widgets when the provider registry
// for a language changes).
const EMPTY_COLUMNS: string[] = [];

interface ResultPanelToolbarProps {
    result: TabResult | undefined;
    filterColumns?: string[];
    filterTableName?: string;
    filterExpr: string;
    setFilterExpr: (v: string) => void;
    orderByExpr: string;
    setOrderByExpr: (v: string) => void;
    sourceQuery: string;
    showFilterInput: boolean;
    onFilterRun?: (filter: string, orderByExpr?: string, filterBaseQuery?: string) => void;
    /** Unsaved-edits guard; without one the filter runs straight away. */
    requestLeave?: RequestResultLeave;
    onAppendToQuery?: (text: string) => void;
    onOpenInNewTab?: (text: string) => void;
    renderActionsInline: boolean;
    panelActions: readonly ResultPanelAction[];
    renderPanelAction: (action: ResultPanelAction) => React.ReactNode;
    keepFilterFocusRef: React.MutableRefObject<boolean>;
}

export const ResultPanelToolbar: React.FC<ResultPanelToolbarProps> = ({
    result,
    filterColumns,
    filterTableName,
    filterExpr,
    setFilterExpr,
    orderByExpr,
    setOrderByExpr,
    sourceQuery,
    showFilterInput,
    onFilterRun,
    requestLeave,
    onAppendToQuery,
    onOpenInNewTab,
    renderActionsInline,
    panelActions,
    renderPanelAction,
    keepFilterFocusRef,
}) => {
    const leave: RequestResultLeave = requestLeave ?? ((_intent, proceed) => proceed());
    return (
        <ResultFilterBar
            value={filterExpr}
            onChange={setFilterExpr}
            orderValue={orderByExpr}
            onOrderChange={setOrderByExpr}
            baseQuery={sourceQuery}
            columns={result?.columns ?? filterColumns ?? EMPTY_COLUMNS}
            tableName={result?.tableName ?? filterTableName}
            showFilterInput={showFilterInput}
            onAppendToQuery={onAppendToQuery}
            onOpenInNewTab={onOpenInNewTab}
            onRun={(currentValue, currentOrder) => {
                const nextExpr = typeof currentValue === 'string' ? currentValue : filterExpr;
                const nextOrder = typeof currentOrder === 'string' ? currentOrder : orderByExpr;
                if (!nextExpr.trim() && !nextOrder.trim()) return;
                leave('filter', () => {
                    keepFilterFocusRef.current = true;
                    onFilterRun?.(nextExpr, nextOrder, sourceQuery);
                });
            }}
            onClear={() => {
                // Inside the guard so a "Keep editing" leaves the filter text alone too.
                leave('filter', () => {
                    keepFilterFocusRef.current = true;
                    setFilterExpr('');
                    setOrderByExpr('');
                    onFilterRun?.('', '', sourceQuery);
                });
            }}
        >
            {renderActionsInline && panelActions.length > 0 && (
                <>{panelActions.map(renderPanelAction)}</>
            )}
        </ResultFilterBar>
    );
};
