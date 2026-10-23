// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { DOM_EVENT, type ContextSearchIntent, type ProjectHubLaunchIntent } from './constants';

export type CommandPayloadMap = {
    [DOM_EVENT.OPEN_PROJECT_HUB]: ProjectHubLaunchIntent | undefined;
    /** Picks a folder and opens it as an existing Zentro project. */
    [DOM_EVENT.OPEN_PROJECT_FOLDER]: undefined;
    [DOM_EVENT.OPEN_CONTEXT_SEARCH]: ContextSearchIntent | undefined;
    [DOM_EVENT.OPEN_COMMAND_PALETTE]: undefined;
    [DOM_EVENT.OPEN_ENVIRONMENT_SWITCHER]: undefined;
    [DOM_EVENT.QUICK_SWITCH_ENVIRONMENT]: undefined;
    [DOM_EVENT.QUICK_SWITCH_PROJECT]: undefined;
    [DOM_EVENT.CLOSE_ACTIVE_TAB]: undefined;
    [DOM_EVENT.RUN_QUERY_ACTION]: { tabId: string };
    [DOM_EVENT.RUN_EXPLAIN_ACTION]: { tabId: string; analyze: boolean };
    [DOM_EVENT.FORMAT_QUERY_ACTION]: { tabId?: string } | undefined;
    [DOM_EVENT.EXPAND_WILDCARD_AND_RUN_ACTION]: { tabId: string };
    [DOM_EVENT.TOGGLE_BOOKMARK_ACTION]: { tabId?: string } | undefined;
    [DOM_EVENT.NEXT_BOOKMARK_ACTION]: { tabId?: string } | undefined;
    [DOM_EVENT.OPEN_SCHEMA_DIFF]: undefined;
    [DOM_EVENT.OPEN_TABLE_EXPORT]: { tableTabId: string };
    [DOM_EVENT.OPEN_RESULT_EXPORT]: { tabId: string };
    /** Opens the CSV import wizard, optionally prefilling the Target step
     *  from a table node's context menu (features/connection/explorer). */
    [DOM_EVENT.OPEN_DATA_IMPORT]: { schema?: string; table?: string } | undefined;
    [DOM_EVENT.RELOAD_RESULT]: { tabId: string };
    [DOM_EVENT.REFRESH_DATABASE_EXPLORER]: { silent?: boolean } | undefined;
    /** A contribution to the Source Control panel (e.g. a Pro schema-rollback
     *  restore) changed the repo; the panel should reload its commit history
     *  and status. */
    [DOM_EVENT.REFRESH_SOURCE_CONTROL]: undefined;
    [DOM_EVENT.JUMP_TO_LINE_ACTION]: { tabId: string; line: number };
    [DOM_EVENT.SAVE_TAB_ACTION]: string | undefined;
    [DOM_EVENT.RENAME_TAB]: string;
    [DOM_EVENT.FOCUS_ACTIVE_EDITOR]: undefined;
    [DOM_EVENT.OPEN_SETTINGS_SECTION]: { section: string };
    // Kept as `string` (not FocusZoneId) so lib/ doesn't import from
    // features/shortcuts/ — focusZoneRegistry.ts is the source of truth for
    // valid zone ids and no-ops a lookup miss.
    [DOM_EVENT.FOCUS_ZONE]: { zoneId: string };
};

export type CommandName = keyof CommandPayloadMap;

export function emitCommand<K extends CommandName>(name: K, payload?: CommandPayloadMap[K]): void {
    window.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

export function onCommand<K extends CommandName>(
    name: K,
    handler: (payload: CommandPayloadMap[K], event: CustomEvent<CommandPayloadMap[K]>) => void,
    options?: AddEventListenerOptions,
): () => void {
    const listener = (event: Event) => {
        const customEvent = event as CustomEvent<CommandPayloadMap[K]>;
        handler(customEvent.detail, customEvent);
    };

    window.addEventListener(name, listener, options);
    return () => window.removeEventListener(name, listener, options);
}

/**
 * Default scope-id extraction for useTabScopedCommand: reads a string
 * payload directly (e.g. SAVE_TAB_ACTION), or a `.tabId` field off an object
 * payload. Commands that scope by a differently-named field (e.g.
 * OPEN_TABLE_EXPORT's `.tableTabId`) must pass an explicit getScopeId.
 */
function defaultScopeId(detail: unknown): string | undefined {
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'tabId' in detail) {
        return (detail as { tabId?: string }).tabId;
    }
    return undefined;
}

/**
 * Subscribes to a command, only invoking handler when the command's scope id
 * matches tabId (or carries no scope id at all, which every existing command
 * treats as "broadcast to every tab"). Centralizes the tabId-match guard that
 * was previously re-implemented at each onCommand call site.
 */
export function useTabScopedCommand<K extends CommandName>(
    name: K,
    tabId: string,
    handler: (payload: CommandPayloadMap[K], event: CustomEvent<CommandPayloadMap[K]>) => void,
    options?: {
        getScopeId?: (payload: CommandPayloadMap[K]) => string | undefined;
    },
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const getScopeIdRef = useRef(options?.getScopeId);
    getScopeIdRef.current = options?.getScopeId;

    useEffect(() => {
        return onCommand(name, (payload, event) => {
            const scopeId = (getScopeIdRef.current ?? defaultScopeId)(payload);
            if (scopeId !== undefined && scopeId !== tabId) return;
            handlerRef.current(payload, event);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, tabId]);
}
