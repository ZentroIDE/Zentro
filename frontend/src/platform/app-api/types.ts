// SPDX-License-Identifier: GPL-3.0-only

import type { app, models, utils } from '../../../wailsjs/go/models';
import type { QueryStatFilter, QueryStatReport } from './contracts/queryStats';
import type { ConnectionProfile } from '../../types/connection';
import { CONNECTION_STATUS } from '../../lib/constants';
import { SCFileStatusKind } from '../../lib/enums';

export { SCFileStatusKind };
import type { AccessResult, LicenseState } from '../../lib/license/types';
import type { PluginContribution } from '../../lib/plugin/contracts';
import type {
    OpenWritePreviewResult,
    ProductionWriteUnlockState,
    QueryAuditMeta,
    QueryPreflightResult,
    QueryPreviewResult,
    WritePreviewPage,
} from '../../lib/writeSafety/safetyPreflight';
import type { SchemaMigrationResult, SchemaSnapshot } from '../../types/schemaDiff';
import type { Job } from './contracts/job';
import type { CSVImportOptions, CSVImportPreview } from './contracts/import';
import type { ServerSession } from './contracts/serverSession';
import type { TerminalInfo, TerminalKind } from './contracts/terminal';

export type RuntimeConnectionStatus = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

export interface ConnectionRuntimeState {
    status: RuntimeConnectionStatus;
    profile?: ConnectionProfile | null;
}

export interface GitTrackingStatus {
    enabled: boolean;
    initialized: boolean;
    repo_path?: string;
    project_id?: string;
    last_commit_hash?: string;
    last_error?: string;
    pending_count?: number;
}

export interface GitTimelineItem {
    hash: string;
    message: string;
    event_type: string;
    author: string;
    when: string;
    files: string[];
}

export interface GitCommitFileDiff {
    path: string;
    before: string;
    after: string;
}

export interface SCFileStatus {
    path: string;
    staged: boolean;
    status: SCFileStatusKind;
}

export interface SCStatus {
    branch: string;
    files: SCFileStatus[];
    clean: boolean;
}

export interface SCCommit {
    hash: string;
    message: string;
    author: string;
    when: string;
}

export interface GitCommitResult {
    hash?: string;
    message: string;
    files: string[];
    created_at: string;
    no_changes: boolean;
}

export interface ProSecurityState {
    app_lock_enabled: boolean;
    app_lock_configured: boolean;
    app_lock_timeout_sec: number;
    app_locked: boolean;
    secret_vault_enabled: boolean;
    secret_vault_ready: boolean;
    secret_vault_unlocked: boolean;
}

export interface SchemaRollbackTarget {
    hash: string;
    message: string;
    when: string;
    schema?: string;
    driver?: string;
    environment?: string;
}

export interface CatalogObjectDetails {
    objectKind: string;
    name: string;
    schema: string;
    tableName?: string;
    ddl?: string;
    signature?: string;
    columns?: string[];
    unique?: boolean;
    primaryKey?: boolean;
    unsupportedMessage?: string;
}

export interface AppApiGateway {
    // Connection
    Connect(database: string): Promise<void>;
    Disconnect(): Promise<void>;
    Reconnect(): Promise<void>;
    SwitchDatabase(database: string): Promise<void>;
    LoadConnections(): Promise<models.ConnectionProfile[]>;
    LoadDatabasesForProfile(id: string): Promise<string[]>;
    LoadDatabasesForConnection(profile: models.ConnectionProfile): Promise<string[]>;
    CreateDatabase(profile: models.ConnectionProfile, dbName: string): Promise<void>;
    SaveConnection(profile: models.ConnectionProfile): Promise<void>;
    DeleteConnection(id: string): Promise<void>;
    ExportConnectionsBundle(names: string[]): Promise<string>;
    ImportConnectionsFromFile(): Promise<models.ConnectionProfile[] | null>;
    ListConnectionImporters(): Promise<app.ImporterInfo[]>;
    DetectImporterWorkspace(key: string): Promise<string>;
    ImportConnectionsFromTool(
        key: string,
        path: string,
    ): Promise<models.ConnectionProfile[] | null>;
    TestConnection(profile: models.ConnectionProfile): Promise<void>;
    GetConnectionStatus(): Promise<ConnectionRuntimeState>;
    PickSQLiteFile(): Promise<string>;
    ListConnectionUsage(id: string): Promise<app.ConnectionUsageRef[]>;

