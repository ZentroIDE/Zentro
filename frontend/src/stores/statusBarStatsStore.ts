// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEY } from '../lib/constants';

/** How often the backend samples, in ms. */
export const STATS_INTERVAL_OPTIONS = [1000, 2000, 5000] as const;
export type StatsIntervalMs = (typeof STATS_INTERVAL_OPTIONS)[number];

interface StatusBarStatsState {
    /** Master switch: off means the backend sampler does not run at all. */
    enabled: boolean;
    showLatency: boolean;
    showNetwork: boolean;
    showResources: boolean;
    intervalMs: StatsIntervalMs;

    setEnabled: (enabled: boolean) => void;
    setShowLatency: (show: boolean) => void;
    setShowNetwork: (show: boolean) => void;
    setShowResources: (show: boolean) => void;
    setIntervalMs: (intervalMs: StatsIntervalMs) => void;
}

/** True when at least one stat is visible, i.e. the sampler has a reason to run. */
export function isStatsSamplingWanted(
    s: Pick<StatusBarStatsState, 'enabled' | 'showLatency' | 'showNetwork' | 'showResources'>,
): boolean {
    return s.enabled && (s.showLatency || s.showNetwork || s.showResources);
}

export const useStatusBarStatsStore = create<StatusBarStatsState>()(
    persist(
        set => ({
            enabled: true,
            showLatency: true,
            showNetwork: true,
            showResources: true,
            intervalMs: 2000 as StatsIntervalMs,

            setEnabled: enabled => set({ enabled }),
            setShowLatency: showLatency => set({ showLatency }),
            setShowNetwork: showNetwork => set({ showNetwork }),
            setShowResources: showResources => set({ showResources }),
            setIntervalMs: intervalMs => set({ intervalMs }),
        }),
        {
            name: STORAGE_KEY.STATUS_BAR_STATS,
            partialize: state => ({
                enabled: state.enabled,
                showLatency: state.showLatency,
                showNetwork: state.showNetwork,
                showResources: state.showResources,
                intervalMs: state.intervalMs,
            }),
        },
    ),
);
