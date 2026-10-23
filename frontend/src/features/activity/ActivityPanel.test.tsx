// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActivityPanel } from './ActivityPanel';
import { useActivityStore } from '../../stores/activityStore';
import { ToastProvider } from '../../components/layout/Toast';
import type { Job } from '../../platform/app-api/contracts/job';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';

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

function renderPanel() {
    return render(
        <ToastProvider>
            <ActivityPanel />
        </ToastProvider>,
    );
}

describe('ActivityPanel', () => {
    afterEach(() => {
        useActivityStore.getState().reset();
        resetApiGateway();
    });

    it('shows the most recently started job at the top of the list', () => {
        useActivityStore
            .getState()
            .hydrate([
                makeJob({ id: 'job-1', title: 'SELECT * FROM orders' }),
                makeJob({ id: 'job-2', title: 'Import orders.csv' }),
                makeJob({ id: 'job-3', title: 'Export → query_result.csv' }),
            ]);

        renderPanel();

        const titles = screen
            .getAllByTitle(/SELECT \* FROM orders|Import orders\.csv|Export → query_result\.csv/)
            .map(el => el.textContent);

        expect(titles).toEqual([
            'Export → query_result.csv',
            'Import orders.csv',
            'SELECT * FROM orders',
        ]);
    });

    it('shows a disabled, destructive Clear finished icon when nothing is finished', () => {
        useActivityStore.getState().hydrate([makeJob({ status: 'running' })]);
        renderPanel();

        const clearBtn = screen.getByRole('button', { name: 'Clear finished jobs' });
        expect(clearBtn).toBeDisabled();
    });

    it('enables Clear finished once a job has reached a terminal status', () => {
        useActivityStore.getState().hydrate([makeJob({ status: 'succeeded' })]);
        renderPanel();

        expect(screen.getByRole('button', { name: 'Clear finished jobs' })).not.toBeDisabled();
    });

    it('swaps the Jobs toolbar for the Sessions toolbar when the Sessions tab is active', async () => {
        const list = vi.fn(async () => ({ ok: true as const, data: [] }));
        setApiGateway({
            serverSession: { list, cancel: vi.fn(), kill: vi.fn() },
        } as unknown as ApiGateway);
        renderPanel();

        expect(screen.getByRole('button', { name: 'Clear finished jobs' })).toBeInTheDocument();

        // Radix's Tabs trigger activates on mousedown, not click.
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sessions' }));

        expect(await screen.findByRole('button', { name: 'Refresh sessions' })).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Clear finished jobs' }),
        ).not.toBeInTheDocument();
    });
});
