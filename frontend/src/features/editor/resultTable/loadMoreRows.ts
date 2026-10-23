// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../../platform/apiGatewayRuntime';

const defaultFetchMoreRows = (tabId: string, offset: number) =>
    getApiGateway().query.fetchMoreRows(tabId, offset);
const defaultFetchWritePreviewRows = (previewSessionId: string, offset: number, limit: number) =>
    getApiGateway().query.fetchWritePreviewRows?.(previewSessionId, offset, limit);

interface ResultTableLoadMoreRowsParams {
    tabId: string;
    previewSessionId?: string;
    windowStartOffset: number;
    loadedRowsLength: number;
    clearFetchingMore: (tabId: string) => void;
    setOffset: (tabId: string, offset: number) => void;
    appendRows: (
        tabId: string,
        columns: string[],
        rows: string[][],
        tableName?: string,
        primaryKeys?: string[],
    ) => void;
    touchProgress: (tabId: string, rowsFetched: number) => void;
    markFirstRow: (tabId: string) => void;
    setTotalCount: (tabId: string, totalCount: number) => void;
    setDone: (
        tabId: string,
        rowsFetched: number,
        elapsedMs: number,
        isSelect: boolean,
        hasMore: boolean,
        error?: string,
    ) => void;
    fetchMoreRows?: typeof defaultFetchMoreRows;
    fetchWritePreviewRows?: typeof defaultFetchWritePreviewRows;
}

export async function loadMoreResultTableRows({
    tabId,
    previewSessionId,
    windowStartOffset,
    loadedRowsLength,
    clearFetchingMore,
    setOffset,
    appendRows,
    touchProgress,
    markFirstRow,
    setTotalCount,
    setDone,
    fetchMoreRows = defaultFetchMoreRows,
    fetchWritePreviewRows = defaultFetchWritePreviewRows,
}: ResultTableLoadMoreRowsParams): Promise<void> {
    const nextOffset = windowStartOffset + loadedRowsLength;
    setOffset(tabId, nextOffset);

    if (previewSessionId) {
        const previewPromise = fetchWritePreviewRows(previewSessionId, nextOffset, 100);
        if (!previewPromise) {
            clearFetchingMore(tabId);
            return;
        }

        const result = await previewPromise;
        if (!result.ok) {
            clearFetchingMore(tabId);
            console.error(result.error.message);
            return;
        }
        const page = result.data;
        appendRows(tabId, page.columns, page.rows, page.tableName, []);
        touchProgress(tabId, page.rows.length);
        if (page.rows.length > 0) {
            markFirstRow(tabId);
        }
        setTotalCount(tabId, page.totalCount);
        setDone(tabId, page.rows.length, 0, true, page.hasMore);

        return;
    }

    const result = await fetchMoreRows(tabId, nextOffset);
    if (!result.ok) {
        clearFetchingMore(tabId);
        console.error(result.error.message);
    }
}
