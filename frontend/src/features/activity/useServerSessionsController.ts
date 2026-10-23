// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState } from 'react';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../../shared/kernel';
import { useToast } from '../../components/layout/Toast';
import { useConfirmAction } from '../../hooks/useConfirmAction';
import type { ServerSession } from '../../platform/app-api/contracts/serverSession';
import { type ServerSessionFilter, useServerSessions } from './useServerSessions';

export const REFRESH_INTERVALS = [
    { label: '5s', value: 5000 },
    { label: '10s', value: 10000 },
    { label: '30s', value: 30000 },
];

function matchesFilter(session: ServerSession, filter: ServerSessionFilter): boolean {
    switch (filter) {
        case 'mine':
            return session.isSelf;
        case 'active':
            return (
                session.state.toLowerCase() !== 'idle' && session.state.toLowerCase() !== 'sleep'
            );
        case 'all':
        default:
            return true;
    }
}

export interface PendingKill {
    session: ServerSession;
    force: boolean;
}

/** Owns every piece of state the Sessions tab needs — filter, poll
 *  interval, the polled session list, and the kill/cancel confirm flow —
 *  so a single hook call (lifted to ActivityPanel) can feed both the
 *  toolbar (rendered on the shared Jobs/Sessions tab row) and the session
 *  list (rendered in the tab content) without polling or confirm state
 *  diverging between two separate hook instances. */
export function useServerSessionsController(visible: boolean) {
    const [filter, setFilter] = useState<ServerSessionFilter>('active');
    const [intervalMs, setIntervalMs] = useState(REFRESH_INTERVALS[0].value);
    const [acting, setActing] = useState(false);
    const { toast } = useToast();
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const isProduction = activeEnvironmentKey === ENVIRONMENT_KEY.PRODUCTION;

    const killAction = useConfirmAction<PendingKill>();

    const { sessions, loading, error, supported, refresh } = useServerSessions(visible, intervalMs);

    const filtered = useMemo(
        () => sessions.filter(session => matchesFilter(session, filter)),
        [sessions, filter],
    );

    const handleConfirmKill = async ({ session, force }: PendingKill) => {
        setActing(true);
        try {
            const gateway = getApiGateway().serverSession;
            const result = force
                ? await gateway.kill(session.id)
                : await gateway.cancel(session.id);
            if (!result.ok) {
                toast.error(kernelErrorMessage(result.error), {
                    source: 'activity.session-action',
                });
            } else {
                void refresh();
            }
        } finally {
            setActing(false);
        }
    };

    return {
        filter,
        setFilter,
        intervalMs,
        setIntervalMs,
        filtered,
        loading,
        error,
        supported,
        refresh,
        killAction,
        acting,
        isProduction,
        handleConfirmKill,
    };
}

export type ServerSessionsController = ReturnType<typeof useServerSessionsController>;
