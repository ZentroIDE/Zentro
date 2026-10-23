// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import type { AuthProvider, AuthSession, UserInfo } from './authContracts';

const mockUser: UserInfo = { id: 'u1', email: 'test@test.com', name: 'Test' };
const mockSession: AuthSession = {
    user: mockUser,
    token: 'tok_123',
    expiresAt: Date.now() + 3600000,
    permissions: ['query.execute', 'schema.view'],
    scope: 'local',
};

const mockProvider: AuthProvider = {
    id: 'mock',
    label: 'Mock',
    login: async () => ({ success: true, session: mockSession }),
    logout: async () => {},
    getSession: async () => mockSession,
    refreshSession: async () => mockSession,
};

describe('authStore', () => {
    beforeEach(() => {
        useAuthStore.setState({
            provider: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
        });
    });

    it('starts unauthenticated', () => {
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.session).toBeNull();
    });

    it('sets session and marks authenticated', () => {
        useAuthStore.getState().setSession(mockSession);
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(true);
        expect(state.session?.user.email).toBe('test@test.com');
    });

    it('clears session on logout', () => {
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().clearAuth();
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.session).toBeNull();
    });

    it('sets provider', () => {
        useAuthStore.getState().setProvider(mockProvider);
        expect(useAuthStore.getState().provider?.id).toBe('mock');
    });

    it('manages loading state', () => {
        useAuthStore.getState().setLoading(true);
        expect(useAuthStore.getState().isLoading).toBe(true);
        useAuthStore.getState().setLoading(false);
        expect(useAuthStore.getState().isLoading).toBe(false);
    });
});
