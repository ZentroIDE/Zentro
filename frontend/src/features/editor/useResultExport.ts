// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { useToast } from '../../components/layout/Toast';
import { useStatusStore } from '../../stores/statusStore';
import type { ExportJobStatus } from '../../lib/resultStrategy';
import { ExportStatus } from '../../lib/resultStrategy';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { kernelErrorMessage, unwrapOrThrow } from '../../shared/kernel';
import type { KernelResult } from '../../shared/kernel';
import type { NotificationAction } from '../../stores/notificationStore';
import { useActivityStore } from '../../stores/activityStore';
import type { Job } from '../../platform/app-api/contracts/job';

interface UseResultExportOptions {
    tabId: string;
    result: { columns: string[]; rows: string[][]; tableName?: string } | undefined;
}

export type ExportScope = 'view' | 'all';
export type ExportFormat = 'csv' | 'json' | 'sql';

export interface RunExportOptions {
    scope: ExportScope;
    format: ExportFormat;
    selectedColumns: string[];
    tableName?: string;
}

function filterRowsBySelectedColumns(
    allColumns: string[],
    rows: string[][],
    selectedColumns: string[],
): { columns: string[]; rows: string[][] } {
    const selectedSet = new Set(selectedColumns);
    const selectedIndexes = allColumns
        .map((col, index) => ({ col, index }))
        .filter(item => selectedSet.has(item.col))
        .map(item => item.index);
    const columns = selectedIndexes.map(index => allColumns[index]);
    const filteredRows = rows.map(row => selectedIndexes.map(index => row[index] ?? ''));
    return { columns, rows: filteredRows };
}

const JOB_TO_EXPORT_STATUS: Record<Job['status'], ExportStatus> = {
    queued: ExportStatus.RUNNING,
    running: ExportStatus.RUNNING,
    cancelling: ExportStatus.RUNNING,
    succeeded: ExportStatus.DONE,
    failed: ExportStatus.FAILED,
    cancelled: ExportStatus.CANCELLED,
};

/** Maps a real Job (job_service.go) onto the ExportJobStatus shape
 *  ResultPanelStatusBar already renders — this is the only place that
 *  translation happens, so the status bar and the export modal never need
 *  to know a Job backs this instead of the old client-side fake progress
 *  loop. */
function toExportJobStatus(job: Job, label: string): ExportJobStatus {
    const startedAt = Date.parse(job.startedAt);
    const finishedAt = job.finishedAt ? Date.parse(job.finishedAt) : undefined;
    const total = job.progress.total && job.progress.total > 0 ? job.progress.total : undefined;
    return {
        id: job.id,
        label,
        status: JOB_TO_EXPORT_STATUS[job.status],
        startedAt: Number.isNaN(startedAt) ? Date.now() : startedAt,
        finishedAt: finishedAt !== undefined && !Number.isNaN(finishedAt) ? finishedAt : undefined,
        processedRows: job.progress.done || undefined,
        totalRows: total,
        progressPct: total
            ? Math.min(100, Math.round((job.progress.done / total) * 100))
            : undefined,
        error: job.error,
    };
}

