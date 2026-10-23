// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import type { AuthProvider, AuthSession } from './authContracts';

interface AuthState {
    provider: AuthProvider | null;
    session: AuthSession | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    setProvider: (provider: AuthProvider) => void;
    setSession: (session: AuthSession | null) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
    provider: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,

    setProvider: provider => set({ provider }),
    setSession: session => set({ session, isAuthenticated: session !== null }),
    setLoading: isLoading => set({ isLoading }),
    setError: error => set({ error }),
    clearAuth: () => set({ session: null, isAuthenticated: false, error: null }),
}));
