// SPDX-License-Identifier: GPL-3.0-only

import type { StateStorage } from 'zustand/middleware';

export interface ThrottledStorageOptions {
    /**
     * Coalescing window. Writes that arrive while a window is open are folded
     * into the single flush that closes it. This bounds writes to at most one
     * per window, however fast the caller pushes values in.
     */
    intervalMs?: number;
}

export interface ThrottledStateStorage extends StateStorage {
    /** Apply the pending value to the base storage now, if any. */
    flush: () => void;
    /** Cancel any scheduled flush. Pending data is dropped, not written. */
    dispose: () => void;
}

const DEFAULT_INTERVAL_MS = 500;

/**
 * Wraps a synchronous `StateStorage` (localStorage, via zustand's persist
 * middleware) so that a burst of `set()` calls collapses into a bounded number
 * of actual writes.
 *
 * Why this exists: zustand's `persist` calls `storage.setItem` on EVERY
 * `set()`. For `editorStore` that means a full-session `JSON.stringify` plus a
 * synchronous `localStorage.setItem` on the main thread for every debounced
 * keystroke and for every `updateTabContext` an autosave performs after a save
 * — which is what made typing feel delayed. A window opened by the first
 * pending write stays open for `intervalMs` and is never extended by later
 * writes, so a sustained burst still persists once per window instead of
 * starving, and the latest value always wins. The pending value is flushed on
 * window unload so nothing is dropped at shutdown.
 */
export function createThrottledStorage(
    base: StateStorage,
    options: ThrottledStorageOptions = {},
): ThrottledStateStorage {
    const intervalMs = Math.max(0, options.intervalMs ?? DEFAULT_INTERVAL_MS);

    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    let pending: { name: string; value: string } | null = null;
    let disposed = false;

    const clearScheduled = () => {
        if (timerHandle !== null) {
            clearTimeout(timerHandle);
            timerHandle = null;
        }
    };

    const applyPending = () => {
        const next = pending;
        pending = null;
        clearScheduled();
        if (!next) return;
        // Errors propagate to the base storage's own handling; the editor
        // session storage already swallows quota overflow and falls back.
        base.setItem(next.name, next.value);
    };

    const flush = () => {
        if (!pending) {
            clearScheduled();
            return;
        }
        applyPending();
    };

    // A throttled write can still be pending when the window goes away; flush
    // it so the last window's session state is not silently dropped.
    const onBeforeUnload = () => flush();
    const canListen =
        typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (canListen) {
        window.addEventListener('beforeunload', onBeforeUnload);
    }

    return {
        getItem: name => base.getItem(name),
        removeItem: name => {
            pending = null;
            clearScheduled();
            base.removeItem(name);
        },
        setItem: (name, value) => {
            if (disposed) return;
            pending = { name, value };
            // A window is already open: keep its original deadline and let the
            // latest value replace the pending one. This is what makes the
            // write rate, rather than the update rate, bound persistence.
            if (timerHandle === null) {
                timerHandle = setTimeout(() => {
                    applyPending();
                }, intervalMs);
            }
        },
        flush,
        dispose: () => {
            disposed = true;
            pending = null;
            clearScheduled();
            if (canListen) {
                window.removeEventListener('beforeunload', onBeforeUnload);
            }
        },
    };
}
