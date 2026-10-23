// SPDX-License-Identifier: GPL-3.0-only

// Contracts for the API gateway seam. Pattern: Interface Segregation —
// one focused adapter interface per domain; ApiGateway composes them.
import type { ConnectionAdapter } from './connection';
import type { QueryAdapter } from './query';
import type { SchemaAdapter } from './schema';
import type { ProjectAdapter } from './project';
import type { SecurityAdapter } from './security';
import type { SettingsAdapter } from './settings';
import type { SourceControlAdapter } from './sourceControl';
import type { AuditAdapter } from './audit';
import type { GitTrackingAdapter } from './gitTracking';
import type { TemplateAdapter } from './template';
import type { ScriptAdapter } from './script';
import type { BookmarkAdapter } from './bookmark';
import type { ImageColumnAdapter } from './imageColumn';
import type { LicenseAdapter } from './license';
import type { PluginAdapter } from './plugin';
import type { QueryStatsAdapter } from './queryStats';
import type { JobAdapter } from './job';
import type { ImportAdapter } from './import';
import type { ServerSessionAdapter } from './serverSession';
import type { AIAdapter } from './ai';
import type { StatsAdapter } from './stats';
import type { TerminalAdapter } from './terminal';

export type { ConnectionAdapter } from './connection';
export type { QueryAdapter } from './query';
export type { SchemaAdapter } from './schema';
export type { ProjectAdapter } from './project';
export type { SecurityAdapter } from './security';
export type { SettingsAdapter } from './settings';
export type { SourceControlAdapter } from './sourceControl';
export type { AuditAdapter } from './audit';
export type { GitTrackingAdapter } from './gitTracking';
export type { TemplateAdapter } from './template';
export type { ScriptAdapter } from './script';
export type { BookmarkAdapter } from './bookmark';
export type { ImageColumnAdapter } from './imageColumn';
export type { LicenseAdapter } from './license';
export type { PluginAdapter } from './plugin';
export type { QueryStatsAdapter } from './queryStats';
export type { JobAdapter, Job, JobKind, JobStatus, JobProgress, JobCapabilities } from './job';
export type {
    ImportAdapter,
    ImportColumnMapping,
    CSVImportOptions,
    CSVImportPreview,
} from './import';
export type { ServerSessionAdapter, ServerSession } from './serverSession';
export type { AIAdapter } from './ai';
export type { StatsAdapter, StatsSample, LatencyState } from './stats';
export type { TerminalAdapter, TerminalInfo, TerminalKind } from './terminal';

export type ApiMode = 'local' | 'team' | 'enterprise';

export interface ApiGateway {
    readonly mode: ApiMode;
    readonly connection: ConnectionAdapter;
    readonly query: QueryAdapter;
    readonly schema: SchemaAdapter;
    readonly project: ProjectAdapter;
    readonly security: SecurityAdapter;
    readonly settings: SettingsAdapter;
    readonly sourceControl: SourceControlAdapter;
    readonly audit: AuditAdapter;
    readonly gitTracking: GitTrackingAdapter;
    readonly template: TemplateAdapter;
    readonly script: ScriptAdapter;
    readonly bookmark: BookmarkAdapter;
    readonly imageColumn: ImageColumnAdapter;
    readonly license: LicenseAdapter;
    readonly plugin: PluginAdapter;
    readonly queryStats: QueryStatsAdapter;
    readonly job: JobAdapter;
    readonly dataImport: ImportAdapter;
    readonly serverSession: ServerSessionAdapter;
    readonly ai: AIAdapter;
    readonly stats: StatsAdapter;
    readonly terminal: TerminalAdapter;
}
