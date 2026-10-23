// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { useActivityStore } from '../../stores/activityStore';

/** Hydrates activityStore from the backend once on startup (ListJobs).
 *  After that, job:updated/job:removed keep it in sync — see
 *  eventBridge/jobEvents.ts. */
export function useJobHydration(): void {
    useEffect(() => {
        let cancelled = false;
        getApiGateway()
            .job.list()
            .then(result => {
                if (cancelled || !result.ok) return;
                useActivityStore.getState().hydrate(result.data);
            });
        return () => {
            cancelled = true;
        };
    }, []);
}
