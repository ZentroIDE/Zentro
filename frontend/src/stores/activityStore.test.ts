// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import {
    isJobRunning,
    selectJobCount,
    selectJobList,
    selectRunningJobCount,
    selectRunningJobs,
    useActivityStore,
} from './activityStore';
import type { Job } from '../platform/app-api/contracts/job';

function makeJob(overrides: Partial<Job>): Job {
    return {
        id: 'job-1',
        kind: 'query',
        title: 'SELECT 1',
        status: 'running',
        progress: { done: 0 },
        startedAt: '2026-01-01T00:00:00Z',
        capabilities: { cancel: true, kill: false },
        ...overrides,
    };
}

describe('activityStore', () => {
    beforeEach(() => {
        useActivityStore.getState().reset();
    });

    it('hydrates the whole list, preserving order', () => {
        const jobs = [makeJob({ id: 'a' }), makeJob({ id: 'b' }), makeJob({ id: 'c' })];
        useActivityStore.getState().hydrate(jobs);

        const state = useActivityStore.getState();
        expect(state.order).toEqual(['a', 'b', 'c']);
        expect(selectJobList(state).map(j => j.id)).toEqual(['a', 'b', 'c']);
    });

    it('upsertJob appends a new job to the end of order', () => {
        useActivityStore.getState().upsertJob(makeJob({ id: 'a' }));
        useActivityStore.getState().upsertJob(makeJob({ id: 'b' }));

        expect(useActivityStore.getState().order).toEqual(['a', 'b']);
    });

    it('upsertJob updates an existing job in place without reordering', () => {
        useActivityStore.getState().upsertJob(makeJob({ id: 'a', status: 'running' }));
        useActivityStore.getState().upsertJob(makeJob({ id: 'b', status: 'running' }));
        useActivityStore
            .getState()
            .upsertJob(makeJob({ id: 'a', status: 'succeeded', progress: { done: 100 } }));

        const state = useActivityStore.getState();
        expect(state.order).toEqual(['a', 'b']);
        expect(state.jobs['a'].status).toBe('succeeded');
        expect(state.jobs['a'].progress.done).toBe(100);
    });

    it('removeJob drops one job from both the map and order', () => {
        useActivityStore.getState().hydrate([makeJob({ id: 'a' }), makeJob({ id: 'b' })]);
        useActivityStore.getState().removeJob('a');

        const state = useActivityStore.getState();
        expect(state.order).toEqual(['b']);
        expect(state.jobs['a']).toBeUndefined();
    });

    it('removeJob is a no-op for an unknown id', () => {
        useActivityStore.getState().hydrate([makeJob({ id: 'a' })]);
        useActivityStore.getState().removeJob('does-not-exist');

        expect(useActivityStore.getState().order).toEqual(['a']);
    });

    it('removeJobs drops several jobs at once (ClearFinishedJobs)', () => {
        useActivityStore
            .getState()
            .hydrate([makeJob({ id: 'a' }), makeJob({ id: 'b' }), makeJob({ id: 'c' })]);
        useActivityStore.getState().removeJobs(['a', 'c']);

        const state = useActivityStore.getState();
        expect(state.order).toEqual(['b']);
        expect(Object.keys(state.jobs)).toEqual(['b']);
    });

    it('isJobRunning treats queued/running/cancelling as running', () => {
        expect(isJobRunning(makeJob({ status: 'queued' }))).toBe(true);
        expect(isJobRunning(makeJob({ status: 'running' }))).toBe(true);
        expect(isJobRunning(makeJob({ status: 'cancelling' }))).toBe(true);
        expect(isJobRunning(makeJob({ status: 'succeeded' }))).toBe(false);
        expect(isJobRunning(makeJob({ status: 'failed' }))).toBe(false);
        expect(isJobRunning(makeJob({ status: 'cancelled' }))).toBe(false);
    });

    it('selectRunningJobs/selectRunningJobCount only count non-terminal jobs', () => {
        useActivityStore
            .getState()
            .hydrate([
                makeJob({ id: 'a', status: 'running' }),
                makeJob({ id: 'b', status: 'succeeded' }),
                makeJob({ id: 'c', status: 'cancelling' }),
                makeJob({ id: 'd', status: 'failed' }),
            ]);

        const state = useActivityStore.getState();
        expect(selectRunningJobCount(state)).toBe(2);
        expect(selectRunningJobs(state).map(j => j.id)).toEqual(['a', 'c']);
    });

    it('hides internal (Zentro-generated) jobs from every selector', () => {
        useActivityStore.getState().hydrate([
            makeJob({ id: 'a', title: 'SELECT * FROM orders', status: 'running' }),
            makeJob({
                id: 'b',
                title: 'SELECT 1 /* zentro:schema-rev:0 */',
                status: 'running',
            }),
            makeJob({
                id: 'c',
                title: 'SELECT 1 -- zentro:something',
                status: 'succeeded',
            }),
        ]);

        const state = useActivityStore.getState();
        expect(selectJobList(state).map(j => j.id)).toEqual(['a']);
        expect(selectRunningJobs(state).map(j => j.id)).toEqual(['a']);
        expect(selectRunningJobCount(state)).toBe(1);
        expect(selectJobCount(state)).toBe(1);
    });

    it('reset clears everything', () => {
        useActivityStore.getState().hydrate([makeJob({ id: 'a' })]);
        useActivityStore.getState().reset();

        const state = useActivityStore.getState();
        expect(state.order).toEqual([]);
        expect(Object.keys(state.jobs)).toEqual([]);
    });
});
