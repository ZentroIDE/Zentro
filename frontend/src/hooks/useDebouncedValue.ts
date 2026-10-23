// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDebouncedValueResult {
    /** Latest typed value — call `setValue` on every keystroke. */
    value: string;
    /** `value` as of the last quiet period; this is the one to act on. */
    debouncedValue: string;
    setValue: (next: string) => void;
    /** Commit any pending change immediately, skipping the remaining delay. */
    flush: () => void;
}

/**
 * Text-input debounce.
 *
 * The input stays responsive because `value` tracks every keystroke, while the
 * expensive consumer reads `debouncedValue` and therefore only runs once the
 * user pauses. `flush` exists so an explicit action (Escape clearing the field,
 * a toggle click, blur) does not have to wait out the delay.
 *
 * When `value` changes from the outside, the new value is adopted immediately
 * for both sides — otherwise the local draft would silently disagree with the
 * source of truth. Only typed input arms the timer, so no timer is left behind
 * in that case.
 */
export function useDebouncedValue(
    value: string,
    delayMs: number,
    onCommit?: (value: string) => void,
): UseDebouncedValueResult {
    const [inputValue, setInputValue] = useState(value);
    const [debouncedValue, setDebouncedValue] = useState(value);
    const timerRef = useRef<number | null>(null);
    const latestRef = useRef(value);
    const debouncedRef = useRef(value);
    const onCommitRef = useRef(onCommit);

    latestRef.current = inputValue;
    debouncedRef.current = debouncedValue;
    onCommitRef.current = onCommit;

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const commit = useCallback(
        (next: string) => {
            clearTimer();
            if (debouncedRef.current === next) return;
            debouncedRef.current = next;
            setDebouncedValue(next);
            onCommitRef.current?.(next);
        },
        [clearTimer],
    );

    // Adopt an externally-driven change (programmatic set, project switch, a
    // restore of persisted state). Runs when a timer is pending too, in which
    // case the pending edit is superseded rather than applied late.
    useEffect(() => {
        if (value === latestRef.current) return;
        clearTimer();
        latestRef.current = value;
        setInputValue(value);
        commit(value);
    }, [clearTimer, commit, value]);

    useEffect(() => {
        if (inputValue === debouncedValue) return;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            commit(latestRef.current);
        }, delayMs);
        return clearTimer;
    }, [clearTimer, commit, debouncedValue, delayMs, inputValue]);

    useEffect(() => clearTimer, [clearTimer]);

    const setValue = useCallback((next: string) => {
        latestRef.current = next;
        setInputValue(next);
    }, []);

    const flush = useCallback(() => commit(latestRef.current), [commit]);

    return { value: inputValue, debouncedValue, setValue, flush };
}
