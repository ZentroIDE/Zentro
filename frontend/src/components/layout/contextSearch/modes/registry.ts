// SPDX-License-Identifier: GPL-3.0-only

import type { SearchModeDescriptor } from './types';
import { schemaMode } from './schemaMode';
import { scriptMode } from './scriptMode';
import { commandMode } from './commandMode';
import { gitMode } from './gitMode';
import { envMode } from './envMode';
import { gotoLineMode } from './gotoLineMode';
import { helpMode } from './helpMode';
import { scopeMode } from './scopeMode';

/**
 * All registered Spotlight palette search modes. To add a mode, create a
 * descriptor module next to this file and list it here — the palette dialog,
 * '?' cheat-sheet, and '@' scope list pick it up automatically.
 */
export const SEARCH_MODES: SearchModeDescriptor[] = [
    scriptMode,
    commandMode,
    gitMode,
    envMode,
    gotoLineMode,
    helpMode,
    scopeMode,
    schemaMode,
];

const FALLBACK_MODE =
    SEARCH_MODES.find(mode => mode.prefix === null) ||
    (() => {
        throw new Error('Search-mode registry requires one fallback mode with prefix: null');
    })();

const PREFIXED_MODES = SEARCH_MODES.filter(
    (mode): mode is SearchModeDescriptor & { prefix: string } => mode.prefix !== null,
    // Longest prefix first so '@git'/'@env' win over bare '@'.
).sort((left, right) => right.prefix.length - left.prefix.length);

export interface ResolvedSearchMode {
    mode: SearchModeDescriptor;
    /** Query with the matched prefix stripped and leading whitespace trimmed. */
    effectiveQuery: string;
}

export function resolveSearchMode(query: string): ResolvedSearchMode {
    const matched = PREFIXED_MODES.find(mode =>
        query.toLowerCase().startsWith(mode.prefix.toLowerCase()),
    );
    if (matched) {
        return { mode: matched, effectiveQuery: query.slice(matched.prefix.length).trimStart() };
    }
    return { mode: FALLBACK_MODE, effectiveQuery: query };
}
