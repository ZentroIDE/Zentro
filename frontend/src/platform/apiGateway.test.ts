// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { RestApiGateway, WailsApiGateway, createApiGateway } from './apiGateway';
import type { AuthProvider } from '../features/auth/authContracts';

describe('WailsApiGateway', () => {
    const gateway = new WailsApiGateway();

    it('has mode set to local', () => {
        expect(gateway.mode).toBe('local');
    });

    it('has all domain adapters defined', () => {
        expect(gateway.connection).toBeDefined();
        expect(gateway.query).toBeDefined();
        expect(gateway.schema).toBeDefined();
        expect(gateway.project).toBeDefined();
        expect(gateway.security).toBeDefined();
        expect(gateway.settings).toBeDefined();
        expect(gateway.sourceControl).toBeDefined();
        expect(gateway.audit).toBeDefined();
        expect(gateway.template).toBeDefined();
        expect(gateway.script).toBeDefined();
        expect(gateway.bookmark).toBeDefined();
        expect(gateway.license).toBeDefined();
        expect(gateway.plugin).toBeDefined();
        expect(gateway.queryStats).toBeDefined();
    });

    it('has connection adapter with expected methods', () => {
        expect(typeof gateway.connection.connect).toBe('function');
        expect(typeof gateway.connection.disconnect).toBe('function');
        expect(typeof gateway.connection.loadConnections).toBe('function');
        expect(typeof gateway.connection.testConnection).toBe('function');
    });

    it('has query adapter with expected methods', () => {
        expect(typeof gateway.query.execute).toBe('function');
        expect(typeof gateway.query.cancel).toBe('function');
        expect(typeof gateway.query.formatSQL).toBe('function');
    });

    it('has project adapter with expected methods', () => {
        expect(typeof gateway.project.listProjects).toBe('function');
        expect(typeof gateway.project.createProject).toBe('function');
        expect(typeof gateway.project.forceQuit).toBe('function');
    });

    it('has source control adapter', () => {
        expect(typeof gateway.sourceControl.getStatus).toBe('function');
        expect(typeof gateway.sourceControl.commit).toBe('function');
    });
});

describe('RestApiGateway', () => {
    const provider: AuthProvider = {
        id: 'auth.test',
        label: 'Auth Test',
        login: async () => ({ success: true }),
        logout: async () => undefined,
        getSession: async () => ({
            user: {
                id: 'u1',
                email: 'test@example.com',
                name: 'Test User',
            },
            token: 'session-token',
            expiresAt: Date.now() + 60_000,
            permissions: [],
            scope: 'team',
        }),
        refreshSession: async () => null,
    };

    it('uses team mode and forwards auth header for REST requests', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ['main'],
        });
        const gateway = new RestApiGateway('https://api.example.com', provider, fetchImpl);

        expect(gateway.mode).toBe('team');
        await expect(gateway.sourceControl.listBranches()).resolves.toEqual({
            ok: true,
            data: ['main'],
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.example.com/source-control/list-branches',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer session-token',
                }),
            }),
        );
    });

    it('throws when createApiGateway is asked for non-local mode without base url', () => {
        expect(() => createApiGateway({ mode: 'team' })).toThrow(
            'restBaseUrl is required for non-local api gateways',
        );
    });

    it('creates the correct gateway implementation for each mode', () => {
        expect(createApiGateway()).toBeInstanceOf(WailsApiGateway);
        expect(
            createApiGateway({
                mode: 'enterprise',
                restBaseUrl: 'https://api.example.com',
                fetchImpl: vi.fn(),
            }),
        ).toBeInstanceOf(RestApiGateway);
    });
});