    // Query & execution
    ExecuteQuery(tabId: string, query: string): Promise<void>;
    CancelQuery(tabId: string): Promise<void>;
    CopyActiveQuery(fromTabId: string, toTabId: string): Promise<boolean>;
    ExplainQuery(tabId: string, query: string, analyze: boolean): Promise<void>;
    ExecuteUpdateSync(tabId: string, sql: string): Promise<number>;
    PreflightQuery?(sql: string, environmentKey: string): Promise<QueryPreflightResult>;
    PreviewAffectedRows?(sql: string, environmentKey: string): Promise<QueryPreviewResult>;
    OpenWritePreview?(sql: string, environmentKey: string): Promise<OpenWritePreviewResult>;
    FetchWritePreviewRows?(
        previewSessionId: string,
        offset: number,
        limit: number,
    ): Promise<WritePreviewPage>;
    CloseWritePreview?(previewSessionId: string): Promise<void>;
    UnlockProductionWrites?(environmentKey: string): Promise<ProductionWriteUnlockState>;
    SetPendingQueryAuditMeta?(tabId: string, meta: QueryAuditMeta): Promise<void>;
    FetchMoreRows(tabId: string, offset: number): Promise<void>;
    FetchRowRange(tabId: string, offset: number, count: number): Promise<void>;
    // Pinned Environment execution (ADR-0001) — Table/Catalog tabs target
    // their own profileName/dbName instead of the Active Environment.
    ExecutePinnedQuery(
        tabId: string,
        query: string,
        profileName: string,
        dbName: string,
    ): Promise<void>;
    FetchPinnedMoreRows(
        tabId: string,
        offset: number,
        profileName: string,
        dbName: string,
    ): Promise<void>;
    FetchPinnedRowRange(
        tabId: string,
        offset: number,
        count: number,
        profileName: string,
        dbName: string,
    ): Promise<void>;
    ExecutePinnedUpdateSync(
        tabId: string,
        sql: string,
        profileName: string,
        dbName: string,
        environmentKey: string,
    ): Promise<number>;
    FormatSQL(query: string, driver: string): Promise<string>;
    ExportCSV(columns: string[], rows: unknown[]): Promise<string>;
    // knownTotal: the row count the frontend already has cached from the
    // result panel's own background COUNT(*) (query:count event) — 0 when
    // it doesn't have one yet, which leaves the job's progress indeterminate.
    ExportAllCSV(tabId: string, selectedColumns: string[], knownTotal: number): Promise<string>;
    ExportJSON(columns: string[], rows: unknown[]): Promise<string>;
    ExportAllJSON(tabId: string, selectedColumns: string[], knownTotal: number): Promise<string>;
    ExportSQLInsert(columns: string[], rows: unknown[], tableName: string): Promise<string>;
    ExportAllSQLInsert(
        tabId: string,
        tableName: string,
        selectedColumns: string[],
        knownTotal: number,
    ): Promise<string>;

    // Transaction
    BeginTransaction(): Promise<void>;
    CommitTransaction(): Promise<void>;
    RollbackTransaction(): Promise<void>;
    GetTransactionStatus(): Promise<string>;

    // Activity panel jobs (query/export/import) — see job_service.go
    ListJobs(): Promise<Job[]>;
    CancelJob(id: string): Promise<void>;
    KillJob(id: string): Promise<void>;
    ClearFinishedJobs(): Promise<string[]>;

    // Live status-bar stats sampler — see stats_service.go
    StartStatsSampler(intervalMs: number): Promise<void>;
    StopStatsSampler(): Promise<void>;

