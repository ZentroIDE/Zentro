// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';

import { CONNECTION_STATUS } from '../lib/constants';
import { useConnectionStore } from '../stores/connectionStore';
import { useProjectStore } from '../stores/projectStore';

/**
 * How long to wait, after a project is in place and nothing is in flight,
 * before accepting "disconnected" as the real answer.
 *
 * Opening a project resets the connection to disconnected and only then does a
 * connect attempt begin, so disconnected is the state every switch passes
 * through on its way to connected. Nothing in the event stream distinguishes
 * "no attempt has started yet" from "there is nothing to connect to" — the
 * backend simply never emits an event in the second case — so the only way to
 * tell them apart is to give the first one a moment to appear.
 */
const SETTLE_MS = 800;

/**
 * Whether to tell the user there is no active connection.
 *
 * Deliberately not the same thing as `!isConnected`. That is true throughout
 * every project switch, which made the notice flash on screen and disappear
 * again on a switch that was about to succeed — reading as a failure that never
 * happened. This waits for the project to finish loading and for the connection
 * state to actually settle before saying anything.
 */
export function useNoConnectionNotice(): boolean {
    const projectId = useProjectStore(state => state.activeProject?.id ?? null);
    const isProjectLoading = useProjectStore(state => state.isLoading);
    const isConnected = useConnectionStore(state => state.isConnected);
    const connectionStatus = useConnectionStore(state => state.connectionStatus);

    // Held per project id rather than as a bare boolean, so switching projects
    // invalidates it in the same render instead of a frame later.
    const [settledFor, setSettledFor] = useState<string | null>(null);

    useEffect(() => {
        if (!projectId || isProjectLoading) return;
        // An attempt is running: by definition not settled.
        if (connectionStatus === CONNECTION_STATUS.CONNECTING) return;

        // Connected, failed or errored are all answers we can trust at once.
        if (connectionStatus !== CONNECTION_STATUS.DISCONNECTED) {
            setSettledFor(projectId);
            return;
        }

        const timer = window.setTimeout(() => setSettledFor(projectId), SETTLE_MS);
        return () => window.clearTimeout(timer);
    }, [projectId, isProjectLoading, connectionStatus]);

    return (
        projectId !== null &&
        !isProjectLoading &&
        settledFor === projectId &&
        !isConnected &&
        connectionStatus !== CONNECTION_STATUS.CONNECTING
    );
}
