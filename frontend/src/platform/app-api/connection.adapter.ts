// SPDX-License-Identifier: GPL-3.0-only

import {
    BeginTransaction,
    CommitTransaction,
    RollbackTransaction,
    GetTransactionStatus,
    Connect,
    Disconnect,
    Reconnect,
    SwitchDatabase,
    LoadConnections,
    LoadDatabasesForConnection,
    LoadDatabasesForProfile,
    CreateDatabase,
    SaveConnection,
    DeleteConnection,
    ExportConnectionsBundle,
    ImportConnectionsFromFile,
    ListConnectionImporters,
    DetectImporterWorkspace,
    ImportConnectionsFromTool,
    TestConnection,
    GetConnectionStatus,
    PickSQLiteFile,
    ConnectProjectEnvironment,
    ListConnectionUsage,
    GetBookmarks,
    GetBookmarksByConnection,
    SaveBookmark,
    DeleteBookmark,
    GetImageColumns,
    GetImageColumnsByConnection,
    SetImageColumn,
    PinConnection,
    UnpinConnection,
} from '../../../wailsjs/go/app/App';
import { models as goModels } from '../../../wailsjs/go/models';
import type { ConnectionRuntimeState } from './types';
import type { ConnectionProfile } from '../../types/connection';
import { CONNECTION_STATUS } from '../../lib/constants';

function normalizeRuntimeConnectionStatus(status: unknown): ConnectionRuntimeState['status'] {
    if (
        status === CONNECTION_STATUS.CONNECTED ||
        status === CONNECTION_STATUS.CONNECTING ||
        status === CONNECTION_STATUS.DISCONNECTED ||
        status === CONNECTION_STATUS.ERROR
    ) {
        return status as ConnectionRuntimeState['status'];
    }
    return CONNECTION_STATUS.DISCONNECTED;
}

function toConnectionProfile(raw: unknown): ConnectionProfile | null {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as Record<string, unknown>;

    if (typeof source.name !== 'string' || typeof source.driver !== 'string') {
        return null;
    }

    return {
        id: typeof source.id === 'string' ? source.id : '',
        name: source.name,
        driver: source.driver,
        host: typeof source.host === 'string' ? source.host : '',
        port: typeof source.port === 'number' ? source.port : 0,
        db_name: typeof source.db_name === 'string' ? source.db_name : '',
        username: typeof source.username === 'string' ? source.username : '',
        password: typeof source.password === 'string' ? source.password : '',
        ssl_mode: typeof source.ssl_mode === 'string' ? source.ssl_mode : '',
        connect_timeout: typeof source.connect_timeout === 'number' ? source.connect_timeout : 10,
        save_password: source.save_password === true,
        encrypt_password: source.encrypt_password === true,
        show_all_schemas: source.show_all_schemas === true,
        trust_server_cert: source.trust_server_cert === true,
        tls_min_version: typeof source.tls_min_version === 'string' ? source.tls_min_version : '',
        tls_legacy_ciphers: source.tls_legacy_ciphers === true,
        ssh_enabled: source.ssh_enabled === true,
        ssh_host: typeof source.ssh_host === 'string' ? source.ssh_host : '',
        ssh_port: typeof source.ssh_port === 'number' && source.ssh_port > 0 ? source.ssh_port : 22,
        ssh_user: typeof source.ssh_user === 'string' ? source.ssh_user : '',
        ssh_auth:
            typeof source.ssh_auth === 'string' && source.ssh_auth ? source.ssh_auth : 'password',
        ssh_key_path: typeof source.ssh_key_path === 'string' ? source.ssh_key_path : '',
        ssh_password: typeof source.ssh_password === 'string' ? source.ssh_password : '',
        ssh_passphrase: typeof source.ssh_passphrase === 'string' ? source.ssh_passphrase : '',
    };
}

function toConnectionRuntimeState(raw: unknown): ConnectionRuntimeState {
    if (!raw || typeof raw !== 'object') {
        return { status: CONNECTION_STATUS.DISCONNECTED, profile: null };
    }
    const source = raw as Record<string, unknown>;

    return {
        status: normalizeRuntimeConnectionStatus(source.status),
        profile: toConnectionProfile(source.profile),
    };
}

export const connectionAdapter = {
    Connect,
    Disconnect,
    Reconnect,
    SwitchDatabase,
    LoadConnections,
    LoadDatabasesForConnection,
    LoadDatabasesForProfile,
    CreateDatabase,
    SaveConnection,
    DeleteConnection,
    ExportConnectionsBundle,
    ImportConnectionsFromFile,
    ListConnectionImporters,
    DetectImporterWorkspace,
    ImportConnectionsFromTool,
    TestConnection,
    GetConnectionStatus: async () => toConnectionRuntimeState(await GetConnectionStatus()),
    PickSQLiteFile,
    ConnectProjectEnvironment,
    ListConnectionUsage,
    BeginTransaction,
    CommitTransaction,
    RollbackTransaction,
    GetTransactionStatus,
    GetBookmarks,
    GetBookmarksByConnection,
    SaveBookmark,
    DeleteBookmark,
    GetImageColumns,
    GetImageColumnsByConnection,
    SetImageColumn,
    PinConnection,
    UnpinConnection,
};
