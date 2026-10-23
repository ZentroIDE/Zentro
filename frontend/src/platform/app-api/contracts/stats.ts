// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';

/** Mirrors internal/app/stats_service.go's latency states. */
export type LatencyState = 'ok' | 'busy' | 'error' | 'none';

/** Mirrors internal/app/stats_service.go's StatsSample — one live status-bar
 *  reading, delivered by the stats:sample event while sampling is on. */
export interface StatsSample {
    /** Sample time, unix milliseconds. */
    at: number;
    /** Database round trip in ms; null unless latencyState is 'ok'. */
    latencyMs: number | null;
    latencyState: LatencyState;
    /** Zentro's own database traffic, not the whole machine's. */
    rxBytesPerSec: number;
    txBytesPerSec: number;
    /** Share of the whole machine's CPU capacity, 0-100. */
    cpuPercent: number;
    memBytes: number;
}

export interface StatsAdapter {
    /** Starts (or restarts) the backend sampler; samples arrive as events. */
    start(intervalMs: number): Promise<KernelResult<void>>;
    /** Stops the sampler so nothing runs while the stats are hidden. */
    stop(): Promise<KernelResult<void>>;
}
