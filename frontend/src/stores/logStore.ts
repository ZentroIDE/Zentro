// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { RealtimeLogKind, LogLevel } from '../lib/enums';

export { RealtimeLogKind, LogLevel };

export interface RealtimeLogEvent {
    id: string;
    ts: number;
    level: LogLevel;
    kind: RealtimeLogKind;
    message: string;
    payload?: unknown;
}

const MAX_EVENTS = 1000;

interface LogStore {
    events: RealtimeLogEvent[];
    paused: boolean;
    unreadErrorCount: number;
    appendEvent: (e: RealtimeLogEvent) => void;
    clearEvents: () => void;
    setPaused: (v: boolean) => void;
    markRead: () => void;
}

export const useLogStore = create<LogStore>(set => ({
    events: [],
    paused: false,
    unreadErrorCount: 0,
    appendEvent: e =>
        set(state => {
            if (state.paused) return state;
            const next =
                state.events.length >= MAX_EVENTS
                    ? [...state.events.slice(state.events.length - MAX_EVENTS + 1), e]
                    : [...state.events, e];
            return {
                events: next,
                unreadErrorCount:
                    e.level === LogLevel.ERROR
                        ? state.unreadErrorCount + 1
                        : state.unreadErrorCount,
            };
        }),
    clearEvents: () => set({ events: [], unreadErrorCount: 0 }),
    setPaused: v => set({ paused: v }),
    markRead: () => set({ unreadErrorCount: 0 }),
}));
