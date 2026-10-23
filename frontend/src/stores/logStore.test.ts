// SPDX-License-Identifier: GPL-3.0-only

import { describe, beforeEach, expect, it } from 'vitest';
import { useLogStore, LogLevel, RealtimeLogKind } from './logStore';
import type { RealtimeLogEvent } from './logStore';

function makeEvent(overrides: Partial<RealtimeLogEvent> = {}): RealtimeLogEvent {
    return {
        id: 'test-1',
        ts: Date.now(),
        level: LogLevel.INFO,
        kind: RealtimeLogKind.QUERY_DONE,
        message: 'test message',
        ...overrides,
    };
}

describe('useLogStore', () => {
    beforeEach(() => {
        useLogStore.setState({ events: [], paused: false, unreadErrorCount: 0 });
    });

    it('appends events', () => {
        useLogStore.getState().appendEvent(makeEvent({ id: 'a' }));
        expect(useLogStore.getState().events).toHaveLength(1);
        expect(useLogStore.getState().events[0].id).toBe('a');
    });

    it('does not append when paused', () => {
        useLogStore.setState({ paused: true });
        useLogStore.getState().appendEvent(makeEvent({ id: 'b' }));
        expect(useLogStore.getState().events).toHaveLength(0);
    });

    it('increments unreadErrorCount for error events', () => {
        useLogStore.getState().appendEvent(makeEvent({ level: LogLevel.ERROR }));
        expect(useLogStore.getState().unreadErrorCount).toBe(1);
    });

    it('does not increment unreadErrorCount for non-error events', () => {
        useLogStore.getState().appendEvent(makeEvent({ level: LogLevel.INFO }));
        useLogStore.getState().appendEvent(makeEvent({ level: LogLevel.WARN }));
        expect(useLogStore.getState().unreadErrorCount).toBe(0);
    });

    it('clearEvents resets events and unreadErrorCount', () => {
        useLogStore.getState().appendEvent(makeEvent({ level: LogLevel.ERROR }));
        useLogStore.getState().clearEvents();
        expect(useLogStore.getState().events).toHaveLength(0);
        expect(useLogStore.getState().unreadErrorCount).toBe(0);
    });

    it('setPaused toggles paused state', () => {
        useLogStore.getState().setPaused(true);
        expect(useLogStore.getState().paused).toBe(true);
        useLogStore.getState().setPaused(false);
        expect(useLogStore.getState().paused).toBe(false);
    });

    it('markRead resets unreadErrorCount', () => {
        useLogStore.getState().appendEvent(makeEvent({ level: LogLevel.ERROR }));
        useLogStore.getState().markRead();
        expect(useLogStore.getState().unreadErrorCount).toBe(0);
    });

    it('caps events at 1000', () => {
        for (let i = 0; i < 1005; i++) {
            useLogStore.getState().appendEvent(makeEvent({ id: String(i) }));
        }
        expect(useLogStore.getState().events).toHaveLength(1000);
        expect(useLogStore.getState().events[999].id).toBe('1004');
    });
});
