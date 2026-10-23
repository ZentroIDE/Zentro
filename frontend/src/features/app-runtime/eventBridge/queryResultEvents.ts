// SPDX-License-Identifier: GPL-3.0-only

import {
    onQueryChunk,
    onQueryCount,
    onQueryDone,
    onQueryMessage,
    onQueryRange,
    onQueryStarted,
    onQueryTransactionSummary,
    type QueryDonePayload,
    type QueryStartedPayload,
} from '../../../lib/events';
import { TAB_TYPE } from '../../../lib/constants';
import { getDataDirtyCount } from '../../../lib/pendingChanges';
import { useResultStore } from '../../../stores/resultStore';
import { useEditorStore } from '../../../stores/editorStore';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useStatusStore } from '../../../stores/statusStore';
import { appLogger } from '../../../lib/logger';
import { classifyQueryFailure } from '../../query/runtime';
import { getTelemetryConsent } from '../../telemetry/consent';
import {
    queueTelemetryAnalytics,
    saveQuerySnapshot,
    toTelemetryEvent,
} from '../../telemetry/localMetricsStore';
import { notifyImportantError, type EventBridgeToast, type Unsubscribe } from './shared';

function clearGeneratedResults(sourceTabID: string) {
    const resultState = useResultStore.getState();
    Object.keys(resultState.results).forEach(k => {
        if (
            k !== sourceTabID &&
            (k.startsWith(`${sourceTabID}::result:`) || k.startsWith(`${sourceTabID}::explain:`))
        ) {
            // A result set aside for its unsaved edits outlives the next run.
            if (getDataDirtyCount(resultState.results[k]) > 0) return;
            resultState.clearResult(k);
        }
    });
}

function shouldAutoOpenResultPanel(sourceTabID: string): boolean {
    const sourceTab = useEditorStore
        .getState()
        .groups.flatMap(group => group.tabs)
        .find(tab => tab.id === sourceTabID);

    // Only a real, known editor query tab auto-reveals the shared bottom
    // result panel. An unresolved source id — notably TableInfo's
    // "data-<tabId>" data grid, which streams through these same query
    // events — must NOT pop the panel open on every table click. Previously
    // an unknown id fell back to TAB_TYPE.QUERY and did exactly that.
    return sourceTab?.type === TAB_TYPE.QUERY;
}

function recordTelemetryEvent(event: string, payload: Record<string, unknown>) {
    toTelemetryEvent(event, payload);
    queueTelemetryAnalytics(event, payload, getTelemetryConsent());
}

export interface QueryResultEventDeps {
    toast: EventBridgeToast;
}

