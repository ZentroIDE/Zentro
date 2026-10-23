// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useRef } from 'react';

/** Returns a stable callback reference that always calls the latest
 *  provided function without changing identity between renders.
 *  Useful for passing callbacks to memoized children. */
export function useStableCallback<T extends (...args: never[]) => unknown>(fn: T): T {
    const ref = useRef<T>(fn);
    ref.current = fn;
    return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T;
}
