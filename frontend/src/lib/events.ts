// SPDX-License-Identifier: GPL-3.0-only

/**
 * events.ts — Typed Wails event constants and listener helpers.
 * All frontend event subscriptions should go through this file
 * to avoid string typos and untyped callbacks.
 */
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { ConnectionStatus, TRANSACTION_STATUS } from './constants';
import type { ConnectionProfile } from '../types/connection';
import type { Job } from '../platform/app-api/contracts/job';
import type { LatencyState, StatsSample } from '../platform/app-api/contracts/stats';

// ── Event name constants ──────────────────────────────────────────────────

export const EVENT = {
    CONNECTION_CHANGED: 'connection:changed',
    CONNECTION_UPDATED: 'connection:updated',
    SCHEMA_DATABASES: 'schema:databases',
    SCHEMA_LOADED: 'schema:loaded',
    SCHEMA_ERROR: 'schema:error',
    QUERY_STARTED: 'query:started',
    QUERY_CHUNK: 'query:chunk',
    QUERY_DONE: 'query:done',
    QUERY_COUNT: 'query:count',
    QUERY_RANGE: 'query:range',
    QUERY_MESSAGE: 'query:message',
    TRANSACTION_STATUS: 'transaction:status',
    LICENSE_STATE_CHANGED: 'license:state-changed',
    AUDIT_UPDATED: 'audit:updated',
    QUERY_TRANSACTION_SUMMARY: 'query:transaction-summary',
    JOB_UPDATED: 'job:updated',
    JOB_REMOVED: 'job:removed',
    AI_CHAT_DELTA: 'ai:chat-delta',
    AI_CHAT_TOOL: 'ai:chat-tool',
    AI_PROPOSAL_CHANGED: 'ai:proposal-changed',
    AI_CHAT_ROUND: 'ai:chat-round',
    AI_CHAT_APPROVAL: 'ai:chat-approval',
    STATS_SAMPLE: 'stats:sample',
    TERMINAL_DATA: 'terminal:data',
    TERMINAL_EXIT: 'terminal:exit',
} as const;

// ── Payload types ─────────────────────────────────────────────────────────

export interface ConnectionChangedPayload {
    status: ConnectionStatus;
    databases?: string[];
    profile?: ConnectionProfile;
}

export interface ConnectionUpdatedPayload {
    profile: ConnectionProfile;
}

export interface SchemaDatabasesPayload {
    profileName: string;
    databases: string[];
}

export interface SchemaNode {
    Name: string;
    Tables: string[];
    ForeignTables?: string[];
    Views: string[];
    MaterializedViews?: string[];
    Indexes?: string[];
    Functions?: string[];
    Procedures?: string[];
    Sequences?: string[];
    DataTypes?: string[];
    AggregateFunctions?: string[];
}

export interface SchemaLoadedPayload {
    profileName: string;
    dbName: string;
    schemas: SchemaNode[];
}

export interface SchemaErrorPayload {
    profileName: string;
    dbName: string;
    error: string;
}

export interface QueryStartedPayload {
    tabID: string;
    sourceTabID: string;
    query: string;
    statementText: string;
    statementIndex: number;
    statementCount: number;
}

export interface QueryChunkPayload {
    tabID: string;
    sourceTabID: string;
    columns?: string[];
    rows: string[][];
    seq: number;
    tableName?: string;
    primaryKeys?: string[];
    statementText: string;
    statementIndex: number;
    statementCount: number;
}

export interface QueryDonePayload {
    tabID: string;
    sourceTabID: string;
    affected: number;
    duration: number;
    isSelect: boolean;
    hasMore: boolean;
    error?: string;
    statementText: string;
    statementIndex: number;
    statementCount: number;
}

export interface QueryCountPayload {
    tabID: string;
    count: number;
}

export interface QueryRangePayload {
    tabID: string;
    offset: number;
    rows: string[][];
    error?: string;
}

// A server-side informational message (T-SQL PRINT / low-severity
// RAISERROR) captured while a statement executed. MSSQL-only for now.
export interface QueryMessagePayload {
    sourceTabID: string;
    tabID: string;
    text: string;
}

export interface TransactionStatusPayload {
    status: (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];
    error?: string;
    driver?: string;
}

export interface QueryTransactionSummaryPayload {
    sourceTabID: string;
    insertedRows: number;
    updatedRows: number;
    deletedRows: number;
    statementCount: number;
    query: string;
}

/** job:updated carries a full Job snapshot — see internal/app/job_service.go. */
export type JobUpdatedPayload = Job;

export interface JobRemovedPayload {
    id: string;
}

/** stats:sample as it crosses the wire — snake_case straight from Go's
 *  StatsSample JSON tags (internal/app/stats_service.go). */
interface StatsSampleWire {
    at: number;
    latency_ms: number | null;
    latency_state: LatencyState;
    rx_bytes_per_sec: number;
    tx_bytes_per_sec: number;
    cpu_percent: number;
    mem_bytes: number;
}

