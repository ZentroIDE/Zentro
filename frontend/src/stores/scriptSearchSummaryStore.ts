// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';

interface ScriptSearchSummary {
    matchCount: number;
    fileCount: number;
}

/**
 * Bridges the script search mode's results list (which computes the match
 * summary from fetched script content) to its input-row accessory bar
 * (which has no props to receive it through, same constraint the schema
 * mode's kind-toggle bar works around via contextSearchKindStore).
 */
interface ScriptSearchSummaryState {
    summary: ScriptSearchSummary | null;
    setSummary: (summary: ScriptSearchSummary | null) => void;
}

export const useScriptSearchSummaryStore = create<ScriptSearchSummaryState>(set => ({
    summary: null,
    setSummary: summary => set({ summary }),
}));
