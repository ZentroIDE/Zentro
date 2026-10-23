// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { ConnectionAdapter } from '../contracts/connection';
import type { RestHttpClient } from './httpClient';
import type { models, app } from '../../../../wailsjs/go/models';
import type { ConnectionRuntimeState } from '../types';

export function createConnectionRestAdapter(client: RestHttpClient): ConnectionAdapter {
    return withKernelResult('connection', {
        connect: (database: string) => client.call<void>('/connection/connect', { database }),
        disconnect: () => client.call<void>('/connection/disconnect'),
        reconnect: () => client.call<void>('/connection/reconnect'),
        switchDatabase: (database: string) =>
            client.call<void>('/connection/switch-database', { database }),
        loadConnections: () =>
            client.call<models.ConnectionProfile[]>('/connection/load-connections'),
        loadDatabasesForProfile: (id: string) =>
            client.call<string[]>('/connection/load-databases-for-profile', { id }),
        loadDatabasesForConnection: (profile: models.ConnectionProfile) =>
            client.call<string[]>('/connection/load-databases-for-connection', { profile }),
        createDatabase: (profile: models.ConnectionProfile, dbName: string) =>
            client.call<void>('/connection/create-database', { profile, dbName }),
        saveConnection: (profile: models.ConnectionProfile) =>
            client.call<void>('/connection/save', { profile }),
        deleteConnection: (id: string) => client.call<void>('/connection/delete', { id }),
        exportConnectionsBundle: (names: string[]) =>
            client.call<string>('/connection/export-bundle', { names }),
        importConnectionsFromFile: () =>
            client.call<models.ConnectionProfile[] | null>('/connection/import-from-file'),
        listConnectionImporters: () =>
            client.call<app.ImporterInfo[]>('/connection/list-importers'),
        detectImporterWorkspace: (key: string) =>
            client.call<string>('/connection/detect-importer-workspace', { key }),
        importConnectionsFromTool: (key: string, path: string) =>
            client.call<models.ConnectionProfile[] | null>('/connection/import-from-tool', {
                key,
                path,
            }),
        testConnection: (profile: models.ConnectionProfile) =>
            client.call<void>('/connection/test', { profile }),
        getConnectionStatus: () => client.call<ConnectionRuntimeState>('/connection/status'),
        pickSQLiteFile: () => client.call<string>('/connection/pick-sqlite-file'),
        listConnectionUsage: (id: string) =>
            client.call<app.ConnectionUsageRef[]>('/connection/usage', { id }),
        beginTransaction: () => client.call<void>('/connection/begin-transaction'),
        commitTransaction: () => client.call<void>('/connection/commit-transaction'),
        rollbackTransaction: () => client.call<void>('/connection/rollback-transaction'),
        getTransactionStatus: () => client.call<string>('/connection/transaction-status'),
        pinTab: (connectionID: string, dbName: string) =>
            client.call<void>('/connection/pin-tab', { connectionID, dbName }),
        unpinTab: (connectionID: string, dbName: string) =>
            client.call<void>('/connection/unpin-tab', { connectionID, dbName }),
    });
}
