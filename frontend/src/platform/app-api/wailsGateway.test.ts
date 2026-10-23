// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_STATUS } from '../../lib/constants';

const { getConnectionStatusMock, fetchSchemaSnapshotMock } = vi.hoisted(() => ({
    getConnectionStatusMock: vi.fn(),
    fetchSchemaSnapshotMock: vi.fn(),
}));

vi.mock('../../../wailsjs/go/app/App', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../wailsjs/go/app/App')>();
    return {
        ...actual,
        GetConnectionStatus: getConnectionStatusMock,
        FetchSchemaSnapshot: fetchSchemaSnapshotMock,
    };
});

import { wailsGateway } from './wailsGateway';

describe('wailsGateway', () => {
    beforeEach(() => {
        getConnectionStatusMock.mockReset();
        fetchSchemaSnapshotMock.mockReset();
    });

    it('normalizes raw connection status payload', async () => {
        getConnectionStatusMock.mockResolvedValue({
            status: CONNECTION_STATUS.CONNECTED,
            profile: {
                name: 'local-dev',
                driver: 'postgres',
                host: 'localhost',
                port: 5432,
                db_name: 'main',
                username: 'admin',
                password: '',
                ssl_mode: 'disable',
                connect_timeout: 10,
                save_password: true,
                encrypt_password: true,
                show_all_schemas: true,
                trust_server_cert: false,
            },
        });

        const status = await wailsGateway.GetConnectionStatus();

        expect(status.status).toBe(CONNECTION_STATUS.CONNECTED);
        expect(status.profile?.name).toBe('local-dev');
        expect(status.profile?.driver).toBe('postgres');
    });

    it('falls back to disconnected when payload is invalid', async () => {
        getConnectionStatusMock.mockResolvedValue({ status: 'random-value' });

        const status = await wailsGateway.GetConnectionStatus();

        expect(status.status).toBe(CONNECTION_STATUS.DISCONNECTED);
        expect(status.profile).toBeNull();
    });

    it('maps schema diff objects including views from snapshot payload', async () => {
        fetchSchemaSnapshotMock.mockResolvedValue({
            driver: 'mssql',
            profileName: 'dev',
            databaseName: 'Budget',
            schemaName: 'dbo',
            label: 'DEV / dbo',
            capturedAt: '2026-05-27T12:00:00Z',
            tables: [
                {
                    name: 'budgets',
                    ddl: 'CREATE TABLE dbo.budgets(id int);',
                    columns: [],
                },
            ],
            indexes: [
                {
                    name: 'ix_budgets_id',
                    tableName: 'budgets',
                    ddl: 'CREATE INDEX ix_budgets_id ON dbo.budgets(id);',
                },
            ],
            constraints: [
                {
                    name: 'pk_budgets',
                    tableName: 'budgets',
                    type: 'PRIMARY KEY',
                    ddl: 'ALTER TABLE dbo.budgets ADD CONSTRAINT pk_budgets PRIMARY KEY (id);',
                },
            ],
            views: [
                {
                    name: 'BudgetViewV2',
                    ddl: 'CREATE VIEW dbo.BudgetViewV2 AS SELECT 1 AS id;',
                },
            ],
            routines: [
                {
                    name: 'usp_budget_sync',
                    signature: 'dbo.usp_budget_sync()',
                    ddl: 'CREATE PROCEDURE dbo.usp_budget_sync AS SELECT 1;',
                },
            ],
            normalizedDdl: 'normalized',
            supported: true,
        });

        const snapshot = await wailsGateway.FetchSchemaSnapshot('dev', 'Budget', 'dbo');

        expect(snapshot.views).toEqual([
            {
                name: 'BudgetViewV2',
                ddl: 'CREATE VIEW dbo.BudgetViewV2 AS SELECT 1 AS id;',
            },
        ]);
        expect(snapshot.indexes?.[0]?.name).toBe('ix_budgets_id');
        expect(snapshot.constraints?.[0]?.name).toBe('pk_budgets');
        expect(snapshot.routines?.[0]?.name).toBe('usp_budget_sync');
    });
});
