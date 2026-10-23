// SPDX-License-Identifier: GPL-3.0-only

import { onJobRemoved, onJobUpdated } from '../../../lib/events';
import { useActivityStore } from '../../../stores/activityStore';
import type { Unsubscribe } from './shared';

// Activity-panel job events (query/export/import) — see job_service.go.
export function subscribeJobEvents(): Unsubscribe[] {
    return [
        onJobUpdated(job => {
            useActivityStore.getState().upsertJob(job);
        }),
        onJobRemoved(({ id }) => {
            useActivityStore.getState().removeJob(id);
        }),
    ];
}
