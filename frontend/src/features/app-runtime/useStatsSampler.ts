// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { useLiveStatsStore } from '../../stores/liveStatsStore';
import { isStatsSamplingWanted, useStatusBarStatsStore } from '../../stores/statusBarStatsStore';

// Keeps the backend sampler in step with the status-bar settings: it only runs
// while at least one stat is visible, restarts when the interval changes, and
// is stopped (and its last reading dropped) as soon as stats are turned off.
export function useStatsSampler() {
    const wanted = useStatusBarStatsStore(isStatsSamplingWanted);
    const intervalMs = useStatusBarStatsStore(s => s.intervalMs);

    useEffect(() => {
        if (!wanted) {
            useLiveStatsStore.getState().clear();
            void getApiGateway().stats.stop();
            return;
        }
        void getApiGateway().stats.start(intervalMs);
        return () => {
            void getApiGateway().stats.stop();
        };
    }, [wanted, intervalMs]);
}
