// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';
import type {
    OpenWritePreviewResult,
    ProductionWriteUnlockState,
    QueryAuditMeta,
    QueryPreflightResult,
    QueryPreviewResult,
    WritePreviewPage,
} from '../../../lib/writeSafety/safetyPreflight';

export interface QueryAdapter {
    execute(tabId: string, query: string): Promise<KernelResult<void>>;
    cancel(tabId: string): Promise<KernelResult<void>>;
    /**
     * Lets a result kept under a new tab id keep paging and exporting: the
     * backend looks its statement up by tab id. Resolves false when there was
     * no statement to copy.
     */
    copyActiveQuery?(fromTabId: string, toTabId: string): Promise<KernelResult<boolean>>;
    explain(tabId: string, query: string, analyze: boolean): Promise<KernelResult<void>>;
    executeUpdateSync(tabId: string, sql: string): Promise<KernelResult<number>>;
    preflight?(sql: string, environmentKey: string): Promise<KernelResult<QueryPreflightResult>>;
    previewAffectedRows?(
        sql: string,
        environmentKey: string,
    ): Promise<KernelResult<QueryPreviewResult>>;
    openWritePreview?(
        sql: string,
        environmentKey: string,
    ): Promise<KernelResult<OpenWritePreviewResult>>;
    fetchWritePreviewRows?(
        previewSessionId: string,
        offset: number,
        limit: number,
    ): Promise<KernelResult<WritePreviewPage>>;
    closeWritePreview?(previewSessionId: string): Promise<KernelResult<void>>;
    unlockProductionWrites?(
        environmentKey: string,
    ): Promise<KernelResult<ProductionWriteUnlockState>>;
    setPendingQueryAuditMeta?(tabId: string, meta: QueryAuditMeta): Promise<KernelResult<void>>;
    fetchMoreRows(tabId: string, offset: number): Promise<KernelResult<void>>;
    fetchRowRange(tabId: string, offset: number, count: number): Promise<KernelResult<void>>;
    // Pinned Environment execution (ADR-0001, docs/adr/0001-pinned-environment-context-for-data-tabs.md)
    // — Table/Catalog tabs target their own pinned profileName/dbName
    // instead of the Active Environment that drives Query tabs above.
    executePinnedQuery(
        tabId: string,
        query: string,
        profileName: string,
        dbName: string,
    ): Promise<KernelResult<void>>;
    fetchPinnedMoreRows(
        tabId: string,
        offset: number,
        profileName: string,
        dbName: string,
    ): Promise<KernelResult<void>>;
    fetchPinnedRowRange(
        tabId: string,
        offset: number,
        count: number,
        profileName: string,
        dbName: string,
    ): Promise<KernelResult<void>>;
    executePinnedUpdateSync(
        tabId: string,
        sql: string,
        profileName: string,
        dbName: string,
        environmentKey: string,
    ): Promise<KernelResult<number>>;
    formatSQL(query: string, driver: string): Promise<KernelResult<string>>;
    exportCSV(columns: string[], rows: unknown[]): Promise<KernelResult<string>>;
    // knownTotal: the row count already cached from the result panel's own
    // background COUNT(*) (query:count event) — 0 when not known yet,
    // which leaves the export job's progress indeterminate.
    exportAllCSV(
        tabId: string,
        selectedColumns: string[],
        knownTotal: number,
    ): Promise<KernelResult<string>>;
    exportJSON(columns: string[], rows: unknown[]): Promise<KernelResult<string>>;
    exportAllJSON(
        tabId: string,
        selectedColumns: string[],
        knownTotal: number,
    ): Promise<KernelResult<string>>;
    exportSQLInsert(
        columns: string[],
        rows: unknown[],
        tableName: string,
    ): Promise<KernelResult<string>>;
    exportAllSQLInsert(
        tabId: string,
        tableName: string,
        selectedColumns: string[],
        knownTotal: number,
    ): Promise<KernelResult<string>>;
}
