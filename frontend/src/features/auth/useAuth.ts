// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from './authStore';
import type { UserInfo } from './authContracts';

export function useAuth() {
    const store = useAuthStore();
    const initRef = useRef(false);

    useEffect(() => {
        if (initRef.current || !store.provider) return;
        initRef.current = true;

        store.provider
            .getSession()
            .then(session => {
                store.setSession(session);
            })
            .catch(() => {
                store.setSession(null);
            });
    }, [store.provider]);

    const login = useCallback(
        async (credentials?: Record<string, unknown>) => {
            if (!store.provider) return;
            store.setLoading(true);
            store.setError(null);

            try {
                const result = await store.provider.login(credentials);
                if (result.success && result.session) {
                    store.setSession(result.session);
                } else {
                    store.setError(result.error || 'Login failed');
                }
            } catch (error) {
                store.setError(error instanceof Error ? error.message : 'Login failed');
            } finally {
                store.setLoading(false);
            }
        },
        [store.provider],
    );

    const logout = useCallback(async () => {
        if (!store.provider) return;
        store.setLoading(true);
        try {
            await store.provider.logout();
        } finally {
            store.clearAuth();
            store.setLoading(false);
        }
    }, [store.provider]);

    const hasPermission = useCallback(
        (permission: string): boolean => {
            if (!store.session) return false;
            return store.session.permissions.includes(permission);
        },
        [store.session],
    );

    return {
        isAuthenticated: store.isAuthenticated,
        user: store.session?.user ?? null,
        session: store.session,
        isLoading: store.isLoading,
        error: store.error,
        login,
        logout,
        hasPermission,
    } as const;
}
