// SPDX-License-Identifier: GPL-3.0-only

import { ProjectHubSurface, ProjectWizardMode, ProjectHubLaunchContext } from './enums';

export { ProjectHubSurface, ProjectWizardMode, ProjectHubLaunchContext };

/**
 * Global constants for the frontend application.
 */

export const STORAGE_KEY = {
    EDITOR_SESSION: 'zentro:editor-session',
    PROJECT_STORE: 'zentro:project-store',
    LAYOUT_STORE: 'zentro:layout-store',
    SIDEBAR_UI: 'zentro:sidebar-ui',
    DATABASE_EXPLORER_UI: 'zentro:database-explorer-ui',
    DISMISSED_UPDATE_VERSION: 'zentro:dismissed-update-version',
    TELEMETRY_CONSENT: 'zentro:telemetry-consent',
    PRIVACY_NOTICE_ACCEPTED: 'zentro:privacy-notice-accepted',
    QUERY_PERFORMANCE_SNAPSHOTS: 'zentro:query-performance-snapshots',
    TELEMETRY_EVENTS: 'zentro:telemetry-events',
    TELEMETRY_ANALYTICS_OUTBOX: 'zentro:telemetry-analytics-outbox',
    APP_ZOOM: 'zentro:app-zoom',
    STATUS_BAR_STATS: 'zentro:status-bar-stats',
    TERMINAL_SETTINGS: 'zentro:terminal-settings',
} as const;

export const DOM_EVENT = {
    OPEN_PROJECT_HUB: 'open-project-hub',
    OPEN_PROJECT_FOLDER: 'open-project-folder',
    OPEN_CONTEXT_SEARCH: 'open-context-search',
    OPEN_COMMAND_PALETTE: 'open-command-palette',
    OPEN_ENVIRONMENT_SWITCHER: 'open-environment-switcher',
    QUICK_SWITCH_ENVIRONMENT: 'quick-switch-environment',
    QUICK_SWITCH_PROJECT: 'quick-switch-project',
    CLOSE_ACTIVE_TAB: 'close-active-tab',
    RUN_QUERY_ACTION: 'run-query-action',
    RUN_EXPLAIN_ACTION: 'run-explain-action',
    FORMAT_QUERY_ACTION: 'format-query-action',
    EXPAND_WILDCARD_AND_RUN_ACTION: 'expand-wildcard-and-run-action',
    TOGGLE_BOOKMARK_ACTION: 'toggle-bookmark-action',
    NEXT_BOOKMARK_ACTION: 'next-bookmark-action',
    OPEN_SCHEMA_DIFF: 'open-schema-diff',
    OPEN_TABLE_EXPORT: 'open-table-export',
    OPEN_RESULT_EXPORT: 'open-result-export',
    OPEN_DATA_IMPORT: 'open-data-import',
    RELOAD_RESULT: 'reload-result',
    REFRESH_DATABASE_EXPLORER: 'refresh-database-explorer',
    REFRESH_SOURCE_CONTROL: 'refresh-source-control',
    JUMP_TO_LINE_ACTION: 'jump-to-line-action',
    SAVE_TAB_ACTION: 'zentro:save-script',
    RENAME_TAB: 'zentro:rename-tab',
    FOCUS_ACTIVE_EDITOR: 'focus-active-editor',
    OPEN_SETTINGS_SECTION: 'open-settings-section',
    FOCUS_ZONE: 'focus-zone',
} as const;

export interface ProjectHubLaunchIntent {
    surface?: ProjectHubSurface;
    wizardMode?: ProjectWizardMode;
    projectId?: string;
    initialEnvironmentKey?: EnvironmentKey;
    launchContext?: ProjectHubLaunchContext;
    /** Opens the project-limit upgrade dialog directly (e.g. the backend refused a new admission). */
    showProjectLimitUpgrade?: boolean;
}

export interface ContextSearchIntent {
    initialQuery?: string;
    mode?: 'default' | 'schema-diff-source';
    targetSide?: 'left' | 'right';
    nextPickerSide?: 'left' | 'right';
    compareTabId?: string;
    initialEnvironmentKey?: EnvironmentKey;
    initialSchemaName?: string;
}

export const TAB_TYPE = {
    QUERY: 'query',
    COMPARE: 'compare',
    TABLE: 'table',
    CATALOG: 'catalog',
    SETTINGS: 'settings',
    SHORTCUTS: 'shortcuts',
    GIT_DIFF: 'git_diff',
} as const;
export type TabType = (typeof TAB_TYPE)[keyof typeof TAB_TYPE];

export const CONNECTION_STATUS = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    ERROR: 'error',
    CONNECTING: 'connecting',
} as const;
export type ConnectionStatus = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

export const DRIVER = {
    POSTGRES: 'postgres',
    SQLSERVER: 'sqlserver',
    MYSQL: 'mysql',
    SQLITE: 'sqlite',
} as const;
export type DriverType = (typeof DRIVER)[keyof typeof DRIVER];

export const ENVIRONMENT_KEY = {
    DEVELOPMENT: 'dev',
    STAGING: 'sta',
    PRODUCTION: 'pro',
} as const;
export type EnvironmentKey = (typeof ENVIRONMENT_KEY)[keyof typeof ENVIRONMENT_KEY];

export const TRANSACTION_STATUS = {
    NONE: 'none',
    ACTIVE: 'active',
    ERROR: 'error',
} as const;
export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

// Paired with SafetyLevel* in internal/constant/constants.go — crosses the
// wire via ExecutionPolicy. Keep both sides in sync, like events.
export const SAFETY_LEVEL = {
    STRICT: 'strict',
    BALANCED: 'balanced',
    RELAXED: 'relaxed',
} as const;

// Paired with EnvironmentStrictness* in internal/constant/constants.go.
// Distinct vocabulary from Safety Levels even though both use "strict".
export const ENVIRONMENT_STRICTNESS = {
    STRICT: 'strict',
    NORMAL: 'normal',
} as const;

// Paired with ObjectType* in internal/constant/constants.go — crosses the
// wire via DropObject/DropObjectAdvanced.
export const OBJECT_TYPE = {
    TABLE: 'TABLE',
    VIEW: 'VIEW',
    INDEX: 'INDEX',
} as const;
export type DroppableObjectType = typeof OBJECT_TYPE.TABLE | typeof OBJECT_TYPE.VIEW;

export const GENERATED_KIND = {
    RESULT: 'result',
    EXPLAIN: 'explain',
} as const;
export type GeneratedKind = (typeof GENERATED_KIND)[keyof typeof GENERATED_KIND];

export const ASSET_TYPE = {
    SAVED_QUERY: 'saved_query',
    TEMPLATE: 'template',
    FAVORITE_OBJECT: 'favorite_object',
    RESULT_SNAPSHOT: 'result_snapshot',
} as const;
export type AssetType = (typeof ASSET_TYPE)[keyof typeof ASSET_TYPE];
