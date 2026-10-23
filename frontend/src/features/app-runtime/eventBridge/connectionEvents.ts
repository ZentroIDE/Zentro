// SPDX-License-Identifier: GPL-3.0-only

import {
    onConnectionChanged,
    onConnectionUpdated,
    onTransactionStatus,
    type ConnectionChangedPayload,
    type ConnectionUpdatedPayload,
} from '../../../lib/events';
import { CONNECTION_STATUS, TRANSACTION_STATUS } from '../../../lib/constants';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useStatusStore } from '../../../stores/statusStore';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { appLogger } from '../../../lib/logger';
import type { ConnectionProfile } from '../../../types/connection';
import { notifyImportantError, type EventBridgeToast, type Unsubscribe } from './shared';

function normalizeTransactionStatus(
    value: string,
): (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS] {
    if (value === TRANSACTION_STATUS.ACTIVE || value === TRANSACTION_STATUS.ERROR)
        return value as any;
    return TRANSACTION_STATUS.NONE;
}

function toConnectionProfile(profile: ConnectionChangedPayload['profile']): ConnectionProfile {
    return profile as ConnectionProfile;
}

type ConnectionStoreState = ReturnType<typeof useConnectionStore.getState>;
type StatusStoreState = ReturnType<typeof useStatusStore.getState>;

export interface ConnectionEventDeps {
    toast: EventBridgeToast;
    setIsConnected: ConnectionStoreState['setIsConnected'];
    setActiveProfile: ConnectionStoreState['setActiveProfile'];
    setDatabases: ConnectionStoreState['setDatabases'];
    setConnectionStatus: ConnectionStoreState['setConnectionStatus'];
    setTransactionStatus: StatusStoreState['setTransactionStatus'];
}

// Connection lifecycle + transaction status events.
export function subscribeConnectionEvents(deps: ConnectionEventDeps): Unsubscribe[] {
    const {
        toast,
        setIsConnected,
        setActiveProfile,
        setDatabases,
        setConnectionStatus,
        setTransactionStatus,
    } = deps;

    return [
        onConnectionChanged((data: ConnectionChangedPayload) => {
            appLogger.info('connection changed', data);
            if (data.status === CONNECTION_STATUS.CONNECTED && data.profile) {
                setIsConnected(true);
                setConnectionStatus(CONNECTION_STATUS.CONNECTED);
                setActiveProfile(toConnectionProfile(data.profile));
                setDatabases(data.databases ?? []);
                getApiGateway()
                    .connection.getTransactionStatus()
                    .then(result =>
                        setTransactionStatus(
                            result.ok
                                ? normalizeTransactionStatus(result.data)
                                : TRANSACTION_STATUS.NONE,
                        ),
                    );
            } else if (data.status === CONNECTION_STATUS.CONNECTING && data.profile) {
                setConnectionStatus(CONNECTION_STATUS.CONNECTING);
                setActiveProfile(toConnectionProfile(data.profile));
            } else if (data.status === CONNECTION_STATUS.DISCONNECTED) {
                setIsConnected(false);
                setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
                setActiveProfile(null);
                setDatabases([]);
                setTransactionStatus(TRANSACTION_STATUS.NONE);
            } else if (data.status === CONNECTION_STATUS.ERROR) {
                const prevStatus = useConnectionStore.getState().connectionStatus;
                if (data.profile) {
                    setActiveProfile(toConnectionProfile(data.profile));
                }
                setConnectionStatus(CONNECTION_STATUS.ERROR);
                setIsConnected(false);
                setTransactionStatus(TRANSACTION_STATUS.ERROR, 'connection error');
                if (prevStatus !== CONNECTION_STATUS.DISCONNECTED) {
                    notifyImportantError(
                        toast.error,
                        'Connection failed or lost. Please check your settings.',
                        {
                            id: 'connection-error',
                            important: true,
                            source: 'system.connection',
                            dedupeKey: 'connection-error',
                        },
                    );
                }
            } else {
                appLogger.warn('unhandled connection status', { status: data.status });
            }
        }),
        onConnectionUpdated((data: ConnectionUpdatedPayload) => {
            appLogger.info('connection updated', data);
            const active = useConnectionStore.getState().activeProfile;
            if (data.profile && active && active.id === data.profile.id) {
                setActiveProfile(toConnectionProfile(data.profile));
            }
        }),
        onTransactionStatus(payload => {
            setTransactionStatus(payload.status as any, payload.error || null);
            if (payload.status === TRANSACTION_STATUS.ERROR && payload.error) {
                notifyImportantError(toast.error, `Transaction failed: ${payload.error}`, {
                    important: true,
                    source: 'system.transaction',
                    dedupeKey: 'transaction-error',
                });
            }
        }),
    ];
}
