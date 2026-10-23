// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { ToastProvider } from '../../components/layout/Toast';
import { useActivityStore } from '../../stores/activityStore';
import type { Job } from '../../platform/app-api/contracts/job';
import { useResultExport } from './useResultExport';

function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ToastProvider, null, children);
}

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: 'export-job-1',
        kind: 'export',
        title: 'Export',
        status: 'running',
        progress: { done: 0 },
        startedAt: new Date().toISOString(),
        capabilities: { cancel: true, kill: false },
        ...overrides,
    };
}

function installGateway() {
    const exportCSV = vi.fn(async () => ({ ok: true as const, data: 'export-job-1' }));
    const exportAllCSV = vi.fn(async () => ({ ok: true as const, data: 'export-job-1' }));
    const cancel = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const openFileInDefaultApp = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const openDirectoryInExplorer = vi.fn(async () => ({ ok: true as const, data: undefined }));
    setApiGateway({
        query: { exportCSV, exportAllCSV },
        job: { cancel },
        project: { openFileInDefaultApp, openDirectoryInExplorer },
    } as unknown as ApiGateway);
    return { exportCSV, exportAllCSV, cancel };
}

describe('useResultExport', () => {
    afterEach(() => {
        resetApiGateway();
        useActivityStore.getState().reset();
    });

    it('requires at least one selected column', () => {
        installGateway();
        const { result } = renderHook(
            () => useResultExport({ tabId: 'tab-1', result: { columns: [], rows: [] } }),
            { wrapper },
        );

        act(() => {
            result.current.runExport({ scope: 'view', format: 'csv', selectedColumns: [] });
        });

        expect(result.current.exportJob).toBeNull();
    });

    it('starts an in-view CSV export with the filtered columns/rows and tracks the returned job', async () => {
        const { exportCSV } = installGateway();
        const { result } = renderHook(
            () =>
                useResultExport({
                    tabId: 'tab-1',
                    result: { columns: ['id', 'name'], rows: [['1', 'Alice']] },
                }),
            { wrapper },
        );

        act(() => {
            result.current.runExport({ scope: 'view', format: 'csv', selectedColumns: ['name'] });
        });

        await waitFor(() => expect(exportCSV).toHaveBeenCalledWith(['name'], [['Alice']]));

        act(() => {
            useActivityStore.getState().upsertJob(makeJob({ status: 'running' }));
        });

        await waitFor(() => expect(result.current.exportJob?.status).toBe('running'));
    });

    it('does not create a trackable job when the user cancels the save dialog', async () => {
        const exportCSV = vi.fn(async () => ({ ok: true as const, data: '' }));
        setApiGateway({
            query: { exportCSV },
            job: { cancel: vi.fn() },
            project: {},
        } as unknown as ApiGateway);

        const { result } = renderHook(
            () =>
                useResultExport({
                    tabId: 'tab-1',
                    result: { columns: ['id'], rows: [['1']] },
                }),
            { wrapper },
        );

        act(() => {
            result.current.runExport({ scope: 'view', format: 'csv', selectedColumns: ['id'] });
        });

        await waitFor(() => expect(exportCSV).toHaveBeenCalled());
        expect(result.current.exportJob).toBeNull();
    });

    it('starts an "all rows" export via the all-rows gateway method', async () => {
        const { exportAllCSV } = installGateway();
        const { result } = renderHook(
            () => useResultExport({ tabId: 'tab-7', result: undefined }),
            { wrapper },
        );

        act(() => {
            result.current.runExport({ scope: 'all', format: 'csv', selectedColumns: ['id'] });
        });

        await waitFor(() => expect(exportAllCSV).toHaveBeenCalledWith('tab-7', ['id'], 0));
    });

    it('passes the known total from setKnownTotal to the all-rows gateway method', async () => {
        const { exportAllCSV } = installGateway();
        const { result } = renderHook(
            () => useResultExport({ tabId: 'tab-7', result: undefined }),
            { wrapper },
        );

        act(() => {
            result.current.setKnownTotal(12_827_163);
        });
        act(() => {
            result.current.runExport({ scope: 'all', format: 'csv', selectedColumns: ['id'] });
        });

        await waitFor(() => expect(exportAllCSV).toHaveBeenCalledWith('tab-7', ['id'], 12_827_163));
    });

    it('cancelExport cancels the tracked job while it is running', async () => {
        const { exportCSV, cancel } = installGateway();
        const { result } = renderHook(
            () =>
                useResultExport({
                    tabId: 'tab-1',
                    result: { columns: ['id'], rows: [['1']] },
                }),
            { wrapper },
        );

        act(() => {
            result.current.runExport({ scope: 'view', format: 'csv', selectedColumns: ['id'] });
        });
        await waitFor(() => expect(exportCSV).toHaveBeenCalled());

        act(() => {
            useActivityStore.getState().upsertJob(makeJob({ status: 'running' }));
        });
        await waitFor(() => expect(result.current.exportJob?.status).toBe('running'));

        act(() => {
            result.current.cancelExport();
        });

        await waitFor(() => expect(cancel).toHaveBeenCalledWith('export-job-1'));
    });

    it('maps job progress onto the ExportJobStatus shape ResultPanelStatusBar expects', async () => {
        const { exportCSV } = installGateway();
        const { result } = renderHook(
            () =>
                useResultExport({
                    tabId: 'tab-1',
                    result: { columns: ['id'], rows: [['1']] },
                }),
            { wrapper },
        );

        act(() => {
            result.current.runExport({ scope: 'view', format: 'csv', selectedColumns: ['id'] });
        });
        await waitFor(() => expect(exportCSV).toHaveBeenCalled());

        act(() => {
            useActivityStore
                .getState()
                .upsertJob(makeJob({ status: 'running', progress: { done: 25, total: 100 } }));
        });

        await waitFor(() => {
            expect(result.current.exportJob?.processedRows).toBe(25);
            expect(result.current.exportJob?.totalRows).toBe(100);
            expect(result.current.exportJob?.progressPct).toBe(25);
        });
    });
});
