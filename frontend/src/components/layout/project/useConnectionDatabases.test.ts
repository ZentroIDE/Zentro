// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useConnectionDatabases } from './useConnectionDatabases';
import type { ConnectionProfile } from '../../../types/connection';

const loadDatabasesForConnection = vi.fn();

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            loadDatabasesForConnection,
        },
    }),
}));

vi.mock('../../../../wailsjs/go/models', () => ({
    models: {
        ConnectionProfile: class {
            constructor(data: Partial<ConnectionProfile>) {
                Object.assign(this, data);
            }
        },
    },
}));

function makeProfile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
    return {
        name: 'dev-pg',
        driver: 'postgres',
        host: 'localhost',
        port: 5432,
        db_name: 'appdb',
        username: 'u',
        password: '',
        connect_timeout: 10,
        save_password: true,
        show_all_schemas: false,
        trust_server_cert: false,
        ...overrides,
    };
}

describe('useConnectionDatabases', () => {
    beforeEach(() => {
        loadDatabasesForConnection.mockReset();
    });

    it('starts with an empty entry for an unloaded connection', () => {
        const { result } = renderHook(() => useConnectionDatabases());
        expect(result.current.getEntry('dev-pg')).toEqual({
            databases: [],
            loading: false,
            error: null,
        });
    });

    it('loads and stores databases for a connection', async () => {
        loadDatabasesForConnection.mockResolvedValue({
            ok: true,
            data: ['appdb', 'appdb_staging'],
        });
        const { result } = renderHook(() => useConnectionDatabases());

        await act(async () => {
            await result.current.load(makeProfile());
        });

        expect(result.current.getEntry('dev-pg')).toEqual({
            databases: ['appdb', 'appdb_staging'],
            loading: false,
            error: null,
        });
    });

    it('does not re-fetch a connection that is already loading', async () => {
        let resolveFirst: (value: { ok: true; data: string[] }) => void = () => {};
        loadDatabasesForConnection.mockReturnValueOnce(
            new Promise(resolve => {
                resolveFirst = resolve;
            }),
        );

        const { result } = renderHook(() => useConnectionDatabases());
        const profile = makeProfile();

        act(() => {
            void result.current.load(profile);
            void result.current.load(profile);
        });

        expect(loadDatabasesForConnection).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveFirst({ ok: true, data: ['appdb'] });
        });
    });

    it('surfaces an error message and leaves databases empty on failure', async () => {
        loadDatabasesForConnection.mockResolvedValue({
            ok: false,
            error: { message: 'connection refused' },
        });
        const { result } = renderHook(() => useConnectionDatabases());

        await act(async () => {
            await result.current.load(makeProfile());
        });

        await waitFor(() => {
            expect(result.current.getEntry('dev-pg').error).toBe('connection refused');
        });
        expect(result.current.getEntry('dev-pg').databases).toEqual([]);
    });

    it('loadAll fetches every connection with a name', async () => {
        loadDatabasesForConnection.mockResolvedValue({ ok: true, data: [] });
        const { result } = renderHook(() => useConnectionDatabases());

        act(() => {
            result.current.loadAll([
                makeProfile({ name: 'a' }),
                makeProfile({ name: 'b' }),
                makeProfile({ name: '' }),
            ]);
        });

        await waitFor(() => expect(loadDatabasesForConnection).toHaveBeenCalledTimes(2));
    });
});
