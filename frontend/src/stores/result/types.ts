// SPDX-License-Identifier: GPL-3.0-only

import type {
    QueryExecutionState,
    QueryFailureCode,
    QueryProgress,
} from '../../features/query/runtime';
import type { DraftRow } from '../../lib/dataEditing';

const WINDOW_SIZE = 3000;

export { WINDOW_SIZE };

/** Row totals for a multi-statement run, from the backend's terminal summary
 *  event. statementCount/query describe the whole run — most statements'
 *  own started/done events are throttled away, so per-statement results
 *  can't be used to reconstruct them. */
export interface RunTotals {
    insertedRows: number;
    updatedRows: number;
    deletedRows: number;
    statementCount?: number;
    query?: string;
}

export interface TabResult {
    columns: string[];
    columnTypes?: string[];
    rows: string[][];
    isDone: boolean;
    affected: number;
    duration: number;
    error?: string;
    isSelect: boolean;
    hasMore: boolean;
    totalCount?: number;
    offset: number;
    isFetchingMore: boolean;
    tableName?: string;
    primaryKeys?: string[];
    filterExpr: string;
    orderByExpr: string;
    lastExecutedQuery?: string;
    statementLabel?: string;
    pendingEdits?: Map<string, string>;
    pendingDeletions?: Set<number>;
    pendingDraftRows?: DraftRow[];
    executionState: QueryExecutionState;
    failureCode: QueryFailureCode;
    progress: QueryProgress;
    windowStartOffset: number;
    lastFetchedAt?: number;
    /** Set while a manual "fetch N / fetch all" runs so appended rows are kept
     *  instead of being evicted down to WINDOW_SIZE. */
    unboundedWindow?: boolean;
}

export type ProjectResultBucket = Record<string, TabResult>;

export interface ResultState {
    projectResults: Record<string, ProjectResultBucket>;
    activeProjectId: string | null;
    results: ProjectResultBucket;
    transactionWrapTabs: Record<string, boolean>;
    transactionTotals: Record<string, RunTotals>;
    // Server-side informational messages (T-SQL PRINT / low-severity
    // RAISERROR) for a query tab's latest run, keyed by source tab id — one
    // list per run rather than per statement, since fast statements skip the
    // started/done events that create a per-statement result bucket.
    messagesByTab: Record<string, string[]>;
    /** Bumped when a result's slot is handed over (see `keepResult`), so the panel showing it starts from a clean state. */
    resultEpochs: Record<string, number>;
    /** Asks the query tab that owns `key` to show that result; consumed by the result tab bar. */
    resultRevealRequest: { key: string; nonce: number } | null;

    switchProject: (projectId: string | null) => void;
    clearProject: (projectId?: string | null) => void;
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
    /**
     * Sets a result aside under `toKey`, unsaved edits and all, and leaves a
     * clean copy of its rows in `fromKey` so the next run can take that slot.
     */
    keepResult: (fromKey: string, toKey: string) => void;
    requestResultReveal: (key: string) => void;
    appendMessage: (sourceTabId: string, text: string) => void;
    clearMessages: (sourceTabId: string) => void;
    isDone: (tabId: string) => boolean;
    applyEdits: (tabId: string, edits: Map<string, string>, deletedRows?: Set<number>) => void;
    prependRows: (tabId: string, offset: number, rows: string[][]) => void;
    appendInsertedRows: (tabId: string, rows: string[][]) => void;
    setFilterExpr: (tabId: string, filterExpr: string) => void;
    setOrderByExpr: (tabId: string, orderByExpr: string) => void;
    setLastExecutedQuery: (tabId: string, query: string) => void;
    setStatementLabel: (tabId: string, label: string) => void;
    setTransactionWrap: (tabId: string, flag: boolean) => void;
    setTransactionTotals: (tabId: string, totals: RunTotals) => void;
    clearTransactionTotals: (tabId: string) => void;
    updatePendingState: (
        tabId: string,
        editedCells: Map<string, string>,
        deletedRows: Set<number>,
        draftRows: DraftRow[],
    ) => void;
    setExecutionState: (
        tabId: string,
        state: QueryExecutionState,
        failureCode?: QueryFailureCode,
    ) => void;
    markFirstRow: (tabId: string) => void;
    touchProgress: (tabId: string, appendedRows: number) => void;
}

export const DEFAULT_WORKSPACE_ID = '__default__';

export const createEmptyBucket = (): ProjectResultBucket => ({});

export const getProjectId = (projectId?: string | null) => projectId || DEFAULT_WORKSPACE_ID;

export function getActiveBucket(state: Pick<ResultState, 'projectResults' | 'activeProjectId'>) {
    return state.projectResults[getProjectId(state.activeProjectId)] || createEmptyBucket();
}

export function updateActiveBucket(
    state: ResultState,
    updater: (bucket: ProjectResultBucket) => ProjectResultBucket,
) {
    const projectId = getProjectId(state.activeProjectId);
    const nextBucket = updater(getActiveBucket(state));

    return {
        projectResults: {
            ...state.projectResults,
            [projectId]: nextBucket,
        },
        results: nextBucket,
    };
}
