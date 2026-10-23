// SPDX-License-Identifier: GPL-3.0-only

import {
    ExecuteQuery,
    CancelQuery,
    CopyActiveQuery,
    ExplainQuery,
    ExecuteUpdateSync,
    OpenWritePreview,
    PreflightQuery,
    FetchWritePreviewRows,
    PreviewAffectedRows,
    CloseWritePreview,
    UnlockProductionWrites,
    SetPendingQueryAuditMeta,
    FetchMoreRows,
    FetchRowRange,
    ExecutePinnedQuery,
    FetchPinnedMoreRows,
    FetchPinnedRowRange,
    ExecutePinnedUpdateSync,
    FormatSQL,
    ExportCSV,
    ExportAllCSV,
    ExportJSON,
    ExportAllJSON,
    ExportSQLInsert,
    ExportAllSQLInsert,
} from '../../../wailsjs/go/app/App';
import type {
    OpenWritePreviewResult,
    ProductionWriteUnlockState,
    QueryAuditMeta,
    QueryPreflightResult,
    QueryPreviewResult,
    WritePreviewPage,
} from '../../lib/writeSafety/safetyPreflight';
import type { QueryStatFilter, QueryStatReport } from './contracts/queryStats';
import { optionalWailsBinding } from './wailsOptionalBinding';

// Query Stats panel is Pro (internal/app/pro_querystat_facade.go) — absent
// from a build exported without that file.
const GetQueryStats =
    optionalWailsBinding<(filter: QueryStatFilter) => Promise<QueryStatReport>>('GetQueryStats');

