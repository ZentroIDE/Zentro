// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { useEnvironmentStore } from '../../../stores/environmentStore';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { useToast } from '../../../components/layout/Toast';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import { WriteOperationKind } from '../../../lib/writeSafety/writeSafety';
import { buildNewTableDraftTarget } from '../../../lib/tableTargets';
import { DOM_EVENT, type DroppableObjectType } from '../../../lib/constants';
import { emitCommand, onCommand } from '../../../lib/commandBus';
import { createCatalogTab, createTableTab } from '../../../lib/tabFactory';
import { categoryKeyToCatalogKind } from '../catalogObjectKinds';
import { logClientEvent } from '../../../lib/clientEventLog';

interface ExplorerActionsInput {
    /** Active connection's pool ID — the identity every write/pinned call
     * below needs (ADR-0001). */
    connectionID: string;
    dbName: string;
    driver: string;
}

// Explorer tree actions: open/create/drop/truncate/refresh/export. All
// backend calls go through the gateway seam; destructive operations pass the
// write-safety guard first.
export function useExplorerActions({ connectionID, dbName, driver }: ExplorerActionsInput) {
    const addTab = useEditorStore(state => state.addTab);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const { toast } = useToast();
    const writeSafetyGuard = useWriteSafetyGuard(activeEnvironmentKey);

    // Captured once per render of the currently active connection — every
    // table/catalog tab opened from here pins to *this* snapshot (ADR-0001),
    // not to whatever's active when the tab is later focused.
    const pinnedConnection = useMemo(
        () =>
            connectionID && dbName
                ? { connectionID, dbName, driver, environmentKey: activeEnvironmentKey || '' }
                : undefined,
        [connectionID, dbName, driver, activeEnvironmentKey],
    );

    const handleOpenDefinition = useCallback(
        (schemaName: string, objectName: string) => {
            const addTabStart = performance.now();
            const tabId = addTab(createTableTab(`${schemaName}.${objectName}`, pinnedConnection));
            const addTabMs = performance.now() - addTabStart;
            logClientEvent('table-tab.click', {
                tabId,
                schema: schemaName,
                table: objectName,
                connectionID,
                dbName,
                // How long the synchronous addTab() call itself took, to
                // tell apart "addTab's own work is slow" from "something
                // else blocks the main thread between click and the tab's
                // mount effect running" (see the click.addTab-sync log).
                addTabSyncMs: addTabMs.toFixed(1),
            });
        },
        [addTab, dbName, pinnedConnection, connectionID],
    );

    const handleOpenCatalog = useCallback(
        (schemaName: string, objectName: string, categoryKey: string) => {
            addTab(
                createCatalogTab(
                    {
                        connectionID,
                        dbName,
                        driver,
                        objectKind: categoryKeyToCatalogKind(categoryKey),
                        schema: schemaName,
                        name: objectName,
                        catalogPath: `${schemaName}.${objectName}`,
                        environmentKey: activeEnvironmentKey || '',
                    },
                    pinnedConnection,
                ),
            );
        },
        [addTab, activeEnvironmentKey, dbName, driver, pinnedConnection, connectionID],
    );

    const handleCreateTable = useCallback(
        (schemaName: string) => {
            const defaultTableName = 'new_table';
            const qualifiedName = schemaName
                ? `${schemaName}.${defaultTableName}`
                : defaultTableName;
            addTab({
                ...createTableTab(qualifiedName, pinnedConnection),
                content: buildNewTableDraftTarget(schemaName, defaultTableName),
            });
        },
        [addTab, pinnedConnection],
    );

    const handleDropObject = async (
        schema: string,
        objectName: string,
        objectType: DroppableObjectType,
        cascade: boolean,
    ) => {
        if (!connectionID || !dbName) return;
        const guard = await writeSafetyGuard.guardOperations(
            [WriteOperationKind.DROP],
            `Drop ${objectType}`,
        );
        if (!guard.allowed) {
            if (guard.blockedReason) {
                toast.error(guard.blockedReason);
            }
            return;
        }
        try {
            unwrapOrThrow(
                await getApiGateway().schema.dropObjectAdvanced(
                    connectionID,
                    dbName,
                    schema,
                    objectName,
                    objectType,
                    cascade,
                ),
            );
            toast.success(`${objectType} "${objectName}" dropped successfully`);
            unwrapOrThrow(await getApiGateway().schema.fetchDatabaseSchema(connectionID, dbName));
        } catch (error) {
            toast.error(`Failed to drop: ${error}`);
        }
    };

    const handleTruncateTable = async (
        schema: string,
        tableName: string,
        cascade: boolean,
        restartIdentity: boolean,
    ) => {
        if (!connectionID || !dbName) return;
        const guard = await writeSafetyGuard.guardOperations(
            [WriteOperationKind.TRUNCATE],
            'Truncate Table',
        );
        if (!guard.allowed) {
            if (guard.blockedReason) {
                toast.error(guard.blockedReason);
            }
            return;
        }
        try {
            unwrapOrThrow(
                await getApiGateway().schema.truncateTable(
                    connectionID,
                    dbName,
                    schema,
                    tableName,
                    cascade,
                    restartIdentity,
                ),
            );
            toast.success(`Table "${tableName}" truncated successfully`);
            unwrapOrThrow(await getApiGateway().schema.fetchDatabaseSchema(connectionID, dbName));
        } catch (error) {
            toast.error(`Failed to truncate: ${error}`);
        }
    };

    const handleRefreshSchema = useCallback(
        async (silent = false) => {
            if (!connectionID || !dbName) return;
            try {
                unwrapOrThrow(
                    await getApiGateway().schema.fetchDatabaseSchema(connectionID, dbName),
                );
                if (!silent) {
                    toast.success('Schema refreshed');
                }
            } catch (error) {
                toast.error(`Failed to refresh schema: ${error}`);
            }
        },
        [dbName, connectionID, toast],
    );

    useEffect(() => {
        return onCommand(DOM_EVENT.REFRESH_DATABASE_EXPLORER, payload => {
            void handleRefreshSchema(payload?.silent === true);
        });
    }, [handleRefreshSchema]);

    const handleExportData = useCallback(
        (schema: string, tableName: string) => {
            const qualifiedName = `${schema}.${tableName}`;
            const tableTabId = addTab(createTableTab(qualifiedName, pinnedConnection));
            emitCommand(DOM_EVENT.OPEN_TABLE_EXPORT, { tableTabId });
        },
        [addTab, pinnedConnection],
    );

    const handleImportData = useCallback((schema: string, tableName: string) => {
        emitCommand(DOM_EVENT.OPEN_DATA_IMPORT, { schema, table: tableName });
    }, []);

    return {
        handleOpenDefinition,
        handleOpenCatalog,
        handleCreateTable,
        handleDropObject,
        handleTruncateTable,
        handleRefreshSchema,
        handleExportData,
        handleImportData,
        writeSafetyModals: writeSafetyGuard.modals,
    };
}
