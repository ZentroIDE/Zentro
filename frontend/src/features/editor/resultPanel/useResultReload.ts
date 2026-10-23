// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { RequestResultLeave } from './resultUnsavedGate';

interface ResultReloadOptions {
    filterExpr: string;
    orderByExpr: string;
    sourceQuery: string;
    onFilterRun?: (filter: string, orderByExpr?: string, filterBaseQuery?: string) => void;
    onRun?: () => void;
}

/**
 * Re-runs the result with the current WHERE / ORDER BY when there is one,
 * otherwise re-runs the plain query. No guard: this is what runs *after* the
 * guard said yes (or after a save), so it must never be blocked by the edits
 * that are being saved.
 */
export function reloadResult({
    filterExpr,
    orderByExpr,
    sourceQuery,
    onFilterRun,
    onRun,
}: ResultReloadOptions): void {
    const nextFilter = filterExpr.trim();
    const nextOrder = orderByExpr.trim();
    if ((nextFilter || nextOrder) && onFilterRun) {
        onFilterRun(nextFilter, nextOrder, sourceQuery);
        return;
    }
    onRun?.();
}

export function useResultReload({
    filterExpr,
    orderByExpr,
    sourceQuery,
    onFilterRun,
    onRun,
}: ResultReloadOptions) {
    return React.useCallback(
        () => reloadResult({ filterExpr, orderByExpr, sourceQuery, onFilterRun, onRun }),
        [filterExpr, onFilterRun, onRun, orderByExpr, sourceQuery],
    );
}

interface GuardedReloadOptions {
    reload: () => void;
    isReadOnlyTab: boolean;
    requestLeave: RequestResultLeave;
}

/**
 * The user-facing reload: the toolbar Reload button, F5 in the grid and the
 * RELOAD_RESULT command (F5 from a table tab) all go through this, so they can
 * never disagree on when a reload is allowed. Unsaved edits don't block it
 * outright — they park it behind the "Save your changes?" banner.
 */
export function guardedReload({ reload, isReadOnlyTab, requestLeave }: GuardedReloadOptions): void {
    if (isReadOnlyTab) return;
    requestLeave('reload', reload);
}

export function useGuardedResultReload({
    reload,
    isReadOnlyTab,
    requestLeave,
}: GuardedReloadOptions) {
    return React.useCallback(
        () => guardedReload({ reload, isReadOnlyTab, requestLeave }),
        [isReadOnlyTab, reload, requestLeave],
    );
}
