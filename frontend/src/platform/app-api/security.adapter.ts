// SPDX-License-Identifier: GPL-3.0-only

import {
    GetSQLAuditLog,
    ClearSQLAuditLog,
    ExportSQLAuditLog,
    PinAuditEntry,
    GetAuditLogPath,
    GetAppDebugLog,
    GetAppDebugLogPath,
    LogClientEvent,
} from '../../../wailsjs/go/app/App';
import type { ProSecurityState } from './types';
import { optionalWailsBinding } from './wailsOptionalBinding';

// App lock / secret vault are Pro (internal/app/pro_security_facade.go) —
// absent from a build exported without that file.
const GetProSecurityState = optionalWailsBinding<() => Promise<unknown>>('GetProSecurityState');
const ConfigureAppLock =
    optionalWailsBinding<(enabled: boolean, timeoutSec: number, pin: string) => Promise<unknown>>(
        'ConfigureAppLock',
    );
const LockApp = optionalWailsBinding<() => Promise<unknown>>('LockApp');
const UnlockApp = optionalWailsBinding<(pin: string) => Promise<unknown>>('UnlockApp');
const UnlockAppWithOS = optionalWailsBinding<() => Promise<unknown>>('UnlockAppWithOS');
const ConfigureSecretVault =
    optionalWailsBinding<(enabled: boolean, password: string) => Promise<unknown>>(
        'ConfigureSecretVault',
    );
const UnlockSecretVault =
    optionalWailsBinding<(password: string) => Promise<unknown>>('UnlockSecretVault');
const LockSecretVault = optionalWailsBinding<() => Promise<unknown>>('LockSecretVault');

function toRecord(raw: unknown): Record<string, unknown> | undefined {
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

function mapProSecurityState(raw: Record<string, unknown> | null | undefined): ProSecurityState {
    return {
        app_lock_enabled: raw?.app_lock_enabled === true,
        app_lock_configured: raw?.app_lock_configured === true,
        app_lock_timeout_sec:
            typeof raw?.app_lock_timeout_sec === 'number' ? raw.app_lock_timeout_sec : 300,
        app_locked: raw?.app_locked === true,
        secret_vault_enabled: raw?.secret_vault_enabled === true,
        secret_vault_ready: raw?.secret_vault_ready === true,
        secret_vault_unlocked: raw?.secret_vault_unlocked === true,
    };
}

export const securityAdapter = {
    ...(GetProSecurityState
        ? {
              GetProSecurityState: async () =>
                  mapProSecurityState(toRecord(await GetProSecurityState())),
          }
        : {}),
    ...(ConfigureAppLock
        ? {
              ConfigureAppLock: async (enabled: boolean, timeoutSec: number, pin: string) =>
                  mapProSecurityState(toRecord(await ConfigureAppLock(enabled, timeoutSec, pin))),
          }
        : {}),
    ...(LockApp ? { LockApp: async () => mapProSecurityState(toRecord(await LockApp())) } : {}),
    ...(UnlockApp
        ? { UnlockApp: async (pin: string) => mapProSecurityState(toRecord(await UnlockApp(pin))) }
        : {}),
    ...(UnlockAppWithOS
        ? { UnlockAppWithOS: async () => mapProSecurityState(toRecord(await UnlockAppWithOS())) }
        : {}),
    ...(ConfigureSecretVault
        ? {
              ConfigureSecretVault: async (enabled: boolean, password: string) =>
                  mapProSecurityState(toRecord(await ConfigureSecretVault(enabled, password))),
          }
        : {}),
    ...(UnlockSecretVault
        ? {
              UnlockSecretVault: async (password: string) =>
                  mapProSecurityState(toRecord(await UnlockSecretVault(password))),
          }
        : {}),
    ...(LockSecretVault
        ? { LockSecretVault: async () => mapProSecurityState(toRecord(await LockSecretVault())) }
        : {}),
    GetSQLAuditLog,
    ClearSQLAuditLog,
    ExportSQLAuditLog,
    PinAuditEntry,
    GetAuditLogPath,
    GetAppDebugLog,
    GetAppDebugLogPath,
    LogClientEvent,
};
