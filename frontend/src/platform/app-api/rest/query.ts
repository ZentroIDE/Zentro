// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { QueryAdapter } from '../contracts/query';
import type { RestHttpClient } from './httpClient';
import type {
    OpenWritePreviewResult,
    ProductionWriteUnlockState,
    QueryAuditMeta,
    QueryPreflightResult,
    QueryPreviewResult,
    WritePreviewPage,
} from '../../../lib/writeSafety/safetyPreflight';

export function createQueryRestAdapter(client: RestHttpClient): QueryAdapter {
    return withKernelResult('query', {
        execute: (tabId: string, query: string) =>
            client.call<void>('/query/execute', { tabId, query }),
        cancel: (tabId: string) => client.call<void>('/query/cancel', { tabId }),
        copyActiveQuery: (fromTabId: string, toTabId: string) =>
            client.call<boolean>('/query/copy-active-query', { fromTabId, toTabId }),
        explain: (tabId: string, query: string, analyze: boolean) =>
            client.call<void>('/query/explain', { tabId, query, analyze }),
        executeUpdateSync: (tabId: string, sql: string) =>
            client.call<number>('/query/execute-update-sync', { tabId, sql }),
        preflight: (sql: string, environmentKey: string) =>
            client.call<QueryPreflightResult>('/query/preflight', { sql, environmentKey }),
        previewAffectedRows: (sql: string, environmentKey: string) =>
            client.call<QueryPreviewResult>('/query/preview-affected-rows', {
                sql,
                environmentKey,
            }),
        openWritePreview: (sql: string, environmentKey: string) =>
            client.call<OpenWritePreviewResult>('/query/open-write-preview', {
                sql,
                environmentKey,
            }),
        fetchWritePreviewRows: (previewSessionId: string, offset: number, limit: number) =>
            client.call<WritePreviewPage>('/query/fetch-write-preview-rows', {
                previewSessionId,
                offset,
                limit,
            }),
        closeWritePreview: (previewSessionId: string) =>
            client.call<void>('/query/close-write-preview', { previewSessionId }),
        unlockProductionWrites: (environmentKey: string) =>
            client.call<ProductionWriteUnlockState>('/query/unlock-production-writes', {
                environmentKey,
            }),
        setPendingQueryAuditMeta: (tabId: string, meta: QueryAuditMeta) =>
            client.call<void>('/query/set-pending-audit-meta', { tabId, meta }),
        fetchMoreRows: (tabId: string, offset: number) =>
            client.call<void>('/query/fetch-more-rows', { tabId, offset }),
        fetchRowRange: (tabId: string, offset: number, count: number) =>
            client.call<void>('/query/fetch-row-range', { tabId, offset, count }),
        executePinnedQuery: (tabId: string, query: string, profileName: string, dbName: string) =>
            client.call<void>('/query/execute-pinned', { tabId, query, profileName, dbName }),
        fetchPinnedMoreRows: (tabId: string, offset: number, profileName: string, dbName: string) =>
            client.call<void>('/query/fetch-pinned-more-rows', {
                tabId,
                offset,
                profileName,
                dbName,
            }),
        fetchPinnedRowRange: (
            tabId: string,
            offset: number,
            count: number,
            profileName: string,
            dbName: string,
        ) =>
            client.call<void>('/query/fetch-pinned-row-range', {
                tabId,
                offset,
                count,
                profileName,
                dbName,
            }),
        executePinnedUpdateSync: (
            tabId: string,
            sql: string,
            profileName: string,
            dbName: string,
            environmentKey: string,
        ) =>
            client.call<number>('/query/execute-pinned-update-sync', {
                tabId,
                sql,
                profileName,
                dbName,
                environmentKey,
            }),
        formatSQL: (query: string, driver: string) =>
            client.call<string>('/query/format-sql', { query, driver }),
        exportCSV: (columns: string[], rows: unknown[]) =>
            client.call<string>('/query/export-csv', { columns, rows }),
        exportAllCSV: (tabId: string, selectedColumns: string[], knownTotal: number) =>
            client.call<string>('/query/export-all-csv', { tabId, selectedColumns, knownTotal }),
        exportJSON: (columns: string[], rows: unknown[]) =>
            client.call<string>('/query/export-json', { columns, rows }),
        exportAllJSON: (tabId: string, selectedColumns: string[], knownTotal: number) =>
            client.call<string>('/query/export-all-json', { tabId, selectedColumns, knownTotal }),
        exportSQLInsert: (columns: string[], rows: unknown[], tableName: string) =>
            client.call<string>('/query/export-sql-insert', { columns, rows, tableName }),
        exportAllSQLInsert: (
            tabId: string,
            tableName: string,
            selectedColumns: string[],
            knownTotal: number,
        ) =>
            client.call<string>('/query/export-all-sql-insert', {
                tabId,
                tableName,
                selectedColumns,
                knownTotal,
            }),
    });
}
