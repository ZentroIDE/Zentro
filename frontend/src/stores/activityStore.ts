// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import type { Job } from '../platform/app-api/contracts/job';

const RUNNING_STATUSES: readonly Job['status'][] = ['queued', 'running', 'cancelling'];

function isRunning(job: Job): boolean {
    return RUNNING_STATUSES.includes(job.status);
}

// Mirrors utils.IsInternalSQL (internal/utils/internal_sql.go) — Zentro's
// own internal queries (schema-cache refresh, etc.) carry this marker. The
// backend already skips creating a Job for these (see beginQuerySession in
// query_batch.go), but a job already in the store from before that fix
// shipped, or any future code path that starts one without going through
// beginQuerySession, should still never surface in the Activity panel.
const INTERNAL_SQL_MARKERS = ['/* zentro:', '-- zentro:'];

function isInternalJob(job: Job): boolean {
    const title = job.title.toLowerCase();
    return INTERNAL_SQL_MARKERS.some(marker => title.includes(marker));
}

interface ActivityState {
    /** Every tracked job, keyed by id. Source of truth is the backend
     *  (job:updated/job:removed, see job_service.go); this store only
     *  mirrors it — never derive "isRunning" booleans elsewhere, read
     *  job.status instead. */
    jobs: Record<string, Job>;
    /** Insertion order, oldest first — matches JobService.List() so the
     *  Activity panel doesn't reorder jobs as they're updated. */
    order: string[];

    /** Replaces the whole job list, e.g. on startup hydration
     *  (ListJobs). */
    hydrate: (jobs: Job[]) => void;
    /** Upserts one job snapshot from a job:updated event. */
    upsertJob: (job: Job) => void;
    /** Drops a job, e.g. from a job:removed event or ClearFinishedJobs. */
    removeJob: (id: string) => void;
    removeJobs: (ids: string[]) => void;
    reset: () => void;
}

export const useActivityStore = create<ActivityState>(set => ({
    jobs: {},
    order: [],

    hydrate: jobs =>
        set({
            jobs: Object.fromEntries(jobs.map(job => [job.id, job])),
            order: jobs.map(job => job.id),
        }),

    upsertJob: job =>
        set(state => {
            const existed = job.id in state.jobs;
            return {
                jobs: { ...state.jobs, [job.id]: job },
                order: existed ? state.order : [...state.order, job.id],
            };
        }),

    removeJob: id =>
        set(state => {
            if (!(id in state.jobs)) return state;
            const jobs = { ...state.jobs };
            delete jobs[id];
            return { jobs, order: state.order.filter(existingId => existingId !== id) };
        }),

    removeJobs: ids =>
        set(state => {
            if (ids.length === 0) return state;
            const idSet = new Set(ids);
            const jobs = { ...state.jobs };
            for (const id of ids) delete jobs[id];
            return { jobs, order: state.order.filter(existingId => !idSet.has(existingId)) };
        }),

    reset: () => set({ jobs: {}, order: [] }),
}));

/** Every job, oldest first — the shape the Activity panel renders. Internal
 *  (Zentro-generated) jobs are never included — see isInternalJob. */
export function selectJobList(state: ActivityState): Job[] {
    return state.order
        .map(id => state.jobs[id])
        .filter((job): job is Job => job !== undefined && !isInternalJob(job));
}

/** Jobs still running/cancelling, oldest first. */
export function selectRunningJobs(state: ActivityState): Job[] {
    return selectJobList(state).filter(isRunning);
}

/** Count of running/cancelling jobs — drives the status bar indicator and
 *  the bottom-panel tab badge. */
export function selectRunningJobCount(state: ActivityState): number {
    let count = 0;
    for (const id of state.order) {
        const job = state.jobs[id];
        if (job && isRunning(job) && !isInternalJob(job)) count++;
    }
    return count;
}

/** Total tracked job count (running and finished) — a plain number, so
 *  unlike selectJobList it needs no useShallow to subscribe to safely. */
export function selectJobCount(state: ActivityState): number {
    let count = 0;
    for (const id of state.order) {
        const job = state.jobs[id];
        if (job && !isInternalJob(job)) count++;
    }
    return count;
}

export { isRunning as isJobRunning };
