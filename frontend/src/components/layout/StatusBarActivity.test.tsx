// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StatusBarActivity } from './StatusBarActivity';
import { useActivityStore } from '../../stores/activityStore';
import type { Job } from '../../platform/app-api/contracts/job';
import * as shortcutRegistry from '../../lib/shortcutRegistry';

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

describe('StatusBarActivity', () => {
    beforeEach(() => {
        useActivityStore.getState().reset();
    });

    afterEach(() => {
        useActivityStore.getState().reset();
        vi.restoreAllMocks();
    });

    it('renders nothing when no job is running', () => {
        const { container } = render(<StatusBarActivity />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows a running job without warning about an uncached selector snapshot', () => {
        // Regression test: selectRunningJobs derives a new array on every
        // call, so without useShallow in StatusBarActivity, React warns
        // "The result of getSnapshot should be cached" and can spiral into
        // "Maximum update depth exceeded" — both log via console.error.
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        useActivityStore.getState().hydrate([makeJob()]);

        render(<StatusBarActivity />);

        expect(screen.getByText(/1 running/)).toBeInTheDocument();
        const getSnapshotWarnings = errorSpy.mock.calls.filter(call =>
            String(call[0]).includes('getSnapshot should be cached'),
        );
        const maxDepthErrors = errorSpy.mock.calls.filter(call =>
            String(call[0]).includes('Maximum update depth exceeded'),
        );
        expect(getSnapshotWarnings).toHaveLength(0);
        expect(maxDepthErrors).toHaveLength(0);
    });

    it('updates the headline as jobs are upserted, still with no warnings', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        useActivityStore.getState().hydrate([makeJob({ id: 'job-1' })]);

        render(<StatusBarActivity />);
        expect(screen.getByText(/1 running/)).toBeInTheDocument();

        act(() => {
            useActivityStore
                .getState()
                .upsertJob(makeJob({ id: 'job-2', title: 'Import orders.csv' }));
        });
        expect(screen.getByText(/2 running/)).toBeInTheDocument();

        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('getSnapshot should be cached'),
        );
    });

    it('shows the most recently started job as the headline, not the oldest', () => {
        useActivityStore
            .getState()
            .hydrate([
                makeJob({ id: 'job-1', title: 'SELECT * FROM orders' }),
                makeJob({ id: 'job-2', title: 'Import orders.csv' }),
            ]);

        render(<StatusBarActivity />);

        expect(screen.getByText('2 running · Import orders.csv')).toBeInTheDocument();
    });

    it("renders a determinate progress bar for the headline job's known percent", () => {
        useActivityStore.getState().hydrate([
            makeJob({
                title: 'Export → query_result.csv',
                progress: { done: 1_234_481, total: 12_827_163 },
            }),
        ]);

        render(<StatusBarActivity />);

        const trigger = screen.getByRole('button', { name: /Open Activity panel/ });
        const bar = within(trigger).getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '10');
    });

    it('renders an indeterminate progress bar while the headline job has no known total', () => {
        useActivityStore
            .getState()
            .hydrate([makeJob({ title: 'Export → query_result.csv', progress: { done: 400 } })]);

        render(<StatusBarActivity />);

        const trigger = screen.getByRole('button', { name: /Open Activity panel/ });
        const bar = within(trigger).getByRole('progressbar');
        expect(bar).not.toHaveAttribute('aria-valuenow');
    });

    it('opens the Activity panel on click', () => {
        const action = vi.fn();
        vi.spyOn(shortcutRegistry, 'getCommandById').mockReturnValue({
            action,
        } as unknown as ReturnType<typeof shortcutRegistry.getCommandById>);
        useActivityStore.getState().hydrate([makeJob()]);

        render(<StatusBarActivity />);
        fireEvent.click(screen.getByRole('button', { name: /Open Activity panel/ }));

        expect(action).toHaveBeenCalledTimes(1);
    });

    it('lists every running job with its own percent in the hover card, latest first', async () => {
        useActivityStore.getState().hydrate([
            makeJob({
                id: 'job-1',
                title: 'SELECT * FROM orders',
                progress: { done: 50, total: 100 },
            }),
            makeJob({
                id: 'job-2',
                title: 'Import orders.csv',
                progress: { done: 1, total: 4 },
            }),
        ]);

        render(<StatusBarActivity />);
        fireEvent.pointerEnter(screen.getByRole('button', { name: /Open Activity panel/ }));

        const card = await screen.findByText('2 jobs running');
        const cardContainer = card.parentElement as HTMLElement;
        const rows = within(cardContainer).getAllByTitle(
            /SELECT \* FROM orders|Import orders\.csv/,
        );
        // Latest (job-2) listed first.
        expect(rows[0]).toHaveTextContent('Import orders.csv');
        expect(rows[1]).toHaveTextContent('SELECT * FROM orders');
        expect(within(cardContainer).getByText('25%')).toBeInTheDocument();
        expect(within(cardContainer).getByText('50%')).toBeInTheDocument();
    });
});
