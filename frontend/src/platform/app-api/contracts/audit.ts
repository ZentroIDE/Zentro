// SPDX-License-Identifier: GPL-3.0-only

import type { app } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';

export interface AuditAdapter {
    getSQLAuditLog(filter: app.SQLAuditFilter): Promise<KernelResult<app.SQLAuditEntry[]>>;
    clearSQLAuditLog(): Promise<KernelResult<void>>;
    exportSQLAuditLog(format: string): Promise<KernelResult<string>>;
    pinAuditEntry(id: string, pinned: boolean): Promise<KernelResult<void>>;
    getAuditLogPath(): Promise<KernelResult<string>>;
    getAppDebugLog(opts: app.AppDebugLogOpts): Promise<KernelResult<app.AppDebugLogEntry[]>>;
    getAppDebugLogPath(): Promise<KernelResult<string>>;
    /** Writes an FE-originated event into the same app log as backend
     *  events (tagged "[fe]"), for reading a click-to-data-loaded timeline
     *  as one ordered stream. Temporary diagnostic aid — fire-and-forget,
     *  callers should not await/handle failures. */
    logClientEvent(message: string, fields: Record<string, string>): Promise<KernelResult<void>>;
}
