// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';

import { useConnectionStore } from '../../../stores/connectionStore';
import { CONNECTION_STATUS } from '../../../lib/constants';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';

/**
 * Reconnect button handler. No-ops when there is no active profile or while a
 * connection attempt is in flight. Errors are intentionally swallowed to match
 * the legacy reload behaviour.
 */
export function useReconnectLogic() {
    const { activeProfile, connectionStatus } = useConnectionStore();

    const canReconnect =
        Boolean(activeProfile) && connectionStatus !== CONNECTION_STATUS.CONNECTING;
    const isConnecting = connectionStatus === CONNECTION_STATUS.CONNECTING;

    const handleReconnect = useCallback(async () => {
        if (!activeProfile || connectionStatus === CONNECTION_STATUS.CONNECTING) return;
        await getApiGateway().connection.reconnect();
    }, [activeProfile, connectionStatus]);

    return { handleReconnect, canReconnect, isConnecting };
}
