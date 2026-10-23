// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import {
    onConnectionChanged,
    onQueryDone,
    onQueryStarted,
    onSchemaLoaded,
    onSchemaError,
    onTransactionStatus,
} from '../../lib/events';
import { useLogStore, LogLevel, RealtimeLogKind } from '../../stores/logStore';
import type { RealtimeLogEvent } from '../../stores/logStore';

let _seq = 0;
function nextId(): string {
    return `log-${Date.now()}-${++_seq}`;
}

export function useLogEventBridge() {
    useEffect(() => {
        const append = (e: RealtimeLogEvent) => useLogStore.getState().appendEvent(e);

        const subs = [
            onQueryStarted(p =>
                append({
                    id: nextId(),
                    ts: Date.now(),
                    level: LogLevel.INFO,
                    kind: RealtimeLogKind.QUERY_STARTED,
                    message: `Query started [${p.statementIndex + 1}/${p.statementCount}] ${p.statementText || p.query}`,
                    payload: p,
                }),
            ),
            onQueryDone(p =>
                append({
                    id: nextId(),
                    ts: Date.now(),
                    level: p.error ? LogLevel.ERROR : LogLevel.INFO,
                    kind: RealtimeLogKind.QUERY_DONE,
                    message: p.error
                        ? `Query failed: ${p.error}`
                        : `Query done (${p.duration}ms, ${p.affected} rows)`,
                    payload: p,
                }),
            ),
            onConnectionChanged(p =>
                append({
                    id: nextId(),
                    ts: Date.now(),
                    level: p.status === 'error' ? LogLevel.ERROR : LogLevel.INFO,
                    kind: RealtimeLogKind.CONNECTION_CHANGED,
                    message: `Connection: ${p.status}${p.profile ? ` — ${p.profile.name}` : ''}`,
                    payload: p,
                }),
            ),
            onSchemaLoaded(p =>
                append({
                    id: nextId(),
                    ts: Date.now(),
                    level: LogLevel.INFO,
                    kind: RealtimeLogKind.SCHEMA_LOADED,
                    message: `Schema loaded: ${p.dbName}`,
                    payload: p,
                }),
            ),
            onSchemaError(p =>
                append({
                    id: nextId(),
                    ts: Date.now(),
                    level: LogLevel.ERROR,
                    kind: RealtimeLogKind.SCHEMA_ERROR,
                    message: `Schema error: ${p.dbName} — ${p.error}`,
                    payload: p,
                }),
            ),
            onTransactionStatus(p =>
                append({
                    id: nextId(),
                    ts: Date.now(),
                    level: p.status === 'error' ? LogLevel.ERROR : LogLevel.INFO,
                    kind: RealtimeLogKind.TX_STATUS,
                    message: `Transaction: ${p.status}${p.error ? ` — ${p.error}` : ''}`,
                    payload: p,
                }),
            ),
        ];

        return () => subs.forEach(unsub => unsub());
    }, []);
}
