// SPDX-License-Identifier: GPL-3.0-only

// Centralised TypeScript enums for all discriminated-union string literals.
// Covers every domain where a raw string union existed without a named constant.

// ─── DML ─────────────────────────────────────────────────────────────────────
export enum DmlType {
    INSERT = 'insert',
    UPDATE = 'update',
    DELETE = 'delete',
    BEGIN = 'begin',
    COMMIT = 'commit',
    ROLLBACK = 'rollback',
    OTHER = 'other',
}

// ─── Write safety ─────────────────────────────────────────────────────────────
export enum WriteOperationKind {
    UPDATE = 'update',
    DELETE = 'delete',
    ALTER = 'alter',
    DROP = 'drop',
    TRUNCATE = 'truncate',
    MERGE = 'merge',
    REPLACE = 'replace',
    INSERT = 'insert',
    CREATE = 'create',
    OTHER_WRITE = 'other_write',
    READ = 'read',
    UNKNOWN = 'unknown',
}

export enum WriteSafetyAction {
    ALLOW = 'allow',
    CONFIRM = 'confirm',
    BLOCK = 'block',
}

export enum WriteSafetySeverity {
    PRIMARY = 'primary',
    DANGER = 'danger',
}

export enum RiskLevel {
    SAFE = 'safe',
    CAUTION = 'caution',
    DANGER = 'danger',
}

// ─── Result / export ──────────────────────────────────────────────────────────
export enum ResultFetchStrategy {
    CLIENT_FULL = 'client_full',
    INCREMENTAL_CLIENT = 'incremental_client',
    SERVER_AWARE = 'server_aware',
}

export enum ExportStatus {
    IDLE = 'idle',
    RUNNING = 'running',
    DONE = 'done',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

// ─── Data table ───────────────────────────────────────────────────────────────
export enum DataTableRowLifecycle {
    CLEAN = 'clean',
    DIRTY = 'dirty',
    SAVING = 'saving',
    SAVED = 'saved',
    ERROR = 'error',
    CONFLICT = 'conflict',
    READONLY = 'readonly',
    LOCKED = 'locked',
}

export enum RowInsertKind {
    NEW = 'new',
    DUPLICATE = 'duplicate',
}

// ─── Editor / tabs ────────────────────────────────────────────────────────────
export enum CompareSourceKind {
    QUERY_TAB = 'query-tab',
    SAVED_SCRIPT = 'saved-script',
}

export enum TabGroupSplitDirection {
    LEFT = 'left',
    RIGHT = 'right',
}

// ─── Realtime log ─────────────────────────────────────────────────────────────
export enum RealtimeLogKind {
    QUERY_STARTED = 'query.started',
    QUERY_DONE = 'query.done',
    QUERY_CHUNK = 'query.chunk',
    CONNECTION_CHANGED = 'connection.changed',
    SCHEMA_LOADED = 'schema.loaded',
    SCHEMA_ERROR = 'schema.error',
    TX_STATUS = 'tx.status',
}

export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

// ─── Source control ───────────────────────────────────────────────────────────
export enum SCFileStatusKind {
    MODIFIED = 'modified',
    ADDED = 'added',
    DELETED = 'deleted',
    UNTRACKED = 'untracked',
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export enum ToastVariant {
    SUCCESS = 'success',
    ERROR = 'error',
    INFO = 'info',
}

// ─── Shortcut source ──────────────────────────────────────────────────────────
export enum ShortcutSource {
    USER = 'user',
    SYSTEM = 'system',
}

// ─── Project hub ──────────────────────────────────────────────────────────────
export enum ProjectHubSurface {
    ENTRY = 'entry',
    WIZARD = 'wizard',
}

export enum ProjectWizardMode {
    CREATE = 'create',
    EDIT = 'edit',
}

export enum ProjectHubLaunchContext {
    DEFAULT = 'default',
    ENV_CONFIG = 'env-config',
}
