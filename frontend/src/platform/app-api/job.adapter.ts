// SPDX-License-Identifier: GPL-3.0-only

import { ListJobs, CancelJob, KillJob, ClearFinishedJobs } from '../../../wailsjs/go/app/App';
import type { app } from '../../../wailsjs/go/models';
import type { Job } from './contracts/job';

// wailsjs's generated app.Job (models.ts) is structurally identical to our
// Job contract, but typed loosely (kind/status: string, startedAt/
// finishedAt: any — Wails has no Go time.Time mapping) since it's generated
// straight from the Go struct. This narrows it to the contract's literal
// union types without re-validating field-by-field.
function mapJob(raw: app.Job): Job {
    return {
        id: raw.id,
        kind: raw.kind as Job['kind'],
        title: raw.title,
        profileName: raw.profileName,
        database: raw.database,
        tabId: raw.tabId,
        status: raw.status as Job['status'],
        progress: {
            done: raw.progress?.done ?? 0,
            total: raw.progress?.total,
            unit: raw.progress?.unit,
            detail: raw.progress?.detail,
        },
        // raw.startedAt/finishedAt are typed `any` in the generated
        // wailsjs model (Wails has no Go time.Time -> TS mapping) but are
        // RFC 3339 strings on the wire, same as every other timestamp
        // field elsewhere in this codebase's wailsjs models.
        startedAt: String(raw.startedAt),
        finishedAt: raw.finishedAt ? String(raw.finishedAt) : undefined,
        error: raw.error,
        capabilities: {
            cancel: raw.capabilities?.cancel ?? false,
            kill: raw.capabilities?.kill ?? false,
        },
        backendId: raw.backendId,
        meta: raw.meta,
    };
}

export const jobAdapter = {
    ListJobs: async () => (await ListJobs()).map(mapJob),
    CancelJob,
    KillJob,
    ClearFinishedJobs,
};
