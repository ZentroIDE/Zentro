// SPDX-License-Identifier: GPL-3.0-only

import { onStatsSample } from '../../../lib/events';
import { useLiveStatsStore } from '../../../stores/liveStatsStore';
import type { Unsubscribe } from './shared';

// Live status-bar readings (latency, traffic, CPU/memory) — see stats_service.go.
export function subscribeStatsEvents(): Unsubscribe[] {
    return [
        onStatsSample(sample => {
            useLiveStatsStore.getState().setSample(sample);
        }),
    ];
}
