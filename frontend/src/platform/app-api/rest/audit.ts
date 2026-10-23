// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { AuditAdapter } from '../contracts/audit';
import type { RestHttpClient } from './httpClient';
import type { app } from '../../../../wailsjs/go/models';

export function createAuditRestAdapter(client: RestHttpClient): AuditAdapter {
    return withKernelResult('audit', {
        getSQLAuditLog: (filter: app.SQLAuditFilter) =>
            client.call<app.SQLAuditEntry[]>('/audit/get-sql-audit-log', { filter }),
        clearSQLAuditLog: () => client.call<void>('/audit/clear-sql-audit-log'),
        exportSQLAuditLog: (format: string) =>
            client.call<string>('/audit/export-sql-audit-log', { format }),
        pinAuditEntry: (id: string, pinned: boolean) =>
            client.call<void>('/audit/pin-entry', { id, pinned }),
        getAuditLogPath: () => client.call<string>('/audit/get-audit-log-path'),
        getAppDebugLog: (opts: app.AppDebugLogOpts) =>
            client.call<app.AppDebugLogEntry[]>('/audit/get-app-debug-log', { opts }),
        getAppDebugLogPath: () => client.call<string>('/audit/get-app-debug-log-path'),
        logClientEvent: (message: string, fields: Record<string, string>) =>
            client.call<void>('/audit/log-client-event', { message, fields }),
    });
}
