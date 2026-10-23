// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useConnectionStore } from '../../../stores/connectionStore';

const AUTO_RETRY_DELAYS_MS = [250, 500, 900, 1300, 1700, 2200];
const AUTO_RETRY_MAX_ATTEMPTS = 10;

const RECOVERABLE_ERROR_NEEDLES = [
    'no active connection',
    'database is closed',
    'connection is closed',
    'bad connection',
];

interface UseTableInfoAutoRetryArgs {
    /** Latest fetch error string (or null when no error). */
    fetchError: string | null;
    /** True only when this TableInfo's tab is currently focused. */
    isTableTabActive: boolean;
    /** True while a load is in flight (so we don't fire a retry on top of one). */
    loading: boolean;
    reloading: boolean;
    /** Called to retry the load. Typically `() => loadInfo(true)`. */
    onRetry: () => void;
}

/**
 * Auto-retry helper for TableInfo. When the table fetch fails with a
 * transient connection error AND the connection has since recovered, schedule
 * a backoff retry. The hook owns the timer + attempt counter so the parent
 * component stays free of refs.
 *
 * Bounded by `AUTO_RETRY_MAX_ATTEMPTS`. Resets on connection change so a
 * different DB doesn't inherit retry state. Returns nothing — side-effect only.
 */
export function useTableInfoAutoRetry({
    fetchError,
    isTableTabActive,
    loading,
    reloading,
    onRetry,
}: UseTableInfoAutoRetryArgs): void {
    const { activeProfile, isConnected } = useConnectionStore();

    const autoRetryTimerRef = useRef<number | null>(null);
    const autoRetryAttemptRef = useRef(0);
    const autoRetryConnectionRef = useRef('');

    const canAutoRecover = useMemo(() => {
        if (typeof fetchError !== 'string') return false;
        const normalized = fetchError.toLowerCase();
        return RECOVERABLE_ERROR_NEEDLES.some(needle => normalized.includes(needle));
    }, [fetchError]);

    const clearAutoRetryTimer = useCallback(() => {
        if (autoRetryTimerRef.current !== null) {
            window.clearTimeout(autoRetryTimerRef.current);
            autoRetryTimerRef.current = null;
        }
    }, []);

    // Reset attempt counter when the error becomes non-recoverable (or absent).
    useEffect(() => {
        if (!canAutoRecover) {
            autoRetryAttemptRef.current = 0;
            autoRetryConnectionRef.current = '';
            clearAutoRetryTimer();
        }
    }, [canAutoRecover, clearAutoRetryTimer]);

    useEffect(() => {
        if (!isConnected || !isTableTabActive) {
            if (!isConnected) {
                autoRetryAttemptRef.current = 0;
                autoRetryConnectionRef.current = '';
            }
            clearAutoRetryTimer();
            return;
        }

        if (!canAutoRecover || loading || reloading) {
            clearAutoRetryTimer();
            return;
        }

        const connectionKey = `${activeProfile?.name || ''}:${activeProfile?.db_name || ''}`;
        if (!connectionKey) return;

        // Reset attempt counter when the user switches connection.
        if (autoRetryConnectionRef.current !== connectionKey) {
            autoRetryConnectionRef.current = connectionKey;
            autoRetryAttemptRef.current = 0;
        }

        if (autoRetryAttemptRef.current >= AUTO_RETRY_MAX_ATTEMPTS) return;
        if (autoRetryTimerRef.current !== null) return;

        const delayIdx = Math.min(autoRetryAttemptRef.current, AUTO_RETRY_DELAYS_MS.length - 1);
        const retryDelay = AUTO_RETRY_DELAYS_MS[delayIdx];
        autoRetryTimerRef.current = window.setTimeout(() => {
            autoRetryTimerRef.current = null;
            autoRetryAttemptRef.current += 1;
            onRetry();
        }, retryDelay);

        return clearAutoRetryTimer;
    }, [
        activeProfile?.db_name,
        activeProfile?.name,
        canAutoRecover,
        clearAutoRetryTimer,
        isConnected,
        isTableTabActive,
        loading,
        onRetry,
        reloading,
    ]);

    // Cleanup on unmount.
    useEffect(() => () => clearAutoRetryTimer(), [clearAutoRetryTimer]);
}
