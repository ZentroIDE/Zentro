// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import type { PinnedConnection } from '../../../stores/editor/types';
import { logClientEvent } from '../../../lib/clientEventLog';

export type PinStatus = 'idle' | 'pinning' | 'ready' | 'error';

// useTableTabConnectionPin owns a Table/Catalog tab's Pinned Environment
// lifecycle (ADR-0001, docs/adr/0001-pinned-environment-context-for-data-tabs.md):
// pins connection on mount (and whenever the pinned identity itself
// changes — it never does, since Tab.connection is set once at tab-open
// time and immutable), unpins on unmount. The backend pool ref-counts, so
// multiple tabs pinning the same connectionID/dbName share one connection.
// tabId is used only to tag the click-to-data-loaded diagnostic log below.
export function useTableTabConnectionPin(
    tabId: string,
    connection: PinnedConnection | undefined,
): PinStatus {
    const [status, setStatus] = useState<PinStatus>('idle');
    const connectionID = connection?.connectionID;
    const dbName = connection?.dbName;

    useEffect(() => {
        if (!connectionID || !dbName) {
            setStatus('idle');
            return;
        }

        let cancelled = false;
        setStatus('pinning');
        logClientEvent('table-tab.pin.start', { tabId, connectionID, dbName });

        const pinCall = getApiGateway().connection.pinTab(connectionID, dbName);
        pinCall
            .then(result => {
                if (cancelled) return;
                setStatus(result.ok ? 'ready' : 'error');
                logClientEvent('table-tab.pin.done', {
                    tabId,
                    connectionID,
                    dbName,
                    status: result.ok ? 'ready' : 'error',
                });
            })
            .catch(() => {
                if (!cancelled) setStatus('error');
                logClientEvent('table-tab.pin.done', {
                    tabId,
                    connectionID,
                    dbName,
                    status: 'error',
                });
            });

        return () => {
            cancelled = true;
            // Wait for the in-flight Pin to actually settle before
            // unpinning. React (StrictMode, or a fast mount→unmount in
            // production) can run this cleanup while PinConnection's
            // dial+ping is still in flight — unpinning immediately is a
            // no-op then (the pool has no entry yet for Lookup/Unpin to
            // find), and once Pin *does* land moments later it registers a
            // refCount this cleanup already tried and failed to remove,
            // permanently leaking that connection for the rest of the
            // process's life. Chaining onto pinCall guarantees Unpin only
            // fires once the pool entry actually exists.
            void pinCall.finally(() => {
                void getApiGateway().connection.unpinTab(connectionID, dbName);
            });
        };
    }, [connectionID, dbName, tabId]);

    return status;
}