// Query result streaming events. Chunk and statement (started/done) payloads
// are buffered and applied on animation frames so bulk scripts don't flood
// React with per-event renders; terminal "done" events flush synchronously.
export function subscribeQueryResultEvents(deps: QueryResultEventDeps): Unsubscribe[] {
    const { toast } = deps;

    const chunkBuffers = new Map<
        string,
        {
            columns?: string[];
            rows: string[][];
            tableName?: string;
            primaryKeys?: string[];
        }
    >();
    let flushHandle: number | null = null;

    const flushChunks = () => {
        for (const [tabId, chunk] of chunkBuffers.entries()) {
            // A fast query can have its started+chunk+done events all
            // land within the same synchronous burst (e.g. local
            // Postgres on a small table). onQueryDone eagerly flushes
            // pending chunks before its own buffered `started` has had a
            // chance to run via rAF — apply it here first so initTab()
            // (which resets rows/chunksReceived) always runs before
            // appendRows() reads `prev`, or a reload duplicates the
            // previous run's rows instead of replacing them.
            const pendingStatement = statementBuffers.get(tabId);
            if (pendingStatement?.started) {
                applyQueryStartedSideEffects(pendingStatement.started);
                statementBuffers.set(tabId, { ...pendingStatement, started: undefined });
            }

            useResultStore
                .getState()
                .appendRows(tabId, chunk.columns, chunk.rows, chunk.tableName, chunk.primaryKeys);
            useResultStore.getState().touchProgress(tabId, chunk.rows.length);
            if (chunk.rows.length > 0) {
                useResultStore.getState().markFirstRow(tabId);
            }
        }
        chunkBuffers.clear();
        flushHandle = null;
    };

    const scheduleFlush = () => {
        if (flushHandle !== null) return;
        flushHandle = window.requestAnimationFrame(flushChunks);
    };

    // Keyed by tabID. Both `started` and `done` can arrive for the same
    // tabID within a single animation frame (fast queries, e.g. local
    // Postgres) — track them separately rather than overwriting one with
    // the other, and flush `started` before `done` so `initTab()` always
    // runs before `setDone()` needs the bucket entry to exist.
    interface PendingStatementSnapshot {
        started?: QueryStartedPayload;
        done?: QueryDonePayload;
    }

    const statementBuffers = new Map<string, PendingStatementSnapshot>();
    let statementFlushHandle: number | null = null;

    const applyQueryStartedSideEffects = (payload: QueryStartedPayload) => {
        useResultStore.getState().initTab(payload.tabID);
        useResultStore.getState().setExecutionState(payload.tabID, 'running');
        const autoOpenResultPanel = shouldAutoOpenResultPanel(payload.sourceTabID);
        if (autoOpenResultPanel) {
            useLayoutStore.getState().setShowResultPanel(true);
        }

        if (payload.tabID.includes('::explain:') && autoOpenResultPanel) {
            useLayoutStore.getState().setBottomPanelView('panel');
            useLayoutStore
                .getState()
                .setActiveBottomPanelId(
                    payload.tabID.includes('::explain:analyze')
                        ? 'explain-analyze'
                        : 'explain-plan',
                );
        } else if (autoOpenResultPanel) {
            useLayoutStore.getState().setBottomPanelView('result');
        }
        useStatusStore.getState().setQueryRuntime('running');

        const executedText = payload.statementText || payload.query;
        if (executedText) {
            useResultStore.getState().setLastExecutedQuery(payload.tabID, executedText);
        }

        // Derive a stable, human-readable label for multi-statement runs.
        if (payload.statementText && payload.statementCount > 1) {
            const normalized = payload.statementText
                .replace(/\s+/g, ' ')
                .replace(/;+\s*$/, '')
                .trim();
            const statementNo = payload.statementIndex + 1;
            const preview =
                normalized.length > 56 ? `${normalized.slice(0, 56).trimEnd()}...` : normalized;
            const label = `#${statementNo} ${preview || `Statement ${statementNo}`}`;
            useResultStore.getState().setStatementLabel(payload.tabID, label);
        }
    };

    const applyQueryDoneSideEffects = (payload: QueryDonePayload) => {
        const isPaginationError = Boolean(
            payload.error && payload.error.toLowerCase().startsWith('fetch more:'),
        );
        if (
            payload.statementCount <= 1 ||
            payload.statementIndex === payload.statementCount - 1 ||
            Boolean(payload.error)
        ) {
            useEditorStore.getState().setTabRunning(payload.sourceTabID, false);
        }
        useResultStore
            .getState()
            .setDone(
                payload.tabID,
                payload.affected,
                payload.duration,
                payload.isSelect,
                payload.hasMore,
                isPaginationError ? undefined : payload.error,
            );
        const failureCode = classifyQueryFailure(payload.error);
        useResultStore
            .getState()
            .setExecutionState(
                payload.tabID,
                isPaginationError || failureCode === 'none'
                    ? 'done'
                    : failureCode === 'cancelled'
                      ? 'cancelled'
                      : 'failed',
                isPaginationError ? 'none' : failureCode,
            );

        const tabResult = useResultStore.getState().results[payload.tabID];
        const firstRowLatencyMs = tabResult?.progress.firstRowAt
            ? tabResult.progress.firstRowAt - tabResult.progress.startedAt
            : null;
        useStatusStore
            .getState()
            .setQueryRuntime(
                isPaginationError || failureCode === 'none'
                    ? 'done'
                    : failureCode === 'cancelled'
                      ? 'cancelled'
                      : 'failed',
                isPaginationError ? 'none' : failureCode,
                firstRowLatencyMs,
            );

        const currentResults = useResultStore.getState().results;
        const rowCount = payload.isSelect
            ? (currentResults[payload.tabID]?.rows.length ?? payload.affected)
            : payload.affected;
        useStatusStore.getState().setQueryStats(Number(rowCount), payload.duration);
    };

    const flushStatements = () => {
        for (const [, snapshot] of statementBuffers.entries()) {
            if (snapshot.started) {
                applyQueryStartedSideEffects(snapshot.started);
            }
            if (snapshot.done) {
                applyQueryDoneSideEffects(snapshot.done);
            }
        }
        statementBuffers.clear();
        statementFlushHandle = null;
    };

    const scheduleStatementFlush = () => {
        if (statementFlushHandle !== null) return;
        statementFlushHandle = window.requestAnimationFrame(flushStatements);
    };

    const subs = [
        onQueryStarted(payload => {
            if (payload.statementIndex === 0) {
                clearGeneratedResults(payload.sourceTabID);
                useResultStore.getState().clearMessages(payload.sourceTabID);
                useResultStore.getState().clearTransactionTotals(payload.sourceTabID);
            }

            // Keep the running flag synchronous and unthrottled: it gates the
            // Cancel button (EditorToolbar.tsx), and buffering it risked being
            // clobbered by a fast-arriving non-terminal "done" snapshot before
            // the next rAF flush, leaving Cancel permanently disabled.
            useEditorStore.getState().setTabRunning(payload.sourceTabID, true);

            recordTelemetryEvent('query.started', {
                tabId: payload.tabID,
                sourceTabId: payload.sourceTabID,
                statementIndex: payload.statementIndex,
                statementCount: payload.statementCount,
            });

            statementBuffers.set(payload.tabID, {
                ...statementBuffers.get(payload.tabID),
                started: payload,
            });
            scheduleStatementFlush();
        }),
        onQueryChunk(payload => {
            const current = chunkBuffers.get(payload.tabID);
            if (!current) {
                chunkBuffers.set(payload.tabID, {
                    columns: payload.columns,
                    rows: [...payload.rows],
                    tableName: payload.tableName,
                    primaryKeys: payload.primaryKeys,
                });
            } else {
                current.rows.push(...payload.rows);
                if (!current.columns && payload.columns?.length) current.columns = payload.columns;
                if (!current.tableName && payload.tableName) current.tableName = payload.tableName;
                if (!current.primaryKeys && payload.primaryKeys)
                    current.primaryKeys = payload.primaryKeys;
            }

            const pending = chunkBuffers.get(payload.tabID);
            if ((pending?.rows.length ?? 0) > 5000) {
                flushChunks();
            } else {
                scheduleFlush();
            }
        }),
        onQueryDone(payload => {
            if (chunkBuffers.has(payload.tabID)) {
                flushChunks();
            }
            const isPaginationError = Boolean(
                payload.error && payload.error.toLowerCase().startsWith('fetch more:'),
            );
            const failureCode = classifyQueryFailure(payload.error);
            const tabResult = useResultStore.getState().results[payload.tabID];
            const firstRowLatencyMs = tabResult?.progress.firstRowAt
                ? tabResult.progress.firstRowAt - tabResult.progress.startedAt
                : null;

            saveQuerySnapshot({
                tabId: payload.tabID,
                sourceTabId: payload.sourceTabID,
                startedAt: tabResult?.progress.startedAt ?? Date.now(),
                firstRowLatencyMs: firstRowLatencyMs ?? undefined,
                totalDurationMs: payload.duration,
                rowsReceived: tabResult?.progress.rowsReceived ?? 0,
                failureCode,
            });

            if (payload.error) {
                if (isPaginationError) {
                    notifyImportantError(toast.error, `Couldn't load more rows: ${payload.error}`, {
                        id: `fetch-more-${payload.tabID}`,
                        important: true,
                        source: 'system.query',
                        dedupeKey: `fetch-more:${payload.tabID}`,
                    });
                } else {
                    notifyImportantError(toast.error, `Query failed: ${payload.error}`, {
                        important: true,
                        source: 'system.query',
                        dedupeKey: `query-failed:${payload.tabID}`,
                    });
                }
            }

            const currentResults = useResultStore.getState().results;
            const rowCount = payload.isSelect
                ? (currentResults[payload.tabID]?.rows.length ?? payload.affected)
                : payload.affected;
            recordTelemetryEvent('query.done', {
                tabId: payload.tabID,
                sourceTabId: payload.sourceTabID,
                durationMs: payload.duration,
                rowCount,
                failureCode,
            });

            const isTerminal =
                payload.statementCount <= 1 ||
                payload.statementIndex === payload.statementCount - 1 ||
                Boolean(payload.error);

            statementBuffers.set(payload.tabID, {
                ...statementBuffers.get(payload.tabID),
                done: payload,
            });
            if (isTerminal) {
                // Guarantee the run's final state (setTabRunning(false), done/
                // failed/cancelled) applies immediately — never left stranded
                // waiting on a rAF that has no further statement to trigger it.
                flushStatements();
            } else {
                scheduleStatementFlush();
            }
        }),
        onQueryMessage(payload => {
            useResultStore.getState().appendMessage(payload.sourceTabID, payload.text);
        }),
        onQueryTransactionSummary(payload => {
            useResultStore.getState().setTransactionTotals(payload.sourceTabID, {
                insertedRows: payload.insertedRows,
                updatedRows: payload.updatedRows,
                deletedRows: payload.deletedRows,
                statementCount: payload.statementCount,
                query: payload.query,
            });
        }),
        onQueryCount(payload => {
            useResultStore.getState().setTotalCount(payload.tabID, payload.count);
        }),
        onQueryRange(payload => {
            if (payload.error) {
                appLogger.warn('query:range error', {
                    tabID: payload.tabID,
                    error: payload.error,
                });
                return;
            }
            if (payload.rows.length > 0) {
                useResultStore.getState().prependRows(payload.tabID, payload.offset, payload.rows);
            }
        }),
    ];

    const cleanup: Unsubscribe = () => {
        if (flushHandle !== null) {
            window.cancelAnimationFrame(flushHandle);
        }
        if (statementFlushHandle !== null) {
            window.cancelAnimationFrame(statementFlushHandle);
        }
        statementBuffers.clear();
    };

    return [...subs, cleanup];
}
