// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';

/**
 * Focus Zone Registry — a tiny module-level map from a stable zone id (e.g.
 * "explorer", "editorToolbar") to the DOM element that should receive focus
 * when a shortcut targets that zone. Mirrors the lightweight
 * register/unregister-on-mount pattern already used by sidebarPanelRegistry,
 * but zones don't need ordering/snapshots/subscriptions — just a lookup.
 *
 * Zone-owning components call useFocusZone(zoneId, ref) once; the ref's
 * current element must also carry `data-zone="<id>"` (either by spreading
 * the hook's returned data attribute onto the element, or applying it
 * directly in JSX) so shortcutContext.ts can derive the matching `when`
 * boolean (e.g. `explorerFocus`) via `el.closest('[data-zone="explorer"]')`.
 */

export type FocusZoneId = 'explorer' | 'editorToolbar' | 'resultGrid' | 'tabStrip' | 'erd';

type FocusZoneRef = React.RefObject<HTMLElement | null>;

const STORE_KEY = '__zentroFocusZoneRegistry__';

function getRegistry(): Map<FocusZoneId, FocusZoneRef> {
    const host = globalThis as typeof globalThis & {
        [STORE_KEY]?: Map<FocusZoneId, FocusZoneRef>;
    };
    if (!host[STORE_KEY]) {
        host[STORE_KEY] = new Map();
    }
    return host[STORE_KEY];
}

export function registerFocusZone(zoneId: FocusZoneId, ref: FocusZoneRef): () => void {
    const registry = getRegistry();
    registry.set(zoneId, ref);
    return () => {
        if (registry.get(zoneId) === ref) {
            registry.delete(zoneId);
        }
    };
}

/** Focuses the zone's registered entry element, if the zone is currently mounted. */
export function focusZone(zoneId: FocusZoneId): boolean {
    const ref = getRegistry().get(zoneId);
    const el = ref?.current;
    if (!el) return false;
    el.focus();
    return true;
}

/**
 * Registers `entryRef`'s element as the focus target for `zoneId`. The
 * zone-owning component must also mark the DOM ancestor it wants matched by
 * `when` context with `data-zone={zoneId}` — usually the same element, or a
 * container around it.
 */
export function useFocusZone(zoneId: FocusZoneId, entryRef: FocusZoneRef): void {
    useEffect(() => {
        return registerFocusZone(zoneId, entryRef);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoneId]);
}
