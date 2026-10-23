// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMock = vi.hoisted(() => ({
    security: {
        getProSecurityState: vi.fn(),
        configureAppLock: vi.fn(),
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
        unlockAppWithOS: vi.fn(),
        configureSecretVault: vi.fn(),
        unlockSecretVault: vi.fn(),
        lockSecretVault: vi.fn(),
    },
}));

vi.mock('../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => gatewayMock,
}));

import { useSecurityStore } from './securityStore';

function resetStore() {
    useSecurityStore.setState({
        app_lock_enabled: false,
        app_lock_configured: false,
        app_lock_timeout_sec: 300,
        app_locked: false,
        secret_vault_enabled: false,
        secret_vault_ready: false,
        secret_vault_unlocked: true,
        isLoading: false,
        screenshotBlurEnabled: false,
    } as any);
}

function ok<T>(data: T) {
    return { ok: true as const, data };
}

function fail() {
    return { ok: false as const, error: { code: 'security.failed', message: 'boom' } };
}

describe('securityStore', () => {
    beforeEach(() => {
        Object.values(gatewayMock.security).forEach(m => m.mockReset());
        resetStore();
    });

    it('load() populates state from getProSecurityState and clears isLoading', async () => {
        gatewayMock.security.getProSecurityState.mockResolvedValue(
            ok({
                app_lock_enabled: true,
                app_lock_configured: true,
                app_lock_timeout_sec: 600,
                app_locked: false,
                secret_vault_enabled: false,
                secret_vault_ready: false,
                secret_vault_unlocked: true,
            }),
        );

        await useSecurityStore.getState().load();

        const s = useSecurityStore.getState();
        expect(s.isLoading).toBe(false);
        expect(s.app_lock_enabled).toBe(true);
        expect(s.app_lock_timeout_sec).toBe(600);
    });

    it('load() swallows backend errors and clears isLoading', async () => {
        gatewayMock.security.getProSecurityState.mockResolvedValue(fail());

        await useSecurityStore.getState().load();

        const s = useSecurityStore.getState();
        expect(s.isLoading).toBe(false);
        // State remains at fallback (no partial update).
        expect(s.app_lock_enabled).toBe(false);
    });

    it('configureAppLock() merges returned state', async () => {
        gatewayMock.security.configureAppLock.mockResolvedValue(
            ok({
                app_lock_enabled: true,
                app_lock_configured: true,
                app_lock_timeout_sec: 300,
                app_locked: false,
                secret_vault_enabled: false,
                secret_vault_ready: false,
                secret_vault_unlocked: true,
            }),
        );

        await useSecurityStore.getState().configureAppLock(true, 300, 'pin');

        expect(gatewayMock.security.configureAppLock).toHaveBeenCalledWith(true, 300, 'pin');
        expect(useSecurityStore.getState().app_lock_enabled).toBe(true);
    });

    it('lockApp() and unlockApp() flip app_locked through backend response', async () => {
        gatewayMock.security.lockApp.mockResolvedValue(
            ok({
                app_lock_enabled: true,
                app_lock_configured: true,
                app_lock_timeout_sec: 300,
                app_locked: true,
                secret_vault_enabled: false,
                secret_vault_ready: false,
                secret_vault_unlocked: true,
            }),
        );
        await useSecurityStore.getState().lockApp();
        expect(useSecurityStore.getState().app_locked).toBe(true);

        gatewayMock.security.unlockApp.mockResolvedValue(
            ok({
                app_lock_enabled: true,
                app_lock_configured: true,
                app_lock_timeout_sec: 300,
                app_locked: false,
                secret_vault_enabled: false,
                secret_vault_ready: false,
                secret_vault_unlocked: true,
            }),
        );
        await useSecurityStore.getState().unlockApp('1234');
        expect(useSecurityStore.getState().app_locked).toBe(false);
        expect(gatewayMock.security.unlockApp).toHaveBeenCalledWith('1234');
    });

    it('unlockApp() rejects on a wrong PIN instead of silently resolving', async () => {
        gatewayMock.security.unlockApp.mockResolvedValue(fail());

        await expect(useSecurityStore.getState().unlockApp('wrong')).rejects.toThrow();
        // State must not be treated as unlocked on failure.
        expect(useSecurityStore.getState().app_locked).toBe(false);
    });

    it('lockApp/configureAppLock/configureSecretVault/unlockSecretVault/lockSecretVault all reject on backend failure', async () => {
        gatewayMock.security.lockApp.mockResolvedValue(fail());
        await expect(useSecurityStore.getState().lockApp()).rejects.toThrow();

        gatewayMock.security.configureAppLock.mockResolvedValue(fail());
        await expect(
            useSecurityStore.getState().configureAppLock(true, 300, 'pin'),
        ).rejects.toThrow();

        gatewayMock.security.configureSecretVault.mockResolvedValue(fail());
        await expect(
            useSecurityStore.getState().configureSecretVault(true, 'pwd'),
        ).rejects.toThrow();

        gatewayMock.security.unlockSecretVault.mockResolvedValue(fail());
        await expect(useSecurityStore.getState().unlockSecretVault('pwd')).rejects.toThrow();

        gatewayMock.security.lockSecretVault.mockResolvedValue(fail());
        await expect(useSecurityStore.getState().lockSecretVault()).rejects.toThrow();
    });

    it('setScreenshotBlurEnabled() toggles a local-only flag', () => {
        useSecurityStore.getState().setScreenshotBlurEnabled(true);
        expect(useSecurityStore.getState().screenshotBlurEnabled).toBe(true);

        useSecurityStore.getState().setScreenshotBlurEnabled(false);
        expect(useSecurityStore.getState().screenshotBlurEnabled).toBe(false);
    });

    it('configureSecretVault/unlockSecretVault/lockSecretVault all merge returned state', async () => {
        const respond = ok({
            app_lock_enabled: false,
            app_lock_configured: false,
            app_lock_timeout_sec: 300,
            app_locked: false,
            secret_vault_enabled: true,
            secret_vault_ready: true,
            secret_vault_unlocked: true,
        });
        gatewayMock.security.configureSecretVault.mockResolvedValue(respond);
        gatewayMock.security.unlockSecretVault.mockResolvedValue(respond);
        gatewayMock.security.lockSecretVault.mockResolvedValue(respond);

        await useSecurityStore.getState().configureSecretVault(true, 'pwd');
        expect(gatewayMock.security.configureSecretVault).toHaveBeenCalledWith(true, 'pwd');
        expect(useSecurityStore.getState().secret_vault_enabled).toBe(true);

        // Reset to make sure subsequent calls also merge.
        resetStore();
        await useSecurityStore.getState().unlockSecretVault('pwd');
        expect(useSecurityStore.getState().secret_vault_enabled).toBe(true);

        resetStore();
        await useSecurityStore.getState().lockSecretVault();
        expect(useSecurityStore.getState().secret_vault_enabled).toBe(true);
    });
});
