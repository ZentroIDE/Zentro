// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useProjectStore } from '../../stores/projectStore';
import { useLogStore } from '../../stores/logStore';
import type { ToastApi } from '../../components/layout/Toast';
import { subscribeConnectionEvents } from './eventBridge/connectionEvents';
import { subscribeSchemaEvents } from './eventBridge/schemaEvents';
import { subscribeQueryResultEvents } from './eventBridge/queryResultEvents';
import { subscribeLicenseEvents } from './eventBridge/licenseEvents';
import { subscribeJobEvents } from './eventBridge/jobEvents';
import { subscribeStatsEvents } from './eventBridge/statsEvents';

// BE→FE event bridge. Pattern: Observer/registry — each domain module under
// eventBridge/ owns its subscriptions (subscribe*Events returns unsubscribe
// callbacks); this hook only merges them and manages the React lifecycle.
// Adding a new event touches constants.ts, events.go, and one domain module.
export function useAppEventBridge(toast: Pick<ToastApi, 'error'>) {
    const { setIsConnected, setActiveProfile, setDatabases, setConnectionStatus } =
        useConnectionStore();
    const { setTransactionStatus } = useStatusStore();
    const activeProjectId = useProjectStore(s => s.activeProject?.id);
    const clearEvents = useLogStore(s => s.clearEvents);
    const prevProjectIdRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (
            prevProjectIdRef.current !== undefined &&
            prevProjectIdRef.current !== activeProjectId
        ) {
            clearEvents();
        }
        prevProjectIdRef.current = activeProjectId;
    }, [activeProjectId, clearEvents]);

    useEffect(() => {
        const subs = [
            ...subscribeConnectionEvents({
                toast,
                setIsConnected,
                setActiveProfile,
                setDatabases,
                setConnectionStatus,
                setTransactionStatus,
            }),
            ...subscribeSchemaEvents({ toast, setDatabases }),
            ...subscribeQueryResultEvents({ toast }),
            ...subscribeLicenseEvents(),
            ...subscribeJobEvents(),
            ...subscribeStatsEvents(),
        ];

        return () => {
            subs.forEach(unsub => unsub());
        };
    }, [
        setActiveProfile,
        setConnectionStatus,
        setDatabases,
        setIsConnected,
        setTransactionStatus,
        toast,
    ]);
}