function toRecord(raw: unknown): Record<string, unknown> | undefined {
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

function mapUnlockState(
    raw: Record<string, unknown> | null | undefined,
): ProductionWriteUnlockState {
    return {
        environmentKey: typeof raw?.environment_key === 'string' ? raw.environment_key : '',
        unlocked: raw?.unlocked === true,
        unlockUntil: typeof raw?.unlock_until === 'string' ? raw.unlock_until : undefined,
    };
}

function mapPreview(raw: Record<string, unknown> | null | undefined): QueryPreviewResult {
    return {
        supported: raw?.supported === true,
        affectedRowCount:
            typeof raw?.affected_row_count === 'number' ? raw.affected_row_count : undefined,
        countKnown: raw?.count_known === true,
        columns: Array.isArray(raw?.columns) ? (raw?.columns as string[]) : [],
        rows: Array.isArray(raw?.rows) ? (raw?.rows as string[][]) : [],
        fallbackReason: typeof raw?.fallback_reason === 'string' ? raw.fallback_reason : undefined,
    };
}

function mapWritePreviewPage(raw: Record<string, unknown> | null | undefined): WritePreviewPage {
    return {
        columns: Array.isArray(raw?.columns) ? (raw?.columns as string[]) : [],
        rows: Array.isArray(raw?.rows) ? (raw?.rows as string[][]) : [],
        hasMore: raw?.has_more === true,
        totalCount: typeof raw?.total_count === 'number' ? raw.total_count : 0,
        tableName: typeof raw?.table_name === 'string' ? raw.table_name : undefined,
    };
}

function mapOpenWritePreviewResult(
    raw: Record<string, unknown> | null | undefined,
): OpenWritePreviewResult {
    return {
        previewSessionId: typeof raw?.preview_session_id === 'string' ? raw.preview_session_id : '',
        previewTabQueryLabel:
            typeof raw?.preview_tab_query_label === 'string' ? raw.preview_tab_query_label : '',
        initialResultMeta: mapWritePreviewPage(
            (raw?.initial_result_meta as Record<string, unknown> | undefined) || undefined,
        ),
    };
}

// Go's QueryAuditMeta uses snake_case JSON tags (risk_level, preview_row_count,
// used_protection_layers, snapshot_ref); the FE-facing QueryAuditMeta type is
// camelCase. Wails does not translate call arguments, so forwarding the FE
// object as-is silently drops every field but `reason` (the only key that
// happens to match in both cases) — the backend then sees an effectively
// empty audit meta and rejects the write even after the user confirmed it.
function mapAuditMetaToGo(meta: QueryAuditMeta) {
    return {
        reason: meta.reason,
        risk_level: meta.riskLevel,
        preview_row_count: meta.previewRowCount,
        used_protection_layers: meta.usedProtectionLayers,
        snapshot_ref: meta.snapshotRef,
    };
}

function mapPreflight(raw: Record<string, unknown> | null | undefined): QueryPreflightResult {
    return {
        statements: Array.isArray(raw?.statements)
            ? (raw?.statements as Record<string, unknown>[]).map(statement => ({
                  statementText:
                      typeof statement.statement_text === 'string' ? statement.statement_text : '',
                  operation: typeof statement.operation === 'string' ? statement.operation : '',
                  riskLevel:
                      typeof statement.risk_level === 'string' ? statement.risk_level : 'safe',
                  hasWhere: statement.has_where === true,
                  destructive: statement.destructive === true,
                  previewSupported: statement.preview_supported === true,
                  typeToConfirmText:
                      typeof statement.type_to_confirm_text === 'string'
                          ? statement.type_to_confirm_text
                          : undefined,
              }))
            : [],
        riskLevel: typeof raw?.risk_level === 'string' ? raw.risk_level : 'safe',
        requiresPro: raw?.requires_pro === true,
        requiresProductionUnlock: raw?.requires_production_unlock === true,
        productionUnlock: mapUnlockState(
            (raw?.production_unlock as Record<string, unknown> | undefined) || undefined,
        ),
        requiresTypeToConfirm: raw?.requires_type_to_confirm === true,
        typeToConfirmText:
            typeof raw?.type_to_confirm_text === 'string' ? raw.type_to_confirm_text : undefined,
        requiresCooldown: raw?.requires_cooldown === true,
        cooldownSeconds: typeof raw?.cooldown_seconds === 'number' ? raw.cooldown_seconds : 0,
        requiresReason: raw?.requires_reason === true,
        affectedRowsPreview: mapPreview(
            (raw?.affected_rows_preview as Record<string, unknown> | undefined) || undefined,
        ),
        usedProtectionLayers: Array.isArray(raw?.used_protection_layers)
            ? (raw?.used_protection_layers as string[])
            : [],
        transactionSuggested: raw?.transaction_suggested === true,
        snapshotRequired: raw?.snapshot_required === true,
    };
}

export const queryAdapter = {
    ExecuteQuery,
    CancelQuery,
    CopyActiveQuery,
    ExplainQuery,
    ExecuteUpdateSync,
    OpenWritePreview: async (sql: string, environmentKey: string) =>
        mapOpenWritePreviewResult(toRecord(await OpenWritePreview(sql, environmentKey))),
    PreflightQuery: async (sql: string, environmentKey: string) =>
        mapPreflight(toRecord(await PreflightQuery(sql, environmentKey))),
    FetchWritePreviewRows: async (previewSessionId: string, offset: number, limit: number) =>
        mapWritePreviewPage(toRecord(await FetchWritePreviewRows(previewSessionId, offset, limit))),
    PreviewAffectedRows: async (sql: string, environmentKey: string) =>
        mapPreview(toRecord(await PreviewAffectedRows(sql, environmentKey))),
    CloseWritePreview,
    UnlockProductionWrites: async (environmentKey: string) =>
        mapUnlockState(toRecord(await UnlockProductionWrites(environmentKey))),
    SetPendingQueryAuditMeta: (tabId: string, meta: QueryAuditMeta) =>
        SetPendingQueryAuditMeta(tabId, mapAuditMetaToGo(meta)),
    FetchMoreRows,
    FetchRowRange,
    ExecutePinnedQuery,
    FetchPinnedMoreRows,
    FetchPinnedRowRange,
    ExecutePinnedUpdateSync,
    FormatSQL,
    ExportCSV,
    ExportAllCSV,
    ExportJSON,
    ExportAllJSON,
    ExportSQLInsert,
    ExportAllSQLInsert,
    ...(GetQueryStats ? { GetQueryStats: (filter: QueryStatFilter) => GetQueryStats(filter) } : {}),
};
