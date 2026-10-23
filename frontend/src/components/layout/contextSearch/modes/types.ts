// SPDX-License-Identifier: GPL-3.0-only

import type React from 'react';

export interface SearchModeResultsProps {
    /** Effective query with the mode prefix already stripped. */
    query: string;
    /** Close the palette; the mode decides when (usually after its action). */
    onClose: () => void;
    /** Replace the raw input text — used by help/scope modes to autocomplete a prefix. */
    onReplaceQuery?: (query: string) => void;
}

/**
 * Strategy contract for one Spotlight palette search mode. Register instances
 * in `registry.ts`; the palette dialog resolves the active mode from the
 * query's leading prefix and renders these parts — adding a mode never
 * requires touching the dialog.
 */
export interface SearchModeDescriptor {
    id: string;
    /** Leading token that activates the mode ('#', '>', '@git', ...); null = fallback mode. */
    prefix: string | null;
    /** Short human description, shown in the '?' cheat-sheet and '@' scope list. */
    description?: string;
    placeholder: string;
    /** Accessible dialog title (rendered sr-only). */
    dialogTitle: string;
    Results: React.ComponentType<SearchModeResultsProps>;
    /** Optional overlay rendered inside the input row (e.g. schema kind toggles). */
    InputAccessory?: React.ComponentType<{ onReplaceQuery: (query: string) => void }>;
}
