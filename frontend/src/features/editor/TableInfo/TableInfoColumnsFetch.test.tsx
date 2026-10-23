// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../../platform/apiGatewayRuntime';
import { useEditorStore } from '../../../stores/editorStore';
import { useSchemaStore } from '../../../stores/schemaStore';
import { TAB_TYPE } from '../../../lib/constants';
import { models } from '../../../../wailsjs/go/models';
import { ToastProvider } from '../../../components/layout/Toast';
import { TableInfo } from './TableInfo';

const CONNECTION_ID = 'conn-abc';
const DB_NAME = 'TSERPDEV';
const SCHEMA = 'dbo';
const TABLE = 'Customer';
const TAB_ID = 'tab-1';
const CACHE_KEY = `${CONNECTION_ID}:${DB_NAME}:${SCHEMA}:${TABLE}`;

function makeColumn(name: string) {
    return models.ColumnDef.createFrom({
        Name: name,
        DataType: 'text',
        IsPrimaryKey: false,
        IsNullable: true,
        DefaultValue: '',
    });
}

function installGateway() {
    const fetchTableColumns = vi.fn(async () => ({
        ok: true as const,
        data: [makeColumn('No_')],
    }));
    setApiGateway({
        schema: {
            fetchTableColumns,
            buildQualifiedTableSelect: vi.fn(async () => ({
                ok: true as const,
                data: `SELECT * FROM [${SCHEMA}].[${TABLE}]`,
            })),
            fetchDatabaseSchema: vi.fn(async () => ({ ok: true as const, data: undefined })),
        },
        connection: {
            pinTab: vi.fn(async () => ({ ok: true as const, data: undefined })),
            unpinTab: vi.fn(async () => ({ ok: true as const, data: undefined })),
        },
        query: {
            executePinnedQuery: vi.fn(async () => ({ ok: true as const, data: undefined })),
            execute: vi.fn(async () => ({ ok: true as const, data: undefined })),
            closeWritePreview: vi.fn(async () => ({ ok: true as const, data: undefined })),
        },
        audit: { logClientEvent: vi.fn(async () => ({ ok: true as const, data: undefined })) },
        imageColumn: {
            getImageColumnsForConnection: vi.fn(async () => ({ ok: true as const, data: {} })),
            getImageColumnsByConnection: vi.fn(async () => ({ ok: true as const, data: {} })),
            getImageColumns: vi.fn(async () => ({ ok: true as const, data: [] })),
            saveImageColumns: vi.fn(async () => ({ ok: true as const, data: undefined })),
        },
    } as unknown as ApiGateway);
    return { fetchTableColumns };
}

function tableTab() {
    return {
        id: TAB_ID,
        name: `Table: ${TABLE}`,
        query: '',
        isRunning: false,
        type: TAB_TYPE.TABLE,
        content: `${SCHEMA}.${TABLE}`,
        connection: {
            connectionID: CONNECTION_ID,
            dbName: DB_NAME,
            driver: 'sqlserver',
            environmentKey: 'dev',
        },
    };
}

function seedTableTab() {
    const groups = [{ id: 'group-1', tabs: [tableTab()], activeTabId: TAB_ID }];
    useEditorStore.setState({
        projectSessions: {
            __default__: { groups, activeGroupId: 'group-1' },
        },
        activeProjectId: '__default__',
        groups,
        activeGroupId: 'group-1',
    });
}

describe('TableInfo column loading', () => {
    beforeEach(() => {
        useSchemaStore.setState({
            trees: {},
            cachedColumns: {},
            cachedRelationships: {},
            pendingColumnRequests: {},
            pendingRelationshipRequests: {},
            loadingKeys: new Set(),
        });
        seedTableTab();
    });

    afterEach(() => {
        resetApiGateway();
    });

    // Regression guard for the duplicated "fetching table columns" backend
    // log. TableInfo used to call the gateway directly, bypassing
    // schemaStore's dedupe + TTL cache, so every mount / retry / post-save
    // reload for the same table spent its own round trip. Reading through the
    // store is what collapses those into one call; both halves of that are
    // asserted here, because either one failing reintroduces the duplicates.
    it('loads table columns through the shared schema cache', async () => {
        const gateway = installGateway();

        render(
            React.createElement(
                ToastProvider,
                null,
                React.createElement(TableInfo, {
                    tabId: TAB_ID,
                    tableName: `${SCHEMA}.${TABLE}`,
                }),
            ),
        );

        await waitFor(() => {
            expect(gateway.fetchTableColumns).toHaveBeenCalled();
        });

        expect(gateway.fetchTableColumns).toHaveBeenCalledTimes(1);
        expect(gateway.fetchTableColumns).toHaveBeenCalledWith(
            CONNECTION_ID,
            DB_NAME,
            SCHEMA,
            TABLE,
        );

        // The fetch went through the store, so the result is now cached and a
        // later load for this same table is free.
        const cached = useSchemaStore.getState().cachedColumns[CACHE_KEY];
        expect(cached).toBeDefined();
        expect(cached?.columns.map(column => column.Name)).toEqual(['No_']);
    });
});
