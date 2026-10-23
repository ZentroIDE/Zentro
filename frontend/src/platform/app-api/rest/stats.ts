// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { StatsAdapter } from '../contracts/stats';
import { wailsGateway } from '../wailsGateway';

// The sampler measures this machine (database round trip from here, Zentro's
// own traffic and CPU/memory), so even in team/enterprise mode it is always
// the local backend's - there is nothing to proxy to the server.
export function createStatsRestAdapter(): StatsAdapter {
    return withKernelResult('stats', {
        start: wailsGateway.StartStatsSampler,
        stop: wailsGateway.StopStatsSampler,
    });
}
