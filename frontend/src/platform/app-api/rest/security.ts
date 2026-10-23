// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { SecurityAdapter } from '../contracts/security';
import type { RestHttpClient } from './httpClient';
import type { ProSecurityState } from '../types';

export function createSecurityRestAdapter(client: RestHttpClient): SecurityAdapter {
    return withKernelResult('security', {
        getProSecurityState: () =>
            client.call<ProSecurityState>('/security/get-pro-security-state'),
        configureAppLock: (enabled: boolean, timeoutSec: number, pin: string) =>
            client.call<ProSecurityState>('/security/configure-app-lock', {
                enabled,
                timeoutSec,
                pin,
            }),
        lockApp: () => client.call<ProSecurityState>('/security/lock-app'),
        unlockApp: (pin: string) => client.call<ProSecurityState>('/security/unlock-app', { pin }),
        unlockAppWithOS: () => client.call<ProSecurityState>('/security/unlock-app-with-os'),
        configureSecretVault: (enabled: boolean, password: string) =>
            client.call<ProSecurityState>('/security/configure-secret-vault', {
                enabled,
                password,
            }),
        unlockSecretVault: (password: string) =>
            client.call<ProSecurityState>('/security/unlock-secret-vault', { password }),
        lockSecretVault: () => client.call<ProSecurityState>('/security/lock-secret-vault'),
    });
}
