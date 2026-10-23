// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from 'react';

export interface UseAsyncResourceResult<T> {
    data: T | null;
    setData: (data: T | null) => void;
    loading: boolean;
    saving: boolean;
    /** Set only by a failed `refresh()` (load) — `runSaving` failures are
     *  not written here, since they rethrow to the caller's own try/catch
     *  instead (see `runSaving`). Keeping the two separate avoids a load
     *  and a save failure both trying to drive the same error-toast
     *  effect off one shared field. */
    error: unknown;
    refresh: () => Promise<void>;
    /** Wraps a save operation with `saving` bookkeeping and rethrows on
     *  failure — it does not touch `error`. `fn` reads whatever
     *  draft/edit state the caller owns; the caller's own try/catch
     *  around `runSaving(...)` is expected to handle/toast the error. */
    runSaving: (fn: () => Promise<void>) => Promise<void>;
}

/** Owns the fetch/loading/saving/error/refresh state machine shared by
 *  views that load a resource, let the user edit a local draft of it, and
 *  save that draft back. Draft/dirty state and the save operation itself
 *  stay with the caller — this hook only tracks the async lifecycle
 *  around them.
 *
 *  `fetchResource` should be wrapped in the caller's own `useCallback`
 *  with whatever dependencies should trigger a refetch (schema, table
 *  name, a `refreshKey` prop, ...) — this hook refetches whenever
 *  `fetchResource`'s identity changes, the same way the hand-rolled
 *  `useCallback(load, [...]) + useEffect(load, [load, refreshKey])`
 *  pattern it replaces did. */
export function useAsyncResource<T>(fetchResource: () => Promise<T>): UseAsyncResourceResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<unknown>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const next = await fetchResource();
            setData(next);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [fetchResource]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const runSaving = useCallback(async (fn: () => Promise<void>) => {
        setSaving(true);
        try {
            await fn();
        } finally {
            setSaving(false);
        }
    }, []);

    return { data, setData, loading, saving, error, refresh, runSaving };
}
