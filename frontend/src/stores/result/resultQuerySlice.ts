// SPDX-License-Identifier: GPL-3.0-only

import type { StateCreator } from 'zustand';
import type { ResultState, ProjectResultBucket, RunTotals } from './types';
import { WINDOW_SIZE, getActiveBucket, updateActiveBucket } from './types';

export interface ResultQuerySlice {
    initTab: (tabId: string) => void;
    appendRows: (
        tabId: string,
        columns: string[] | undefined,
        rows: string[][],
        tableName?: string,
        primaryKeys?: string[],
    ) => void;
    setDone: (
        tabId: string,
        affected: number,
        duration: number,
        isSelect: boolean,
        hasMore: boolean,
        error?: string,
    ) => void;
    setOffset: (tabId: string, offset: number) => void;
    setTotalCount: (tabId: string, count: number) => void;
    clearFetchingMore: (tabId: string) => void;
    setUnboundedWindow: (tabId: string, unbounded: boolean) => void;
    clearResult: (tabId: string) => void;
    keepResult: (fromKey: string, toKey: string) => void;
    requestResultReveal: (key: string) => void;
    appendMessage: (sourceTabId: string, text: string) => void;
    clearMessages: (sourceTabId: string) => void;
    prependRows: (tabId: string, offset: number, rows: string[][]) => void;
    setFilterExpr: (tabId: string, filterExpr: string) => void;
    setOrderByExpr: (tabId: string, orderByExpr: string) => void;
    setLastExecutedQuery: (tabId: string, query: string) => void;
    setStatementLabel: (tabId: string, label: string) => void;
    setTransactionWrap: (tabId: string, flag: boolean) => void;
    setTransactionTotals: (tabId: string, totals: RunTotals) => void;
    clearTransactionTotals: (tabId: string) => void;
    setExecutionState: (
        tabId: string,
        state: import('../../features/query/runtime').QueryExecutionState,
        failureCode?: import('../../features/query/runtime').QueryFailureCode,
    ) => void;
    markFirstRow: (tabId: string) => void;
    touchProgress: (tabId: string, appendedRows: number) => void;
    isDone: (tabId: string) => boolean;
}

