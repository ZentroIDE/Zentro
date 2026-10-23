// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { ToastProvider } from '../../components/layout/Toast';
import type { Job } from '../../platform/app-api/contracts/job';
import { JobRow } from './JobRow';

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: 'job-1',
        kind: 'query',
        title: 'SELECT * FROM orders',
        status: 'running',
        progress: { done: 0 },
        startedAt: new Date().toISOString(),
        capabilities: { cancel: true, kill: false },
        ...overrides,
    };
}

function installGateway() {
    const cancel = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const kill = vi.fn(async () => ({ ok: true as const, data: undefined }));
    setApiGateway({
        job: { cancel, kill },
    } as unknown as ApiGateway);
    return { cancel, kill };
}

function renderJobRow(job: Job) {
    return render(
        <ToastProvider>
            <JobRow job={job} />
        </ToastProvider>,
    );
}

describe('JobRow', () => {
    afterEach(() => {
        resetApiGateway();
    });

    it('shows the percent next to the done/total row count', () => {
        installGateway();
        renderJobRow(
            makeJob({
                kind: 'export',
                status: 'running',
                title: 'Export → query_result.csv',
                progress: { done: 6_364_882, total: 12_827_163, unit: 'rows' },
            }),
        );

        expect(screen.getByText('6,364,882 / 12,827,163 rows (50%)')).toBeInTheDocument();
    });

    it('omits the percent when the total is not known yet', () => {
        installGateway();
        renderJobRow(
            makeJob({
                kind: 'export',
                status: 'running',
                progress: { done: 400, unit: 'rows' },
            }),
        );

        expect(screen.getByText('400 rows')).toBeInTheDocument();
    });

    it('shows Cancel for a running, cancellable job but swaps to an inline confirm first', async () => {
        const { cancel } = installGateway();
        renderJobRow(
            makeJob({
                kind: 'query',
                status: 'running',
                capabilities: { cancel: true, kill: false },
            }),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Cancel this query?')).toBeInTheDocument();
        expect(cancel).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Force kill' })).not.toBeInTheDocument();
    });

    it('calls job.cancel once the inline confirm is accepted, with a kind-specific label', async () => {
        const { cancel } = installGateway();
        renderJobRow(
            makeJob({
                id: 'job-3',
                kind: 'export',
                status: 'running',
                capabilities: { cancel: true, kill: false },
            }),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(
            await screen.findByText('Cancel this export? The partial file will be discarded.'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Yes, cancel'));

        await waitFor(() => expect(cancel).toHaveBeenCalledWith('job-3'));
    });

    it('dismisses the cancel inline confirm without calling job.cancel', async () => {
        const { cancel } = installGateway();
        renderJobRow(makeJob({ status: 'running', capabilities: { cancel: true, kill: false } }));

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(await screen.findByTitle('Keep running'));

        expect(cancel).not.toHaveBeenCalled();
        expect(screen.queryByText('Cancel this query?')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('hides Cancel once the job is no longer running', () => {
        installGateway();
        renderJobRow(makeJob({ status: 'succeeded', capabilities: { cancel: true, kill: false } }));

        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('shows Force kill only while cancelling and capable of being killed', () => {
        installGateway();
        const { rerender } = render(
            <ToastProvider>
                <JobRow
                    job={makeJob({ status: 'running', capabilities: { cancel: true, kill: true } })}
                />
            </ToastProvider>,
        );
        // Still running (soft cancel hasn't been requested yet) — no Force
        // kill button, even though this driver supports it.
        expect(screen.queryByRole('button', { name: 'Force kill' })).not.toBeInTheDocument();

        rerender(
            <ToastProvider>
                <JobRow
                    job={makeJob({
                        status: 'cancelling',
                        capabilities: { cancel: true, kill: true },
                    })}
                />
            </ToastProvider>,
        );
        expect(screen.getByRole('button', { name: 'Force kill' })).toBeInTheDocument();
    });

    it('never shows Force kill for a driver without BackendCanceller (capabilities.kill=false)', () => {
        installGateway();
        renderJobRow(
            makeJob({ status: 'cancelling', capabilities: { cancel: true, kill: false } }),
        );
        expect(screen.queryByRole('button', { name: 'Force kill' })).not.toBeInTheDocument();
    });

    it('swaps to an inline confirm instead of calling job.kill immediately', async () => {
        const { kill } = installGateway();
        renderJobRow(
            makeJob({
                id: 'job-2',
                status: 'cancelling',
                capabilities: { cancel: true, kill: true },
            }),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Force kill' }));

        expect(await screen.findByText('Force kill this job?')).toBeInTheDocument();
        expect(kill).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Force kill' })).not.toBeInTheDocument();
    });

    it('calls job.kill once the inline confirm is accepted', async () => {
        const { kill } = installGateway();
        renderJobRow(
            makeJob({
                id: 'job-2',
                status: 'cancelling',
                capabilities: { cancel: true, kill: true },
            }),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Force kill' }));
        fireEvent.click(await screen.findByTitle(/Yes, force kill/));

        await waitFor(() => expect(kill).toHaveBeenCalledWith('job-2'));
    });

    it('dismisses the inline confirm without calling job.kill when cancelled', async () => {
        const { kill } = installGateway();
        renderJobRow(
            makeJob({
                id: 'job-2',
                status: 'cancelling',
                capabilities: { cancel: true, kill: true },
            }),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Force kill' }));
        fireEvent.click(await screen.findByTitle('Cancel'));

        expect(kill).not.toHaveBeenCalled();
        expect(screen.queryByText('Force kill this job?')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Force kill' })).toBeInTheDocument();
    });

    it('does not repeat the status label as a caption when there is nothing else to say', () => {
        installGateway();
        renderJobRow(makeJob({ status: 'succeeded', progress: { done: 0 } }));

        // The status icon carries the label via aria-label/tooltip, not
        // visible text — the caption area must not also show a redundant
        // "Succeeded" underneath it.
        expect(screen.getByLabelText('Succeeded')).toBeInTheDocument();
        expect(screen.queryByText('Succeeded')).not.toBeInTheDocument();
    });

    it('still shows a caption when it carries real information (an error)', () => {
        installGateway();
        renderJobRow(makeJob({ status: 'failed', error: 'connection reset' }));

        expect(screen.getByLabelText('Failed')).toBeInTheDocument();
        expect(screen.getByText('connection reset')).toBeInTheDocument();
    });

    it('shows the status label in a tooltip over the status icon', async () => {
        installGateway();
        renderJobRow(makeJob({ status: 'running' }));

        fireEvent.focus(screen.getByLabelText('Running'));
        expect((await screen.findAllByText('Running')).length).toBeGreaterThan(0);
    });

    it('shows Started (and Finished, once set) in a tooltip over the elapsed time', async () => {
        installGateway();
        const { rerender } = render(
            <ToastProvider>
                <JobRow
                    job={makeJob({ status: 'running', startedAt: '2026-01-01T00:00:00.000Z' })}
                />
            </ToastProvider>,
        );

        fireEvent.focus(screen.getByText(/^\d+:\d{2}(:\d{2})?$/));
        expect((await screen.findAllByText(/Started/)).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Finished/)).not.toBeInTheDocument();

        rerender(
            <ToastProvider>
                <JobRow
                    job={makeJob({
                        status: 'succeeded',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        finishedAt: '2026-01-01T00:00:05.000Z',
                    })}
                />
            </ToastProvider>,
        );
        fireEvent.focus(screen.getByText('00:05'));
        expect((await screen.findAllByText(/Finished/)).length).toBeGreaterThan(0);
    });

    it('no longer renders an expandable details row (source tab / backend id removed)', () => {
        installGateway();
        renderJobRow(
            makeJob({
                status: 'succeeded',
                tabId: 'some-tab-id',
                backendId: '12345',
            }),
        );

        expect(screen.queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument();
        expect(screen.queryByText('Source tab')).not.toBeInTheDocument();
        expect(screen.queryByText('Backend id')).not.toBeInTheDocument();
        expect(screen.queryByText('some-tab-id')).not.toBeInTheDocument();
        expect(screen.queryByText('12345')).not.toBeInTheDocument();
    });
});
