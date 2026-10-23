// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

const DELAY = 500;

describe('useDebouncedValue', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reports typed input immediately but debounces the committed value', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useDebouncedValue('', DELAY));

        act(() => {
            result.current.setValue('c');
        });

        expect(result.current.value).toBe('c');
        expect(result.current.debouncedValue).toBe('');

        act(() => {
            vi.advanceTimersByTime(DELAY);
        });

        expect(result.current.value).toBe('c');
        expect(result.current.debouncedValue).toBe('c');
    });

    it('collapses a burst of keystrokes into one committed value', () => {
        vi.useFakeTimers();
        const onCommit = vi.fn();
        const { result } = renderHook(() => useDebouncedValue('', DELAY, onCommit));

        act(() => {
            result.current.setValue('c');
        });
        act(() => {
            vi.advanceTimersByTime(100);
            result.current.setValue('cu');
        });
        act(() => {
            vi.advanceTimersByTime(100);
            result.current.setValue('cus');
        });
        act(() => {
            vi.advanceTimersByTime(100);
            result.current.setValue('cust');
        });
        // Not quiet for long enough yet.
        expect(onCommit).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(DELAY);
        });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('cust');
        expect(result.current.debouncedValue).toBe('cust');
    });

    it('flush commits the pending value without waiting out the delay', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useDebouncedValue('', DELAY));

        act(() => {
            result.current.setValue('cust');
        });
        act(() => {
            result.current.flush();
        });

        expect(result.current.debouncedValue).toBe('cust');

        // The cancelled timer must not fire a second commit.
        const onCommit = vi.fn();
        act(() => {
            vi.advanceTimersByTime(DELAY * 2);
        });
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('adopts an externally driven value immediately for both sides', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ value }: { value: string }) => useDebouncedValue(value, DELAY),
            { initialProps: { value: '' } },
        );

        act(() => {
            result.current.setValue('stale');
        });

        // e.g. a programmatic reset while the user's edit is still pending.
        rerender({ value: 'external' });

        expect(result.current.value).toBe('external');
        expect(result.current.debouncedValue).toBe('external');
    });

    it('does not re-commit an unchanged value', () => {
        vi.useFakeTimers();
        const onCommit = vi.fn();
        const { result } = renderHook(() => useDebouncedValue('', DELAY, onCommit));

        act(() => {
            result.current.setValue('cust');
        });
        act(() => {
            result.current.flush();
        });
        act(() => {
            result.current.flush();
        });

        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('drops a pending commit on unmount', () => {
        vi.useFakeTimers();
        const onCommit = vi.fn();
        const { result, unmount } = renderHook(() => useDebouncedValue('', DELAY, onCommit));

        act(() => {
            result.current.setValue('cust');
        });
        unmount();
        act(() => {
            vi.advanceTimersByTime(DELAY * 2);
        });

        expect(onCommit).not.toHaveBeenCalled();
    });
});