export const createResultQuerySlice: StateCreator<ResultState, [], [], ResultQuerySlice> = (
    set,
    get,
) => ({
    initTab: tabId =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                return {
                    ...bucket,
                    [tabId]: {
                        columns: prev?.columns || [],
                        rows: prev?.rows || [],
                        isDone: false,
                        affected: 0,
                        duration: 0,
                        isSelect: true,
                        error: undefined,
                        hasMore: true,
                        totalCount: undefined,
                        offset: 0,
                        isFetchingMore: false,
                        tableName: prev?.tableName,
                        primaryKeys: prev?.primaryKeys,
                        filterExpr: prev?.filterExpr || '',
                        orderByExpr: prev?.orderByExpr || '',
                        lastExecutedQuery: prev?.lastExecutedQuery,
                        pendingEdits: prev?.pendingEdits || new Map(),
                        pendingDeletions: prev?.pendingDeletions || new Set(),
                        pendingDraftRows: [],
                        executionState: 'queued',
                        failureCode: 'none',
                        progress: {
                            startedAt: Date.now(),
                            rowsReceived: 0,
                            chunksReceived: 0,
                        },
                        windowStartOffset: 0,
                    },
                };
            }),
        ),

    appendRows: (tabId, columns, rows, tableName, primaryKeys) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                const isFirstChunk =
                    prev.progress.chunksReceived === 0 &&
                    columns !== undefined &&
                    columns.length > 0;

                if (isFirstChunk) {
                    return {
                        ...bucket,
                        [tabId]: {
                            ...prev,
                            columns: columns || prev.columns,
                            rows: rows.slice(0, WINDOW_SIZE),
                            tableName: tableName || prev.tableName,
                            primaryKeys: primaryKeys || prev.primaryKeys,
                            windowStartOffset: 0,
                            unboundedWindow: false,
                            pendingEdits: new Map(),
                            pendingDeletions: new Set(),
                        },
                    };
                }

                const merged = [...prev.rows, ...rows];
                if (merged.length <= WINDOW_SIZE || prev.unboundedWindow) {
                    return {
                        ...bucket,
                        [tabId]: {
                            ...prev,
                            columns: columns || prev.columns,
                            rows: merged,
                            tableName: tableName || prev.tableName,
                            primaryKeys: primaryKeys || prev.primaryKeys,
                        },
                    };
                }

                const excess = merged.length - WINDOW_SIZE;
                const nextRows = merged.slice(excess);
                const nextWindowStart = prev.windowStartOffset + excess;

                const nextEdits = new Map<string, string>();
                prev.pendingEdits?.forEach((val, key) => {
                    if (Number(key.split(':')[0]) >= nextWindowStart) nextEdits.set(key, val);
                });
                const nextDeletions = new Set<number>();
                prev.pendingDeletions?.forEach(idx => {
                    if (idx >= nextWindowStart) nextDeletions.add(idx);
                });

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        columns: columns || prev.columns,
                        rows: nextRows,
                        tableName: tableName || prev.tableName,
                        primaryKeys: primaryKeys || prev.primaryKeys,
                        windowStartOffset: nextWindowStart,
                        pendingEdits: nextEdits,
                        pendingDeletions: nextDeletions,
                    },
                };
            }),
        ),

    setDone: (tabId, affected, duration, isSelect, hasMore, error) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        isDone: true,
                        affected: isSelect ? prev.windowStartOffset + prev.rows.length : affected,
                        duration,
                        isSelect,
                        error,
                        hasMore,
                        isFetchingMore: false,
                        rows: isSelect ? prev.rows : [],
                        columns: isSelect ? prev.columns : [],
                        executionState: error
                            ? String(error).toLowerCase().includes('cancel')
                                ? 'cancelled'
                                : 'failed'
                            : 'done',
                        lastFetchedAt: prev.isFetchingMore ? Date.now() : prev.lastFetchedAt,
                    },
                };
            }),
        ),

    setTotalCount: (tabId, count) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;
                return { ...bucket, [tabId]: { ...prev, totalCount: count } };
            }),
        ),

    setOffset: (tabId, offset) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        offset,
                        isFetchingMore: true,
                    },
                };
            }),
        ),

    clearFetchingMore: tabId =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        isFetchingMore: false,
                    },
                };
            }),
        ),

    setUnboundedWindow: (tabId, unbounded) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev || Boolean(prev.unboundedWindow) === unbounded) return bucket;
                return { ...bucket, [tabId]: { ...prev, unboundedWindow: unbounded } };
            }),
        ),

    clearResult: tabId =>
        set(state => {
            const nextWrap = { ...state.transactionWrapTabs };
            delete nextWrap[tabId];
            const nextTotals = { ...state.transactionTotals };
            delete nextTotals[tabId];
            return {
                transactionWrapTabs: nextWrap,
                transactionTotals: nextTotals,
                ...updateActiveBucket(state, bucket => {
                    const nextBucket = { ...bucket };
                    delete nextBucket[tabId];
                    return nextBucket;
                }),
            };
        }),

    keepResult: (fromKey, toKey) =>
        set(state => {
            if (fromKey === toKey || !getActiveBucket(state)[fromKey]) return state;
            return {
                resultEpochs: {
                    ...state.resultEpochs,
                    [fromKey]: (state.resultEpochs[fromKey] ?? 0) + 1,
                },
                ...updateActiveBucket(state, bucket => {
                    const prev = bucket[fromKey];
                    if (!prev) return bucket;
                    return {
                        ...bucket,
                        [toKey]: prev,
                        // The rows stay visible until the new run's first chunk lands, as
                        // they do when a run replaces a clean result, but the edits go
                        // with the kept copy.
                        [fromKey]: {
                            ...prev,
                            pendingEdits: new Map(),
                            pendingDeletions: new Set(),
                            pendingDraftRows: [],
                        },
                    };
                }),
            };
        }),

    requestResultReveal: key =>
        set(state => ({
            resultRevealRequest: { key, nonce: (state.resultRevealRequest?.nonce ?? 0) + 1 },
        })),

    appendMessage: (sourceTabId, text) =>
        set(state => ({
            messagesByTab: {
                ...state.messagesByTab,
                [sourceTabId]: [...(state.messagesByTab[sourceTabId] ?? []), text],
            },
        })),

    clearMessages: sourceTabId =>
        set(state => {
            if (!state.messagesByTab[sourceTabId]) return state;
            const next = { ...state.messagesByTab };
            delete next[sourceTabId];
            return { messagesByTab: next };
        }),

    prependRows: (tabId, offset, rows) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev || rows.length === 0) return bucket;

                // Discard stale responses
                if (offset + rows.length !== prev.windowStartOffset) return bucket;

                const merged = [...rows, ...prev.rows];
                const nextWindowStart = offset;

                if (merged.length <= WINDOW_SIZE) {
                    return {
                        ...bucket,
                        [tabId]: { ...prev, rows: merged, windowStartOffset: nextWindowStart },
                    };
                }

                // Drop from the tail to keep within window
                const nextRows = merged.slice(0, WINDOW_SIZE);
                const evictFrom = nextWindowStart + WINDOW_SIZE;

                const nextEdits = new Map<string, string>();
                prev.pendingEdits?.forEach((val, key) => {
                    if (Number(key.split(':')[0]) < evictFrom) nextEdits.set(key, val);
                });
                const nextDeletions = new Set<number>();
                prev.pendingDeletions?.forEach(idx => {
                    if (idx < evictFrom) nextDeletions.add(idx);
                });

                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        rows: nextRows,
                        windowStartOffset: nextWindowStart,
                        pendingEdits: nextEdits,
                        pendingDeletions: nextDeletions,
                    },
                };
            }),
        ),

    setFilterExpr: (tabId, filterExpr) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: { ...prev, filterExpr },
                };
            }),
        ),

    setOrderByExpr: (tabId, orderByExpr) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: { ...prev, orderByExpr },
                };
            }),
        ),

    setLastExecutedQuery: (tabId, query) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;

                return {
                    ...bucket,
                    [tabId]: { ...prev, lastExecutedQuery: query },
                };
            }),
        ),

    setStatementLabel: (tabId, label) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;
                return { ...bucket, [tabId]: { ...prev, statementLabel: label } };
            }),
        ),

    setTransactionWrap: (tabId, flag) =>
        set(state => ({
            transactionWrapTabs: { ...state.transactionWrapTabs, [tabId]: flag },
        })),

    setTransactionTotals: (tabId, totals) =>
        set(state => ({
            transactionTotals: { ...state.transactionTotals, [tabId]: totals },
        })),

    clearTransactionTotals: tabId =>
        set(state => {
            if (!state.transactionTotals[tabId]) return state;
            const next = { ...state.transactionTotals };
            delete next[tabId];
            return { transactionTotals: next };
        }),

    setExecutionState: (tabId, executionState, failureCode = 'none') =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;
                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        executionState,
                        failureCode,
                    },
                };
            }),
        ),

    markFirstRow: tabId =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;
                if (prev.progress.firstRowAt) return bucket;
                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        progress: {
                            ...prev.progress,
                            firstRowAt: Date.now(),
                        },
                    },
                };
            }),
        ),

    touchProgress: (tabId, appendedRows) =>
        set(state =>
            updateActiveBucket(state, bucket => {
                const prev = bucket[tabId];
                if (!prev) return bucket;
                return {
                    ...bucket,
                    [tabId]: {
                        ...prev,
                        executionState: appendedRows > 0 ? 'streaming' : prev.executionState,
                        progress: {
                            ...prev.progress,
                            rowsReceived: prev.progress.rowsReceived + appendedRows,
                            chunksReceived: prev.progress.chunksReceived + 1,
                            lastChunkAt: Date.now(),
                        },
                    },
                };
            }),
        ),

    isDone: tabId => {
        const result = get().results[tabId];
        return result ? result.isDone : true;
    },
});
