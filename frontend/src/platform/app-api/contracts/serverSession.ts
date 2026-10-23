// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';

/** Mirrors internal/app/server_session_service.go's ServerSessionView — one
 *  row of the database server's own session/process list (not a Zentro
 *  job — see job.ts for those). Not supported for SQLite (no server to
 *  list sessions on). */
export interface ServerSession {
    id: string;
    user: string;
    database: string;
    client: string;
    state: string;
    startedAt: string;
    durationMs: number;
    wait: string;
    query: string;
    /** True when this session is a connection Zentro itself currently
     *  holds (a pinned query tab, or a running export/import job). */
    isSelf: boolean;
}

export interface ServerSessionAdapter {
    list(): Promise<KernelResult<ServerSession[]>>;
    /** Soft-cancels a session's current statement, leaving the session
     *  open. */
    cancel(sessionId: string): Promise<KernelResult<void>>;
    /** Force-ends a session entirely, rolling back any open transaction. */
    kill(sessionId: string): Promise<KernelResult<void>>;
}
