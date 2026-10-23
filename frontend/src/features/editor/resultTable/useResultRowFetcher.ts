// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { useResultStore } from '../../../stores/resultStore';

import { loadMoreResultTableRows } from './loadMoreRows';
import { runRowFetch, type RowFetchOutcome, type RowFetchSnapshot } from './rowFetchRunner';
import type { ResultTableProps } from './types';

interface UseResultRowFetcherArgs {
    tabId: string;
    previewSessionId?: string;
    pinnedConnection?: ResultTableProps['pinnedConnection'];
}

function readSnapshot(tabId: string): RowFetchSnapshot | null {
    const result = useResultStore.getState().results[tabId];
    if (!result) return null;
    return {
        absEnd: result.windowStartOffset + result.rows.length,
        hasMore: Boolean(result.hasMore),
        hasError: Boolean(result.error),
    };
}

/** Resolves once the tab is no longer fetching more rows (or the tab result is gone). */
function waitForFetchSettled(tabId: string, isCancelled: () => boolean): Promise<void> {
    const isSettled = () => {
        const result = useResultStore.getState().results[tabId];
        return !result || !result.isFetchingMore || isCancelled();
    };
    if (isSettled()) return Promise.resolve();
    return new Promise(resolve => {
        const unsubscribe = useResultStore.subscribe(() => {
            if (!isSettled()) return;
            unsubscribe();
            resolve();
        });
    });
}

/**
 * Manual "fetch N more" / "fetch all" for a result tab. Reuses the scroll-driven single batch
 * fetch, repeated, and keeps the whole run in memory: while it is active the store skips
 * evicting rows down to the sliding window.
 */
export function useResultRowFetcher({
    tabId,
    previewSessionId,
    pinnedConnection,
}: UseResultRowFetcherArgs) {
    const [isRunning, setIsRunning] = React.useState(false);
    const cancelledRef = React.useRef(false);
    const runningRef = React.useRef(false);

    React.useEffect(
        () => () => {
            cancelledRef.current = true;
        },
        [],
    );

    const cancel = React.useCallback(() => {
        cancelledRef.current = true;
    }, []);

    const start = React.useCallback(
        async (target: number | 'all'): Promise<RowFetchOutcome | null> => {
            const initial = useResultStore.getState().results[tabId];
            if (runningRef.current || !initial || initial.isFetchingMore) return null;

            runningRef.current = true;
            cancelledRef.current = false;
            setIsRunning(true);
            const isCancelled = () => cancelledRef.current;
            useResultStore.getState().setUnboundedWindow(tabId, true);

            try {
                return await runRowFetch({
                    target,
                    getSnapshot: () => readSnapshot(tabId),
                    isCancelled,
                    fetchBatch: async () => {
                        const store = useResultStore.getState();
                        const result = store.results[tabId];
                        if (!result) return;
                        await loadMoreResultTableRows({
                            tabId,
                            previewSessionId,
                            windowStartOffset: result.windowStartOffset,
                            loadedRowsLength: result.rows.length,
                            clearFetchingMore: store.clearFetchingMore,
                            setOffset: store.setOffset,
                            appendRows: store.appendRows,
                            touchProgress: store.touchProgress,
                            markFirstRow: store.markFirstRow,
                            setTotalCount: store.setTotalCount,
                            setDone: store.setDone,
                            ...(pinnedConnection
                                ? {
                                      fetchMoreRows: (id: string, offset: number) =>
                                          getApiGateway().query.fetchPinnedMoreRows(
                                              id,
                                              offset,
                                              pinnedConnection.connectionID,
                                              pinnedConnection.dbName,
                                          ),
                                  }
                                : {}),
                        });
                        await waitForFetchSettled(tabId, isCancelled);
                    },
                });
            } finally {
                useResultStore.getState().setUnboundedWindow(tabId, false);
                runningRef.current = false;
                setIsRunning(false);
            }
        },
        [pinnedConnection, previewSessionId, tabId],
    );

    return { isRunning, start, cancel };
}