export function useResultExport({ tabId, result }: UseResultExportOptions) {
    const { toast } = useToast();
    const [currentJobId, setCurrentJobId] = React.useState<string | null>(null);
    const [currentLabel, setCurrentLabel] = React.useState('');
    const job = useActivityStore(state =>
        currentJobId ? (state.jobs[currentJobId] as Job | undefined) : undefined,
    );
    const notifiedRef = React.useRef<Set<string>>(new Set());
    // Set by the caller (ResultPanel.tsx, once its own background COUNT(*)
    // lands) so an "export all rows" job can report real percentage
    // progress instead of just a row count — see export_service.go's
    // runExportAllRows knownTotal param. A ref rather than a hook argument
    // because it can arrive after this hook's already in use, and updating
    // it must never itself trigger a re-render.
    const knownTotalRef = React.useRef<number | undefined>(undefined);
    const setKnownTotal = React.useCallback((total: number | undefined) => {
        knownTotalRef.current = total;
    }, []);

    const notifyExport = React.useCallback(
        (path: string | undefined) => {
            if (!path) return;
            const actions: NotificationAction[] = [
                {
                    id: 'open-file',
                    label: 'Open file',
                    run: async () => {
                        try {
                            unwrapOrThrow(await getApiGateway().project.openFileInDefaultApp(path));
                        } catch (error) {
                            toast.error(`Could not open exported file: ${error}`);
                        }
                    },
                },
                {
                    id: 'show-in-folder',
                    label: 'Show in folder',
                    run: async () => {
                        try {
                            unwrapOrThrow(
                                await getApiGateway().project.openDirectoryInExplorer(path),
                            );
                        } catch (error) {
                            toast.error(`Could not open export folder: ${error}`);
                        }
                    },
                },
            ];
            toast.success(`Exported to: ${path}`, {
                actions,
                important: true,
                source: 'result.export',
                dedupeKey: `result-export:${path}`,
            });
            useStatusStore.getState().setMessage(`Exported to: ${path}`);
        },
        [toast],
    );

    const notifyExportError = React.useCallback(
        (message: string, label = 'Export') => {
            toast.error(`${label} failed: ${message}`);
            useStatusStore.getState().setMessage(`${label} failed: ${message}`);
        },
        [toast],
    );

    // Surfaces a toast exactly once per job, the moment activityStore sees
    // it reach a terminal status (job:updated — see eventBridge/jobEvents.ts).
    React.useEffect(() => {
        if (!job || notifiedRef.current.has(job.id)) return;
        if (job.status === 'succeeded') {
            notifiedRef.current.add(job.id);
            notifyExport(job.meta?.filePath);
        } else if (job.status === 'failed') {
            notifiedRef.current.add(job.id);
            notifyExportError(job.error || 'unknown error', currentLabel || 'Export');
        } else if (job.status === 'cancelled') {
            notifiedRef.current.add(job.id);
            toast.info(`${currentLabel || 'Export'} cancelled.`);
        }
    }, [job, currentLabel, notifyExport, notifyExportError, toast]);

    const startExport = React.useCallback(
        async (label: string, starter: () => Promise<KernelResult<string>>) => {
            const result = await starter();
            if (!result.ok) {
                notifyExportError(kernelErrorMessage(result.error), label);
                return;
            }
            if (!result.data) return; // user cancelled the save dialog — no job was created
            setCurrentLabel(label);
            setCurrentJobId(result.data);
        },
        [notifyExportError],
    );

    const cancelExport = React.useCallback(() => {
        if (!job || (job.status !== 'running' && job.status !== 'queued')) return;
        void getApiGateway().job.cancel(job.id);
    }, [job]);

    const runExport = React.useCallback(
        (options: RunExportOptions) => {
            const selectedColumns = options.selectedColumns || [];
            if (selectedColumns.length === 0) {
                toast.error('Select at least one column to export.');
                return;
            }

            const formatLabel =
                options.format === 'sql' ? 'SQL INSERT' : options.format.toUpperCase();
            const scopeLabel = options.scope === 'all' ? 'All (no paging)' : 'In View';
            const label = `${formatLabel} ${scopeLabel}`;

            if (options.scope === 'view') {
                if (!result?.columns || !result.rows) {
                    toast.error('No fetched rows available for in-view export.');
                    return;
                }
                const filtered = filterRowsBySelectedColumns(
                    result.columns,
                    result.rows,
                    selectedColumns,
                );

                if (options.format === 'csv') {
                    void startExport(label, () =>
                        getApiGateway().query.exportCSV(filtered.columns, filtered.rows),
                    );
                    return;
                }
                if (options.format === 'json') {
                    void startExport(label, () =>
                        getApiGateway().query.exportJSON(filtered.columns, filtered.rows),
                    );
                    return;
                }
                const tableName = options.tableName?.trim() || result.tableName || 'my_table';
                void startExport(label, () =>
                    getApiGateway().query.exportSQLInsert(
                        filtered.columns,
                        filtered.rows,
                        tableName,
                    ),
                );
                return;
            }

            const knownTotal = knownTotalRef.current ?? 0;
            if (options.format === 'csv') {
                void startExport(label, () =>
                    getApiGateway().query.exportAllCSV(tabId, selectedColumns, knownTotal),
                );
                return;
            }
            if (options.format === 'json') {
                void startExport(label, () =>
                    getApiGateway().query.exportAllJSON(tabId, selectedColumns, knownTotal),
                );
                return;
            }
            const tableName = options.tableName?.trim() || result?.tableName || 'my_table';
            void startExport(label, () =>
                getApiGateway().query.exportAllSQLInsert(
                    tabId,
                    tableName,
                    selectedColumns,
                    knownTotal,
                ),
            );
        },
        [result, startExport, tabId, toast],
    );

    const exportJob = job ? toExportJobStatus(job, currentLabel) : null;

    return {
        runExport,
        exportJob,
        cancelExport,
        setKnownTotal,
    };
}
