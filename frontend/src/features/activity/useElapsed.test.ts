// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { formatElapsed, useElapsed } from './useElapsed';

describe('formatElapsed', () => {
    it('formats sub-hour durations as mm:ss', () => {
        expect(formatElapsed(0)).toBe('00:00');
        expect(formatElapsed(9_000)).toBe('00:09');
        expect(formatElapsed(84_000)).toBe('01:24');
        expect(formatElapsed(3_599_000)).toBe('59:59');
    });

    it('formats hour-or-longer durations as hh:mm:ss', () => {
        expect(formatElapsed(3_600_000)).toBe('01:00:00');
        expect(formatElapsed(45_760_000)).toBe('12:42:40');
    });

    it('clamps negative durations to zero', () => {
        expect(formatElapsed(-500)).toBe('00:00');
    });
});

describe('useElapsed', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('ticks every second while live', () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const { result } = renderHook(() =>
            useElapsed('2026-01-01T00:00:00.000Z', undefined, true),
        );
        expect(result.current).toBe('00:00');

        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(result.current).toBe('00:03');
    });

    it('freezes at finishedAt once no longer live, instead of drifting with now', () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const { result, rerender } = renderHook(
            ({ live, finishedAt }: { live: boolean; finishedAt?: string }) =>
                useElapsed('2026-01-01T00:00:00.000Z', finishedAt, live),
            { initialProps: { live: true, finishedAt: undefined as string | undefined } },
        );

        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(result.current).toBe('00:05');

        // Job finishes at t=5s; time keeps moving but elapsed must stay put.
        rerender({ live: false, finishedAt: '2026-01-01T00:00:05.000Z' });
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(result.current).toBe('00:05');
    });

    it('does not tick when never live', () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const { result } = renderHook(() =>
            useElapsed('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:02.000Z', false),
        );
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(result.current).toBe('00:02');
    });
});
