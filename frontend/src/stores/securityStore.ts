// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import type { ProSecurityState } from '../platform/app-api/types';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';

const FALLBACK_STATE: ProSecurityState = {
    app_lock_enabled: false,
    app_lock_configured: false,
    app_lock_timeout_sec: 300,
    app_locked: false,
    secret_vault_enabled: false,
    secret_vault_ready: false,
    secret_vault_unlocked: true,
};

interface SecurityStoreState extends ProSecurityState {
    isLoading: boolean;
    screenshotBlurEnabled: boolean;
    load: () => Promise<void>;
    configureAppLock: (enabled: boolean, timeoutSec: number, pin: string) => Promise<void>;
    lockApp: () => Promise<void>;
    unlockApp: (pin: string) => Promise<void>;
    unlockAppWithOS: () => Promise<void>;
    configureSecretVault: (enabled: boolean, password: string) => Promise<void>;
    unlockSecretVault: (password: string) => Promise<void>;
    lockSecretVault: () => Promise<void>;
    setScreenshotBlurEnabled: (enabled: boolean) => void;
}

function applyState(state: SecurityStoreState, next?: ProSecurityState | void) {
    return {
        ...state,
        ...(next || {}),
        isLoading: false,
    };
}

export const useSecurityStore = create<SecurityStoreState>((set, get) => ({
    ...FALLBACK_STATE,
    isLoading: false,
    screenshotBlurEnabled: false,
    load: async () => {
        set({ isLoading: true });
        const result = await getApiGateway().security.getProSecurityState?.();
        if (result?.ok) {
            set(state => applyState(state, result.data));
        } else {
            set({ isLoading: false });
        }
    },
    configureAppLock: async (enabled, timeoutSec, pin) => {
        const result = await getApiGateway().security.configureAppLock?.(enabled, timeoutSec, pin);
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    lockApp: async () => {
        const result = await getApiGateway().security.lockApp?.();
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    unlockApp: async pin => {
        const result = await getApiGateway().security.unlockApp?.(pin);
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    unlockAppWithOS: async () => {
        const result = await getApiGateway().security.unlockAppWithOS?.();
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    configureSecretVault: async (enabled, password) => {
        const result = await getApiGateway().security.configureSecretVault?.(enabled, password);
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    unlockSecretVault: async password => {
        const result = await getApiGateway().security.unlockSecretVault?.(password);
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    lockSecretVault: async () => {
        const result = await getApiGateway().security.lockSecretVault?.();
        if (result === undefined) return;
        set(state => applyState(state, unwrapOrThrow(result)));
    },
    setScreenshotBlurEnabled: enabled => set({ screenshotBlurEnabled: enabled }),
}));
