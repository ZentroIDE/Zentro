// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthProvider, AuthSession } from '../features/auth/authContracts';
import {
    configureApiGateway,
    getApiGateway,
    resetApiGateway,
    resolveApiGatewayMode,
} from './apiGatewayRuntime';
import { RestApiGateway, WailsApiGateway } from './apiGateway';

afterEach(() => {
    resetApiGateway();
});

const provider: AuthProvider = {
    id: 'auth.test',
    label: 'Auth Test',
    login: async () => ({ success: true }),
    logout: async () => undefined,
    getSession: async () => null,
    refreshSession: async () => null,
};

function createSession(scope: AuthSession['scope']): AuthSession {
    return {
        user: {
            id: 'u1',
            email: 'test@example.com',
            name: 'Test User',
        },
        token: 'token-123',
        expiresAt: Date.now() + 60_000,
        permissions: [],
        scope,
    };
}

describe('apiGatewayRuntime', () => {
    it('resolves local mode when no session exists', () => {
        expect(resolveApiGatewayMode(null)).toBe('local');
    });

    it('resolves team and enterprise modes from auth session scope', () => {
        expect(resolveApiGatewayMode(createSession('team'))).toBe('team');
        expect(resolveApiGatewayMode(createSession('enterprise'))).toBe('enterprise');
    });

    it('falls back to local gateway when non-local session has no base url', () => {
        const gateway = configureApiGateway({
            provider,
            session: createSession('team'),
            restBaseUrl: '',
        });

        expect(gateway).toBeInstanceOf(WailsApiGateway);
        expect(getApiGateway()).toBeInstanceOf(WailsApiGateway);
    });

    it('configures a rest gateway when non-local session and base url are available', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
        });

        const gateway = configureApiGateway({
            provider: {
                ...provider,
                getSession: async () => createSession('team'),
            },
            session: createSession('team'),
            restBaseUrl: 'https://api.example.com',
            fetchImpl,
        });

        expect(gateway).toBeInstanceOf(RestApiGateway);
        await gateway.query.execute('tab-1', 'select 1');
        expect(fetchImpl).toHaveBeenCalled();
    });
});
