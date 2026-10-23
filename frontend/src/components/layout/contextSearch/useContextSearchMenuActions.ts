// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import {
    buildAlterTemplate,
    buildFunctionTemplate,
    buildInfoTemplate,
    buildInsertTemplate,
    buildSelectTemplate,
    buildUpdateTemplate,
    isTableLike,
    type SearchItem,
} from '../../../lib/contextSearchTemplates';
import { TAB_TYPE } from '../../../lib/constants';
import { createTableTab } from '../../../lib/tabFactory';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import type { PinnedConnection } from '../../../stores/editor/types';
import type { ContextSearchAction } from './SearchResultContextMenu';

interface UseContextSearchMenuActionsArgs {
    driver?: string;
    /** Active connection's pool ID (ConnectionProfile.id) — the stable
     * identity a freshly pinned tab should carry. */
    connectionID?: string;
    dbName?: string;
    environmentKey?: string | null;
    addTab: (tabInit?: Record<string, unknown>, targetGroupId?: string) => string;
    onClose: () => void;
    toast: { info: (message: string) => void };
}

export function useContextSearchMenuActions({
    driver,
    connectionID,
    dbName,
    environmentKey,
    addTab,
    onClose,
    toast,
}: UseContextSearchMenuActionsArgs) {
    // Same Pinned Environment (ADR-0001) a table opened from the schema
    // explorer gets — see useExplorerActions.ts. Captured from the current
    // Toolbar context (active profile + env switcher) so a table opened
    // from the palette pins to exactly the connection the explorer would
    // have pinned it to, instead of opening unpinned (no data, wrong
    // dialect, no env badge).
    const pinnedConnection = React.useMemo<PinnedConnection | undefined>(
        () =>
            connectionID && dbName
                ? {
                      connectionID,
                      dbName,
                      driver: driver || '',
                      environmentKey: environmentKey || '',
                  }
                : undefined,
        [connectionID, dbName, driver, environmentKey],
    );

    const runItemAction = React.useCallback(
        async (item: SearchItem, action: ContextSearchAction) => {
            const displayName = `${item.schema}.${item.name}`;
            if (isTableLike(item.kind)) {
                if (action === 'browse' || action === 'open') {
                    addTab(createTableTab(displayName, pinnedConnection));
                    onClose();
                    return;
                }

                if (action === 'select') {
                    addTab({
                        type: TAB_TYPE.QUERY,
                        name: displayName,
                        query: buildSelectTemplate(item, driver),
                    });
                    onClose();
                    return;
                }

                if (action === 'alter') {
                    addTab({
                        type: TAB_TYPE.QUERY,
                        name: `ALTER ${displayName}`,
                        query: buildAlterTemplate(item, driver),
                    });
                    onClose();
                    return;
                }

                const columnsResponse = await getApiGateway().schema.fetchTableColumns(
                    connectionID || '',
                    dbName || '',
                    item.schema,
                    item.name,
                );
                const columns = columnsResponse.ok ? columnsResponse.data : [];
                if ((action === 'insert' || action === 'update') && columns.length === 0) {
                    toast.info(
                        `Could not load columns for ${displayName}. Generated a generic template.`,
                    );
                }

                if (action === 'insert') {
                    addTab({
                        type: TAB_TYPE.QUERY,
                        name: `INSERT ${displayName}`,
                        query: buildInsertTemplate(item, columns, driver),
                    });
                    onClose();
                    return;
                }

                if (action === 'update') {
                    addTab({
                        type: TAB_TYPE.QUERY,
                        name: `UPDATE ${displayName}`,
                        query: buildUpdateTemplate(item, columns, driver),
                    });
                    onClose();
                    return;
                }

                return;
            }

            if (item.kind === 'function' && (action === 'browse' || action === 'open')) {
                addTab({
                    type: TAB_TYPE.QUERY,
                    name: displayName,
                    query: buildFunctionTemplate(item, driver),
                });
                onClose();
                return;
            }

            addTab({
                type: TAB_TYPE.QUERY,
                name: displayName,
                query: buildInfoTemplate(item),
                readOnly: true,
            });
            onClose();
        },
        [addTab, driver, connectionID, dbName, pinnedConnection, onClose, toast],
    );

    return { runItemAction };
}
