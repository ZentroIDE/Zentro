// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../../shared/kernel';
import type { ServerSession } from '../../platform/app-api/contracts/serverSession';

export type ServerSessionFilter = 'active' | 'all' | 'mine';

export interface UseServerSessionsResult {
    sessions: ServerSession[];
    loading: boolean;
    /** Null once a refresh has succeeded at least once. */
    error: string | null;
    /** False once a refresh has failed with the driver's "not supported"
     *  error (SQLite has no server-wide session list) — distinct from
     *  `error`, which can also hold a transient fetch failure on a driver
     *  that IS supported. */
    supported: boolean;
    refresh: () => Promise<void>;
}

const UNSUPPORTED_MARKER = 'not supported';

/** Polls ListServerSessions on `intervalMs` while `enabled` is true (the
 *  Sessions tab is selected) and stops while it's false, mirroring
 *  useElapsed's live/frozen split — a hidden tab shouldn't keep hitting the
 *  server. Always fetches once immediately when `enabled` flips true. */
export function useServerSessions(enabled: boolean, intervalMs: number): UseServerSessionsResult {
    const [sessions, setSessions] = useState<ServerSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [supported, setSupported] = useState(true);
    const inFlight = useRef(false);

    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setLoading(true);
        try {
            const result = await getApiGateway().serverSession.list();
            if (!result.ok) {
                const message = kernelErrorMessage(result.error);
                setError(message);
                setSupported(!message.toLowerCase().includes(UNSUPPORTED_MARKER));
                return;
            }
            setSessions(result.data);
            setError(null);
            setSupported(true);
        } finally {
            setLoading(false);
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        void refresh();
        const id = setInterval(() => void refresh(), intervalMs);
        return () => clearInterval(id);
    }, [enabled, intervalMs, refresh]);

    return { sessions, loading, error, supported, refresh };
}
