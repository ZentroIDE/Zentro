// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottledStorage } from './throttledStorage';

function createBaseStorage() {
    const values = new Map<string, string>();
    return {
        values,
        getItem: vi.fn((name: string) => values.get(name) ?? null),
        setItem: vi.fn((name: string, value: string) => {
            values.set(name, value);
        }),
        removeItem: vi.fn((name: string) => {
            values.delete(name);
        }),
    };
}

describe('createThrottledStorage', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('defers the write until the window closes and only writes the latest value', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'v1');
        storage.setItem('editor', 'v2');
        storage.setItem('editor', 'v3');

        expect(base.setItem).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);

        expect(base.setItem).toHaveBeenCalledTimes(1);
        expect(base.setItem).toHaveBeenCalledWith('editor', 'v3');
    });

    it('a sustained burst persists once per window instead of starving', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        // Update 4x faster than the window for two seconds of "typing".
        for (let elapsed = 0; elapsed < 2000; elapsed += 125) {
            storage.setItem('editor', `v${elapsed}`);
            vi.advanceTimersByTime(125);
        }

        // Windows close at t=500/1000/1500/2000 => 4 writes for 16 updates,
        // each carrying the newest value seen in its window.
        expect(base.setItem.mock.calls).toEqual([
            ['editor', 'v375'],
            ['editor', 'v875'],
            ['editor', 'v1375'],
            ['editor', 'v1875'],
        ]);

        // The burst never starves the write: the pending value at any moment
        // is already the one a later flush would apply.
        storage.flush();
        expect(base.setItem).toHaveBeenCalledTimes(4);
    });

    it('flush persists the value still pending inside an unfinished window', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        // Stop at t=1875, i.e. 125ms before the fourth window closes at 2000.
        for (let elapsed = 0; elapsed < 1875; elapsed += 125) {
            storage.setItem('editor', `v${elapsed}`);
            vi.advanceTimersByTime(125);
        }

        expect(base.setItem).toHaveBeenCalledTimes(3);

        storage.flush();

        expect(base.setItem).toHaveBeenCalledTimes(4);
        expect(base.setItem).toHaveBeenLastCalledWith('editor', 'v1750');
    });

    it('a later write does not extend the window already open', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'v1');
        vi.advanceTimersByTime(400);
        storage.setItem('editor', 'v2');
        vi.advanceTimersByTime(100);

        expect(base.setItem).toHaveBeenCalledTimes(1);
        expect(base.setItem).toHaveBeenCalledWith('editor', 'v2');
    });

    it('flush applies the pending value immediately', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'pending');
        storage.flush();

        expect(base.setItem).toHaveBeenCalledWith('editor', 'pending');

        // No double write when the cancelled timer would have fired.
        vi.advanceTimersByTime(2000);
        expect(base.setItem).toHaveBeenCalledTimes(1);
    });

    it('flush is a no-op when nothing is pending', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.flush();

        expect(base.setItem).not.toHaveBeenCalled();
    });

    it('dispose drops the pending write and ignores later writes', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'pending');
        storage.dispose();
        vi.advanceTimersByTime(5000);

        expect(base.setItem).not.toHaveBeenCalled();

        storage.setItem('editor', 'after-dispose');
        vi.advanceTimersByTime(5000);
        expect(base.setItem).not.toHaveBeenCalled();
    });

    it('removeItem clears any pending write for the key', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'pending');
        storage.removeItem('editor');
        vi.advanceTimersByTime(5000);

        expect(base.removeItem).toHaveBeenCalledWith('editor');
        expect(base.setItem).not.toHaveBeenCalled();
    });

    it('reads pass straight through to the base storage', () => {
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'value');
        storage.flush();

        expect(storage.getItem('editor')).toBe('value');
        expect(storage.getItem('missing')).toBeNull();
    });

    it('writes again in a new window after a flush', () => {
        vi.useFakeTimers();
        const base = createBaseStorage();
        const storage = createThrottledStorage(base, { intervalMs: 500 });

        storage.setItem('editor', 'v1');
        vi.advanceTimersByTime(500);
        storage.setItem('editor', 'v2');
        vi.advanceTimersByTime(500);

        expect(base.setItem).toHaveBeenNthCalledWith(1, 'editor', 'v1');
        expect(base.setItem).toHaveBeenNthCalledWith(2, 'editor', 'v2');
    });
});
