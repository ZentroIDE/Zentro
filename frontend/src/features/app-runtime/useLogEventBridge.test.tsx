// SPDX-License-Identifier: GPL-3.0-only

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLogStore, type RealtimeLogEvent } from '../../stores/logStore';

// Capture each typed listener so tests can fire it manually.
const captured: Record<string, ((data: unknown) => void) | null> = {
    onQueryStarted: null,
    onQueryDone: null,
    onConnectionChanged: null,
    onSchemaLoaded: null,
    onSchemaError: null,
    onTransactionStatus: null,
};

const unsubs: Record<string, ReturnType<typeof vi.fn>> = {
    onQueryStarted: vi.fn(),
    onQueryDone: vi.fn(),
    onConnectionChanged: vi.fn(),
    onSchemaLoaded: vi.fn(),
    onSchemaError: vi.fn(),
    onTransactionStatus: vi.fn(),
};

vi.mock('../../lib/events', () => {
    const make = (key: keyof typeof captured) => (cb: (data: unknown) => void) => {
        captured[key] = cb;
        return unsubs[key];
    };
    return {
        onQueryStarted: make('onQueryStarted'),
        onQueryDone: make('onQueryDone'),
        onConnectionChanged: make('onConnectionChanged'),
        onSchemaLoaded: make('onSchemaLoaded'),
        onSchemaError: make('onSchemaError'),
        onTransactionStatus: make('onTransactionStatus'),
    };
});

import { useLogEventBridge } from './useLogEventBridge';

let appended: RealtimeLogEvent[] = [];

describe('useLogEventBridge', () => {
    beforeEach(() => {
        appended = [];
        Object.keys(captured).forEach(k => (captured[k] = null));
        Object.values(unsubs).forEach(fn => fn.mockClear());

        useLogStore.setState({
            events: [],
            appendEvent: (e: RealtimeLogEvent) => {
                appended.push(e);
            },
        } as any);
    });

    it('subscribes to all 6 typed events on mount', () => {
        renderHook(() => useLogEventBridge());
        for (const key of Object.keys(captured)) {
            expect(captured[key as keyof typeof captured]).toBeTypeOf('function');
        }
    });

    it('maps onQueryStarted into a level=info entry with statement counter', () => {
        renderHook(() => useLogEventBridge());
        captured.onQueryStarted!({
            tabID: 't1',
            sourceTabID: 't1',
            query: 'SELECT 1',
            statementText: 'SELECT 1',
            statementIndex: 0,
            statementCount: 2,
        });

        expect(appended).toHaveLength(1);
        expect(appended[0].kind).toBe('query.started');
        expect(appended[0].level).toBe('info');
        expect(appended[0].message).toContain('[1/2]');
        expect(appended[0].message).toContain('SELECT 1');
    });

    it('maps onQueryDone to level=error when payload.error is set', () => {
        renderHook(() => useLogEventBridge());
        captured.onQueryDone!({
            tabID: 't1',
            sourceTabID: 't1',
            affected: 0,
            duration: 12,
            isSelect: false,
            hasMore: false,
            error: 'permission denied',
            statementText: 'UPDATE x',
            statementIndex: 0,
            statementCount: 1,
        });

        expect(appended).toHaveLength(1);
        expect(appended[0].kind).toBe('query.done');
        expect(appended[0].level).toBe('error');
        expect(appended[0].message).toContain('permission denied');
    });

    it('maps onConnectionChanged with status=error to level=error', () => {
        renderHook(() => useLogEventBridge());
        captured.onConnectionChanged!({ status: 'error', profile: { name: 'prod' } });

        expect(appended).toHaveLength(1);
        expect(appended[0].kind).toBe('connection.changed');
        expect(appended[0].level).toBe('error');
        expect(appended[0].message).toContain('prod');
    });

    it('maps onSchemaError to level=error with dbName + error in message', () => {
        renderHook(() => useLogEventBridge());
        captured.onSchemaError!({ profileName: 'p', dbName: 'appdb', error: 'connection refused' });

        expect(appended).toHaveLength(1);
        expect(appended[0].kind).toBe('schema.error');
        expect(appended[0].level).toBe('error');
        expect(appended[0].message).toContain('appdb');
        expect(appended[0].message).toContain('connection refused');
    });

    it('maps onTransactionStatus with status=error to level=error', () => {
        renderHook(() => useLogEventBridge());
        captured.onTransactionStatus!({ status: 'error', error: 'deadlock', driver: 'postgres' });

        expect(appended).toHaveLength(1);
        expect(appended[0].kind).toBe('tx.status');
        expect(appended[0].level).toBe('error');
        expect(appended[0].message).toContain('deadlock');
    });

    it('unsubscribes every listener on unmount', () => {
        const { unmount } = renderHook(() => useLogEventBridge());
        unmount();
        for (const key of Object.keys(unsubs)) {
            expect(unsubs[key]).toHaveBeenCalledTimes(1);
        }
    });
});
