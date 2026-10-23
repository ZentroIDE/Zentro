// SPDX-License-Identifier: GPL-3.0-only

/**
 * eventBus.ts — Unified EventBus interface with Wails and DOM adapters.
 *
 * Usage guidance:
 * - Wails events: backend → frontend (connection changed, query progress, schema loaded)
 * - DOM events:   frontend → frontend (open dialog, command palette, cross-component)
 * - Zustand:      shared state (results, tabs, settings)
 *
 * Prefer Zustand actions over DOM events when both would work.
 */

// ── Interface ──────────────────────────────────────────────────────────────

export type EventHandler<T = unknown> = (payload: T) => void;
export type Unsubscribe = () => void;

export interface EventBus {
    emit(event: string, payload?: unknown): void;
    on(event: string, handler: EventHandler): Unsubscribe;
    off(event: string, handler?: EventHandler): void;
}

// ── Wails adapter ──────────────────────────────────────────────────────────

import { EventsOn, EventsEmit } from '../../wailsjs/runtime/runtime';

export const wailsEventBus: EventBus = {
    emit(event, payload) {
        EventsEmit(event, payload);
    },

    on(event, handler) {
        return EventsOn(event, handler);
    },

    off(_event, _handler?) {
        // Wails EventsOff removes ALL listeners for the given event name(s).
        // The _handler parameter is accepted for interface compatibility but
        // ignored — Wails does not support per-handler removal natively.
        // Use the unsubscribe returned by on() instead.
    },
};

// ── DOM CustomEvent adapter ────────────────────────────────────────────────

const domHandlerMap = new Map<EventHandler, EventListener>();

export const domEventBus: EventBus = {
    emit(event, payload) {
        window.dispatchEvent(new CustomEvent(event, { detail: payload }));
    },

    on(event, handler) {
        const listener = (e: Event) => {
            handler((e as CustomEvent).detail);
        };
        domHandlerMap.set(handler, listener);
        window.addEventListener(event, listener);
        return () => {
            window.removeEventListener(event, listener);
            domHandlerMap.delete(handler);
        };
    },

    off(event, handler) {
        if (handler) {
            const listener = domHandlerMap.get(handler);
            if (listener) {
                window.removeEventListener(event, listener);
                domHandlerMap.delete(handler);
            }
        }
    },
};
