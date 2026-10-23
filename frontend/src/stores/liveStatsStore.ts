// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import type { StatsSample } from '../platform/app-api/contracts/stats';

interface LiveStatsState {
    /** Latest reading from the backend sampler (stats:sample), or null before
     *  the first one arrives / after sampling stops. Source of truth is the
     *  backend; this only mirrors it. */
    sample: StatsSample | null;
    setSample: (sample: StatsSample) => void;
    clear: () => void;
}

export const useLiveStatsStore = create<LiveStatsState>(set => ({
    sample: null,
    setSample: sample => set({ sample }),
    clear: () => set({ sample: null }),
}));