    // Terminal tab (local shell / SSH shell) — see terminal_service.go
    TerminalOpen(
        kind: TerminalKind,
        profileId: string,
        cols: number,
        rows: number,
    ): Promise<TerminalInfo>;
    TerminalWrite(id: string, data: string): Promise<void>;
    TerminalResize(id: string, cols: number, rows: number): Promise<void>;
    TerminalClose(id: string): Promise<void>;

    // CSV data import — see import_service.go
    PickCSVFile(): Promise<string>;
    PreviewCSVImport(
        filePath: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<CSVImportPreview>;
    StartCSVImport(options: CSVImportOptions): Promise<string>;

    // Server sessions (DB server's own process list) — see
    // server_session_service.go. Not supported for SQLite.
    ListServerSessions(): Promise<ServerSession[]>;
    CancelServerSession(sessionId: string): Promise<void>;
    KillServerSession(sessionId: string): Promise<void>;

    // Schema & table ops
    FetchDatabaseSchema(profileName: string, dbName: string): Promise<void>;
    BuildQualifiedTableSelect(connectionID: string, schema: string, table: string): Promise<string>;
    FetchTableColumns(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.ColumnDef[]>;
    FetchTableRelationships(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.TableRelationship[]>;
    CountReferencingRows(
        connectionID: string,
        dbName: string,
        probes: models.ReferencingRowsProbe[],
    ): Promise<models.ReferencingRowsResult[]>;
    CreateTable(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        columns: models.ColumnDef[],
    ): Promise<void>;
    DropObject(
        connectionID: string,
        dbName: string,
        schema: string,
        objectName: string,
        objectType: string,
    ): Promise<void>;
    DropObjectAdvanced(
        connectionID: string,
        dbName: string,
        schema: string,
        objectName: string,
        objectType: string,
        cascade: boolean,
    ): Promise<void>;
    TruncateTable(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        cascade: boolean,
        restartIdentity: boolean,
    ): Promise<void>;
    FetchSchemaSnapshot(
        profileName: string,
        dbName: string,
        schemaName: string,
    ): Promise<SchemaSnapshot>;
    GenerateSchemaMigration(
        left: SchemaSnapshot,
        right: SchemaSnapshot,
    ): Promise<SchemaMigrationResult>;
    GetTableDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
    ): Promise<string>;
    GetCatalogObjectDetails(
        connectionID: string,
        dbName: string,
        schema: string,
        objectKind: string,
        name: string,
        tableName?: string,
    ): Promise<CatalogObjectDetails>;
    AlterTableColumn(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        current: models.ColumnDef,
        next: models.ColumnDef,
    ): Promise<void>;
    ReorderTableColumns(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        newOrder: string[],
    ): Promise<void>;
    AddTableColumn(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        col: models.ColumnDef,
    ): Promise<void>;
    DropTableColumn(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        columnName: string,
    ): Promise<void>;
    GetIndexes(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.IndexInfo[]>;
    CreateIndex(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        indexName: string,
        columns: string[],
        unique: boolean,
    ): Promise<void>;
    DropIndex(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        indexName: string,
    ): Promise<void>;
    PreviewCreateIndexDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        indexName: string,
        columns: string[],
        unique: boolean,
    ): Promise<string>;
    PreviewDropIndexDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        indexName: string,
    ): Promise<string>;
    GetCheckConstraints(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.CheckConstraintInfo[]>;
    CreateCheckConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        expression: string,
    ): Promise<void>;
    DropCheckConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<void>;
    PreviewAddCheckConstraintDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        expression: string,
    ): Promise<string>;
    PreviewDropCheckConstraintDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<string>;
    GetUniqueConstraints(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.UniqueConstraintInfo[]>;
    CreateUniqueConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        columns: string[],
    ): Promise<void>;
    DropUniqueConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<void>;
    GetPrimaryKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.PrimaryKeyInfo | null>;
    AddPrimaryKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        columns: string[],
    ): Promise<void>;
    DropPrimaryKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<void>;
    PreviewAddPrimaryKeyDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        columns: string[],
    ): Promise<string>;
    PreviewDropPrimaryKeyDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<string>;
    GetForeignKeys(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<models.ForeignKeyInfo[]>;
    CreateForeignKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        fk: models.ForeignKeyInfo,
    ): Promise<void>;
    UpdateForeignKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        originalName: string,
        fk: models.ForeignKeyInfo,
    ): Promise<void>;
    DropForeignKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<void>;

    // Settings & updates
    GetPreferences(): Promise<utils.Preferences>;
    SetPreferences(preferences: utils.Preferences): Promise<void>;
    CheckForUpdates(): Promise<app.UpdateInfo>;
    GetAboutInfo(): Promise<app.AboutInfo>;
    RestartAndUpdate(info: app.UpdateInfo): Promise<void>;
    ConsumeLastUpdateResult(): Promise<app.LastUpdateResult | boolean>;
    GetEnvironmentPolicies(): Promise<Record<string, app.ExecutionPolicy>>;
    SetEnvironmentSafetyLevel(
        environmentKey: string,
        level: string,
    ): Promise<Record<string, app.ExecutionPolicy>>;
    ShouldPromptForFeedback(): Promise<boolean>;
    MarkFeedbackPrompted(): Promise<void>;
    SubmitFeedback(rating: number, comment: string): Promise<void>;
    GetProSecurityState?(): Promise<ProSecurityState>;
    ConfigureAppLock?(enabled: boolean, timeoutSec: number, pin: string): Promise<ProSecurityState>;
    LockApp?(): Promise<ProSecurityState>;
    UnlockApp?(pin: string): Promise<ProSecurityState>;
    UnlockAppWithOS?(): Promise<ProSecurityState>;
    ConfigureSecretVault?(enabled: boolean, password: string): Promise<ProSecurityState>;
    UnlockSecretVault?(password: string): Promise<ProSecurityState>;
    LockSecretVault?(): Promise<ProSecurityState>;

    // Audit log
    GetSQLAuditLog(filter: app.SQLAuditFilter): Promise<app.SQLAuditEntry[]>;
    ClearSQLAuditLog(): Promise<void>;
    ExportSQLAuditLog(format: string): Promise<string>;
    PinAuditEntry(id: string, pinned: boolean): Promise<void>;
    GetAuditLogPath(): Promise<string>;
    GetAppDebugLog(opts: app.AppDebugLogOpts): Promise<app.AppDebugLogEntry[]>;
    GetAppDebugLogPath(): Promise<string>;
    LogClientEvent(message: string, fields: Record<string, string>): Promise<void>;

    // Templates / scripts / bookmarks
    LoadTemplates(): Promise<models.Template[]>;
    SaveTemplate(template: models.Template): Promise<void>;
    DeleteTemplate(templateId: string): Promise<void>;
    ExportProfilePackage(jsonContent: string, defaultFileName: string): Promise<string>;
    GetScripts(projectId: string, connectionName: string): Promise<models.SavedScript[]>;
    GetScriptContent(projectId: string, connectionName: string, scriptId: string): Promise<string>;
    SaveScript(script: models.SavedScript, content: string): Promise<void>;
    DeleteScript(projectId: string, connectionName: string, scriptId: string): Promise<void>;
    GetBookmarks(profileName: string, dbName: string): Promise<models.Bookmark[]>;
    GetBookmarksByConnection(connectionID: string): Promise<Record<string, models.Bookmark[]>>;
    SaveBookmark(profileName: string, dbName: string, bookmark: models.Bookmark): Promise<void>;
    DeleteBookmark(profileName: string, dbName: string, lineNumber: number): Promise<void>;
    GetImageColumns(connectionKey: string, tableKey: string): Promise<string[]>;
    GetImageColumnsByConnection(connectionKey: string): Promise<Record<string, string[]>>;
    SetImageColumn(
        connectionKey: string,
        tableKey: string,
        column: string,
        marked: boolean,
    ): Promise<void>;
    PinConnection(profileName: string, dbName: string): Promise<void>;
    UnpinConnection(profileName: string, dbName: string): Promise<void>;
    EnableGitTracking(): Promise<void>;
    DisableGitTracking(): Promise<void>;
    GetGitTrackingStatus(): Promise<GitTrackingStatus>;
    ListGitTimeline(limit: number, eventType: string): Promise<GitTimelineItem[]>;
    GetGitCommitDiff(commitHash: string): Promise<string>;
    GetCommitFileDiffs(commitHash: string): Promise<GitCommitFileDiff[]>;
    ManualGitCommit(message: string): Promise<GitCommitResult>;
    GetGitPendingChanges(): Promise<string[]>;
    RestoreGitCommit(commitHash: string): Promise<void>;
    ListSchemaRollbackTargets?(limit: number): Promise<SchemaRollbackTarget[]>;
    RestoreSchemaRollbackTarget?(commitHash: string): Promise<void>;
    SnapshotStoredProcedures(schema: string): Promise<number>;
    RunGitTrackingMigration(): Promise<void>;

    // Source Control (user repo)
    SCGetStatus(): Promise<SCStatus>;
    SCStageFile(filePath: string): Promise<void>;
    SCUnstageFile(filePath: string): Promise<void>;
    SCStageAll(): Promise<void>;
    SCCommit(message: string): Promise<string>;
    SCGetHistory(limit: number): Promise<SCCommit[]>;
    SCGetFileDiffs(hash: string): Promise<GitCommitFileDiff[]>;
    SCGetWorkingFileDiff(filePath: string, staged: boolean): Promise<GitCommitFileDiff>;
    SCListBranches(): Promise<string[]>;
    SCCheckoutBranch(branchName: string): Promise<void>;
    SCCreateBranch(branchName: string): Promise<void>;
    SCCreateBranchFrom(branchName: string, fromRef: string): Promise<void>;
    SCCheckoutDetached(ref: string): Promise<void>;
    SCInitRepo(): Promise<void>;
    SCReadGitIgnore(): Promise<string>;
    SCWriteGitIgnore(content: string): Promise<void>;

    // App-level lifecycle
    ForceQuit(): Promise<void>;
    ConnectProjectEnvironment(environmentKey: string): Promise<void>;

    // Project
    ListProjects(): Promise<models.Project[]>;
    GetProject(projectId: string): Promise<models.Project>;
    CreateProject(project: models.Project): Promise<models.Project>;
    SaveProject(project: models.Project): Promise<models.Project>;
    DeleteProject(projectId: string): Promise<void>;
    OpenProject(projectId: string): Promise<models.Project>;
    OpenProjectInNewWindow(projectId: string): Promise<void>;
    GetLaunchProjectID(): Promise<string>;
    OpenDirectoryInExplorer(path: string): Promise<void>;
    OpenFileInDefaultApp(path: string): Promise<void>;
    OpenProjectFromDirectory(directoryPath: string): Promise<models.Project>;
    GetDefaultProjectStorageRoot(): Promise<string>;
    PickDirectory(initialPath: string): Promise<string>;
    GetActiveProject(): Promise<models.Project>;

    // Extensions / license architecture
    StartTrial?(email: string): Promise<LicenseState>;
    RestoreLicenseByEmail?(email: string): Promise<LicenseState>;
    ActivateLicense?(key: string, deviceInfo: string): Promise<LicenseState>;
    RefreshLicense?(sessionToken: string): Promise<LicenseState>;
    DeactivateLicense?(reason: string): Promise<void>;
    GetLicenseState?(): Promise<LicenseState>;
    SetSavedLicenseEmail?(email: string): Promise<LicenseState>;
    RegisterPluginContribution?(contribution: PluginContribution): Promise<void>;
    ListPluginByCapability?(capability: string): Promise<PluginContribution[]>;
    CheckFeatureAccess?(featureId: string): Promise<AccessResult>;
    RecordFeatureUsage?(featureId: string): Promise<void>;
    CreateCheckoutURL?(email: string): Promise<string>;
    GetQueryStats?(filter: QueryStatFilter): Promise<QueryStatReport>;

    GetAISettings(): Promise<import('../../lib/aiAssistant').AISettingsView>;
    SetAISettings(
        settings: import('../../lib/aiAssistant').ProjectAISettings,
    ): Promise<import('../../lib/aiAssistant').AISettingsView>;
    SaveAIProviderKey(
        secret: string,
        host: string,
    ): Promise<import('../../lib/aiAssistant').AISettingsView>;
    ClearAIProviderKey(host: string): Promise<import('../../lib/aiAssistant').AISettingsView>;
    PreviewAIChat(
        request: import('../../lib/aiAssistant').AIPreviewRequest,
    ): Promise<import('../../lib/aiAssistant').AIPreview>;
    SendAIChat(
        request: import('../../lib/aiAssistant').AISendRequest,
    ): Promise<import('../../lib/aiAssistant').AISendResult>;
    ListAIModels(host: string): Promise<import('../../lib/aiAssistant').AIModelCatalog>;
    ListAIMentions(): Promise<import('../../lib/aiAssistant').AIMentionCatalog>;
    CancelAIChat(requestId: string): Promise<void>;
    RevokeAIDataGrant(sessionId: string): Promise<void>;
    CreateAISession(): Promise<import('../../lib/aiAssistant').AISession>;
    ListAISessions(): Promise<import('../../lib/aiAssistant').AISessionSummary[]>;
    GetAISession(id: string): Promise<import('../../lib/aiAssistant').AISession>;
    RenameAISession(id: string, title: string): Promise<void>;
    DeleteAISession(id: string): Promise<void>;
    StartAIMCPServer(): Promise<import('../../lib/aiAssistant').AIMCPStatus>;
    StopAIMCPServer(): Promise<import('../../lib/aiAssistant').AIMCPStatus>;
    GetAIMCPStatus(): Promise<import('../../lib/aiAssistant').AIMCPStatus>;
    ConnectAIMCPClient(client: string): Promise<import('../../lib/aiAssistant').AIMCPClientResult>;
    DisconnectAIMCPClient(
        client: string,
    ): Promise<import('../../lib/aiAssistant').AIMCPClientResult>;
    RotateAIMCPToken(): Promise<import('../../lib/aiAssistant').AIMCPStatus>;
    SetAIMCPAutoStart(on: boolean): Promise<import('../../lib/aiAssistant').AIMCPStatus>;
    ListAIChanges(): Promise<import('../../lib/aiAssistant').AIChangeProposal[]>;
    GetAIChange(id: string): Promise<import('../../lib/aiAssistant').AIChangeProposal>;
    ApproveAIChange(
        req: import('../../lib/aiAssistant').AIChangeApproveRequest,
    ): Promise<import('../../lib/aiAssistant').AIChangeProposal>;
    RejectAIChange(
        id: string,
        note: string,
    ): Promise<import('../../lib/aiAssistant').AIChangeProposal>;
    ResolveAIChatApproval(requestId: string, approve: boolean): Promise<void>;
    ListAIMemoryNotes(): Promise<import('../../lib/aiAssistant').AIMemoryNote[]>;
    AddAIMemoryNote(text: string): Promise<import('../../lib/aiAssistant').AIMemoryNote>;
    DeleteAIMemoryNote(id: string): Promise<void>;
}

export interface ServiceError {
    code: string;
    message: string;
    cause?: unknown;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

export function toServiceError(code: string, message: string, cause?: unknown): ServiceError {
    return { code, message, cause };
}

export async function toServiceResult<T>(
    code: string,
    message: string,
    runner: () => Promise<T>,
): Promise<ServiceResult<T>> {
    try {
        const data = await runner();
        return { ok: true, data };
    } catch (cause) {
        return {
            ok: false,
            error: toServiceError(code, message, cause),
        };
    }
}
