// SPDX-License-Identifier: GPL-3.0-only

import type { models, app } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';
import type { ConnectionRuntimeState } from '../types';

export interface ConnectionAdapter {
    connect(database: string): Promise<KernelResult<void>>;
    disconnect(): Promise<KernelResult<void>>;
    reconnect(): Promise<KernelResult<void>>;
    switchDatabase(database: string): Promise<KernelResult<void>>;
    loadConnections(): Promise<KernelResult<models.ConnectionProfile[]>>;
    loadDatabasesForProfile(id: string): Promise<KernelResult<string[]>>;
    loadDatabasesForConnection(profile: models.ConnectionProfile): Promise<KernelResult<string[]>>;
    createDatabase(profile: models.ConnectionProfile, dbName: string): Promise<KernelResult<void>>;
    saveConnection(profile: models.ConnectionProfile): Promise<KernelResult<void>>;
    deleteConnection(id: string): Promise<KernelResult<void>>;
    /** Export the named pool connections (empty = all) to a user-picked JSON
     * bundle. Resolves to the written path, or "" if the user cancelled. */
    exportConnectionsBundle(names: string[]): Promise<KernelResult<string>>;
    /** Prompt for a JSON file (Zentro bundle or legacy single-connection
     * package) and return its connections, secrets stripped. */
    importConnectionsFromFile(): Promise<KernelResult<models.ConnectionProfile[] | null>>;
    listConnectionImporters(): Promise<KernelResult<app.ImporterInfo[]>>;
    detectImporterWorkspace(key: string): Promise<KernelResult<string>>;
    importConnectionsFromTool(
        key: string,
        path: string,
    ): Promise<KernelResult<models.ConnectionProfile[] | null>>;
    testConnection(profile: models.ConnectionProfile): Promise<KernelResult<void>>;
    getConnectionStatus(): Promise<KernelResult<ConnectionRuntimeState>>;
    /** Prompt the OS-native file picker for a SQLite database file, filtered
     * to common SQLite extensions. Resolves to "" if the user cancelled. */
    pickSQLiteFile(): Promise<KernelResult<string>>;
    /** Which projects/environments reference a pool connection — shown
     * before editing or deleting it in Settings, since it's a shared
     * gateway other projects may depend on. */
    listConnectionUsage(id: string): Promise<KernelResult<app.ConnectionUsageRef[]>>;

    beginTransaction(): Promise<KernelResult<void>>;
    commitTransaction(): Promise<KernelResult<void>>;
    rollbackTransaction(): Promise<KernelResult<void>>;
    getTransactionStatus(): Promise<KernelResult<string>>;

    // Pinned Environment lifecycle (ADR-0001,
    // docs/adr/0001-pinned-environment-context-for-data-tabs.md) — called
    // once when a Table/Catalog tab mounts/unmounts.
    pinTab(connectionID: string, dbName: string): Promise<KernelResult<void>>;
    unpinTab(connectionID: string, dbName: string): Promise<KernelResult<void>>;
}