export type StatsSamplePayload = StatsSample;

/** terminal:data as it crosses the wire: output bytes, base64-encoded by
 *  internal/app/terminal_service.go (terminal output is not always UTF-8). */
interface TerminalDataWire {
    id: string;
    data: string;
}

export interface TerminalDataPayload {
    id: string;
    /** The raw output bytes, ready for xterm's write(). */
    data: Uint8Array;
}

export interface TerminalExitPayload {
    id: string;
    exitCode: number;
}

/** Decodes standard base64 into bytes (atob yields one char per byte). */
export function decodeBase64Bytes(encoded: string): Uint8Array {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toStatsSample(wire: StatsSampleWire): StatsSample {
    return {
        at: wire.at,
        latencyMs: wire.latency_ms ?? null,
        latencyState: wire.latency_state,
        rxBytesPerSec: wire.rx_bytes_per_sec,
        txBytesPerSec: wire.tx_bytes_per_sec,
        cpuPercent: wire.cpu_percent,
        memBytes: wire.mem_bytes,
    };
}

// ── Typed listener factories ───────────────────────────────────────────────

export type Unsubscribe = () => void;

export function onConnectionChanged(cb: (data: ConnectionChangedPayload) => void): Unsubscribe {
    return EventsOn(EVENT.CONNECTION_CHANGED, cb);
}

export function onConnectionUpdated(cb: (data: ConnectionUpdatedPayload) => void): Unsubscribe {
    return EventsOn(EVENT.CONNECTION_UPDATED, cb);
}

export function onSchemaDatabases(cb: (data: SchemaDatabasesPayload) => void): Unsubscribe {
    return EventsOn(EVENT.SCHEMA_DATABASES, cb);
}

export function onSchemaLoaded(cb: (data: SchemaLoadedPayload) => void): Unsubscribe {
    return EventsOn(EVENT.SCHEMA_LOADED, cb);
}

export function onSchemaError(cb: (data: SchemaErrorPayload) => void): Unsubscribe {
    return EventsOn(EVENT.SCHEMA_ERROR, cb);
}

export function onQueryStarted(cb: (data: QueryStartedPayload) => void): Unsubscribe {
    return EventsOn(EVENT.QUERY_STARTED, cb);
}

export function onQueryChunk(cb: (data: QueryChunkPayload) => void): Unsubscribe {
    return EventsOn(EVENT.QUERY_CHUNK, cb);
}

export function onQueryDone(cb: (data: QueryDonePayload) => void): Unsubscribe {
    return EventsOn(EVENT.QUERY_DONE, cb);
}

export function onQueryTransactionSummary(
    cb: (data: QueryTransactionSummaryPayload) => void,
): Unsubscribe {
    return EventsOn(EVENT.QUERY_TRANSACTION_SUMMARY, cb);
}

export function onQueryCount(cb: (data: QueryCountPayload) => void): Unsubscribe {
    return EventsOn(EVENT.QUERY_COUNT, cb);
}

export function onQueryRange(cb: (data: QueryRangePayload) => void): Unsubscribe {
    return EventsOn(EVENT.QUERY_RANGE, cb);
}

export function onQueryMessage(cb: (data: QueryMessagePayload) => void): Unsubscribe {
    return EventsOn(EVENT.QUERY_MESSAGE, cb);
}

export function onTransactionStatus(cb: (data: TransactionStatusPayload) => void): Unsubscribe {
    return EventsOn(EVENT.TRANSACTION_STATUS, cb);
}

export function onLicenseStateChanged(cb: () => void): Unsubscribe {
    return EventsOn(EVENT.LICENSE_STATE_CHANGED, cb);
}

export function onAuditUpdated(cb: () => void): Unsubscribe {
    return EventsOn(EVENT.AUDIT_UPDATED, cb);
}

export function onJobUpdated(cb: (data: JobUpdatedPayload) => void): Unsubscribe {
    return EventsOn(EVENT.JOB_UPDATED, cb);
}

export function onJobRemoved(cb: (data: JobRemovedPayload) => void): Unsubscribe {
    return EventsOn(EVENT.JOB_REMOVED, cb);
}

export function onStatsSample(cb: (data: StatsSamplePayload) => void): Unsubscribe {
    return EventsOn(EVENT.STATS_SAMPLE, (wire: StatsSampleWire) => cb(toStatsSample(wire)));
}

export function onTerminalData(cb: (data: TerminalDataPayload) => void): Unsubscribe {
    return EventsOn(EVENT.TERMINAL_DATA, (wire: TerminalDataWire) =>
        cb({ id: wire.id, data: decodeBase64Bytes(wire.data) }),
    );
}

export function onTerminalExit(cb: (data: TerminalExitPayload) => void): Unsubscribe {
    return EventsOn(EVENT.TERMINAL_EXIT, cb);
}
