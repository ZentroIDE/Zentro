// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';

/** Mirrors internal/app/job_service.go's JobKind. */
export type JobKind = 'query' | 'export' | 'import';

/** Mirrors internal/app/job_service.go's JobStatus. */
export type JobStatus = 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';

/** Mirrors internal/app/job_service.go's JobProgress. total is omitted (or
 *  0) when unknown — render an indeterminate bar in that case. */
export interface JobProgress {
    done: number;
    total?: number;
    unit?: string;
    detail?: string;
}

/** Mirrors internal/app/job_service.go's JobCapabilities. kill is always
 *  false until a later milestone wires server-side terminate. */
export interface JobCapabilities {
    cancel: boolean;
    kill: boolean;
}

/** Mirrors internal/app/job_service.go's Job — one tracked long-running
 *  operation (query, export, import, ...) shown in the Activity panel. */
export interface Job {
    id: string;
    kind: JobKind;
    title: string;
    profileName?: string;
    database?: string;
    tabId?: string;
    status: JobStatus;
    progress: JobProgress;
    startedAt: string;
    finishedAt?: string;
    error?: string;
    capabilities: JobCapabilities;
    backendId?: string;
    meta?: Record<string, string>;
}

export interface JobAdapter {
    list(): Promise<KernelResult<Job[]>>;
    cancel(id: string): Promise<KernelResult<void>>;
    /** Force-kills a job that supports it (capabilities.kill) — for a
     *  query job this terminates the whole backend session on the server,
     *  not just the currently running statement. */
    kill(id: string): Promise<KernelResult<void>>;
    clearFinished(): Promise<KernelResult<string[]>>;
}
