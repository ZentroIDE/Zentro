// SPDX-License-Identifier: GPL-3.0-only

import type { PluginContribution } from '../../lib/plugin/contracts';
import { withKernelResult } from '../../shared/kernel';
import { wailsGateway } from './wailsGateway';
import type { QueryStatFilter } from './contracts/queryStats';
import type {
    ApiGateway,
    ApiMode,
    GitTrackingAdapter,
    LicenseAdapter,
    PluginAdapter,
    QueryStatsAdapter,
} from './contracts';

export class WailsApiGateway implements ApiGateway {
    readonly mode: ApiMode = 'local';

    readonly connection = withKernelResult('connection', {
        connect: wailsGateway.Connect,
        disconnect: wailsGateway.Disconnect,
        reconnect: wailsGateway.Reconnect,
        switchDatabase: wailsGateway.SwitchDatabase,
        loadConnections: wailsGateway.LoadConnections,
        loadDatabasesForProfile: wailsGateway.LoadDatabasesForProfile,
        saveConnection: wailsGateway.SaveConnection,
        deleteConnection: wailsGateway.DeleteConnection,
        exportConnectionsBundle: wailsGateway.ExportConnectionsBundle,
        importConnectionsFromFile: wailsGateway.ImportConnectionsFromFile,
        listConnectionImporters: wailsGateway.ListConnectionImporters,
        detectImporterWorkspace: wailsGateway.DetectImporterWorkspace,
        importConnectionsFromTool: wailsGateway.ImportConnectionsFromTool,
        testConnection: wailsGateway.TestConnection,
        getConnectionStatus: wailsGateway.GetConnectionStatus,
        pickSQLiteFile: wailsGateway.PickSQLiteFile,
        listConnectionUsage: wailsGateway.ListConnectionUsage,
        beginTransaction: wailsGateway.BeginTransaction,
        commitTransaction: wailsGateway.CommitTransaction,
        rollbackTransaction: wailsGateway.RollbackTransaction,
        getTransactionStatus: wailsGateway.GetTransactionStatus,
        loadDatabasesForConnection: wailsGateway.LoadDatabasesForConnection,
        createDatabase: wailsGateway.CreateDatabase,
        pinTab: wailsGateway.PinConnection,
        unpinTab: wailsGateway.UnpinConnection,
    });

    readonly query = withKernelResult('query', {
        execute: wailsGateway.ExecuteQuery,
        cancel: wailsGateway.CancelQuery,
        copyActiveQuery: wailsGateway.CopyActiveQuery,
        explain: wailsGateway.ExplainQuery,
        executeUpdateSync: wailsGateway.ExecuteUpdateSync,
        fetchMoreRows: wailsGateway.FetchMoreRows,
        fetchRowRange: wailsGateway.FetchRowRange,
        executePinnedQuery: wailsGateway.ExecutePinnedQuery,
        fetchPinnedMoreRows: wailsGateway.FetchPinnedMoreRows,
        fetchPinnedRowRange: wailsGateway.FetchPinnedRowRange,
        executePinnedUpdateSync: wailsGateway.ExecutePinnedUpdateSync,
        formatSQL: wailsGateway.FormatSQL,
        exportCSV: wailsGateway.ExportCSV,
        exportAllCSV: wailsGateway.ExportAllCSV,
        exportJSON: wailsGateway.ExportJSON,
        exportAllJSON: wailsGateway.ExportAllJSON,
        exportSQLInsert: wailsGateway.ExportSQLInsert,
        exportAllSQLInsert: wailsGateway.ExportAllSQLInsert,
        ...(wailsGateway.PreflightQuery ? { preflight: wailsGateway.PreflightQuery } : {}),
        ...(wailsGateway.PreviewAffectedRows
            ? { previewAffectedRows: wailsGateway.PreviewAffectedRows }
            : {}),
        ...(wailsGateway.OpenWritePreview
            ? { openWritePreview: wailsGateway.OpenWritePreview }
            : {}),
        ...(wailsGateway.FetchWritePreviewRows
            ? { fetchWritePreviewRows: wailsGateway.FetchWritePreviewRows }
            : {}),
        ...(wailsGateway.CloseWritePreview
            ? { closeWritePreview: wailsGateway.CloseWritePreview }
            : {}),
        ...(wailsGateway.UnlockProductionWrites
            ? { unlockProductionWrites: wailsGateway.UnlockProductionWrites }
            : {}),
        ...(wailsGateway.SetPendingQueryAuditMeta
            ? { setPendingQueryAuditMeta: wailsGateway.SetPendingQueryAuditMeta }
            : {}),
    });

    readonly schema = withKernelResult('schema', {
        fetchDatabaseSchema: wailsGateway.FetchDatabaseSchema,
        buildQualifiedTableSelect: wailsGateway.BuildQualifiedTableSelect,
        fetchTableColumns: wailsGateway.FetchTableColumns,
        fetchTableRelationships: wailsGateway.FetchTableRelationships,
        countReferencingRows: wailsGateway.CountReferencingRows,
        createTable: wailsGateway.CreateTable,
        dropObject: wailsGateway.DropObject,
        dropObjectAdvanced: wailsGateway.DropObjectAdvanced,
        truncateTable: wailsGateway.TruncateTable,
        fetchSchemaSnapshot: wailsGateway.FetchSchemaSnapshot,
        generateSchemaMigration: wailsGateway.GenerateSchemaMigration,
        getTableDDL: wailsGateway.GetTableDDL,
        getCatalogObjectDetails: wailsGateway.GetCatalogObjectDetails,
        alterTableColumn: wailsGateway.AlterTableColumn,
        reorderTableColumns: wailsGateway.ReorderTableColumns,
        addTableColumn: wailsGateway.AddTableColumn,
        dropTableColumn: wailsGateway.DropTableColumn,
        getIndexes: wailsGateway.GetIndexes,
        createIndex: wailsGateway.CreateIndex,
        dropIndex: wailsGateway.DropIndex,
        previewCreateIndexDDL: wailsGateway.PreviewCreateIndexDDL,
        previewDropIndexDDL: wailsGateway.PreviewDropIndexDDL,
        getCheckConstraints: wailsGateway.GetCheckConstraints,
        createCheckConstraint: wailsGateway.CreateCheckConstraint,
        dropCheckConstraint: wailsGateway.DropCheckConstraint,
        previewAddCheckConstraintDDL: wailsGateway.PreviewAddCheckConstraintDDL,
        previewDropCheckConstraintDDL: wailsGateway.PreviewDropCheckConstraintDDL,
        getUniqueConstraints: wailsGateway.GetUniqueConstraints,
        createUniqueConstraint: wailsGateway.CreateUniqueConstraint,
        dropUniqueConstraint: wailsGateway.DropUniqueConstraint,
        getPrimaryKey: wailsGateway.GetPrimaryKey,
        addPrimaryKey: wailsGateway.AddPrimaryKey,
        dropPrimaryKey: wailsGateway.DropPrimaryKey,
        previewAddPrimaryKeyDDL: wailsGateway.PreviewAddPrimaryKeyDDL,
        previewDropPrimaryKeyDDL: wailsGateway.PreviewDropPrimaryKeyDDL,
        getForeignKeys: wailsGateway.GetForeignKeys,
        createForeignKey: wailsGateway.CreateForeignKey,
        updateForeignKey: wailsGateway.UpdateForeignKey,
        dropForeignKey: wailsGateway.DropForeignKey,
        snapshotStoredProcedures: wailsGateway.SnapshotStoredProcedures,
        runGitTrackingMigration: wailsGateway.RunGitTrackingMigration,
        ...(wailsGateway.ListSchemaRollbackTargets
            ? { listSchemaRollbackTargets: wailsGateway.ListSchemaRollbackTargets }
            : {}),
        ...(wailsGateway.RestoreSchemaRollbackTarget
            ? { restoreSchemaRollbackTarget: wailsGateway.RestoreSchemaRollbackTarget }
            : {}),
    });

    readonly project = withKernelResult('project', {
        listProjects: wailsGateway.ListProjects,
        getProject: wailsGateway.GetProject,
        createProject: wailsGateway.CreateProject,
        saveProject: wailsGateway.SaveProject,
        deleteProject: wailsGateway.DeleteProject,
        openProject: wailsGateway.OpenProject,
        openProjectInNewWindow: wailsGateway.OpenProjectInNewWindow,
        getLaunchProjectID: wailsGateway.GetLaunchProjectID,
        openProjectFromDirectory: wailsGateway.OpenProjectFromDirectory,
        getActiveProject: wailsGateway.GetActiveProject,
        getDefaultProjectStorageRoot: wailsGateway.GetDefaultProjectStorageRoot,
        pickDirectory: wailsGateway.PickDirectory,
        openDirectoryInExplorer: wailsGateway.OpenDirectoryInExplorer,
        openFileInDefaultApp: wailsGateway.OpenFileInDefaultApp,
        forceQuit: wailsGateway.ForceQuit,
        connectProjectEnvironment: wailsGateway.ConnectProjectEnvironment,
    });

    readonly security = (() => {
        const getProSecurityState = wailsGateway.GetProSecurityState;
        const configureAppLock = wailsGateway.ConfigureAppLock;
        const lockApp = wailsGateway.LockApp;
        const unlockApp = wailsGateway.UnlockApp;
        const unlockAppWithOS = wailsGateway.UnlockAppWithOS;
        const configureSecretVault = wailsGateway.ConfigureSecretVault;
        const unlockSecretVault = wailsGateway.UnlockSecretVault;
        const lockSecretVault = wailsGateway.LockSecretVault;

        return withKernelResult('security', {
            ...(getProSecurityState ? { getProSecurityState: () => getProSecurityState() } : {}),
            ...(configureAppLock
                ? {
                      configureAppLock: (enabled: boolean, timeout: number, pin: string) =>
                          configureAppLock(enabled, timeout, pin),
                  }
                : {}),
            ...(lockApp ? { lockApp: () => lockApp() } : {}),
            ...(unlockApp ? { unlockApp: (pin: string) => unlockApp(pin) } : {}),
            ...(unlockAppWithOS ? { unlockAppWithOS: () => unlockAppWithOS() } : {}),
            ...(configureSecretVault
                ? {
                      configureSecretVault: (enabled: boolean, password: string) =>
                          configureSecretVault(enabled, password),
                  }
                : {}),
            ...(unlockSecretVault
                ? {
                      unlockSecretVault: (password: string) => unlockSecretVault(password),
                  }
                : {}),
            ...(lockSecretVault ? { lockSecretVault: () => lockSecretVault() } : {}),
        });
    })();

    readonly settings = withKernelResult('settings', {
        getPreferences: wailsGateway.GetPreferences,
        setPreferences: wailsGateway.SetPreferences,
        checkForUpdates: wailsGateway.CheckForUpdates,
        getAboutInfo: wailsGateway.GetAboutInfo,
        restartAndUpdate: wailsGateway.RestartAndUpdate,
        consumeLastUpdateResult: wailsGateway.ConsumeLastUpdateResult,
        getEnvironmentPolicies: wailsGateway.GetEnvironmentPolicies,
        setEnvironmentSafetyLevel: wailsGateway.SetEnvironmentSafetyLevel,
        exportProfilePackage: wailsGateway.ExportProfilePackage,
        shouldPromptForFeedback: wailsGateway.ShouldPromptForFeedback,
        markFeedbackPrompted: wailsGateway.MarkFeedbackPrompted,
        submitFeedback: wailsGateway.SubmitFeedback,
    });

    readonly sourceControl = withKernelResult('sourceControl', {
        getStatus: wailsGateway.SCGetStatus,
        stageFile: wailsGateway.SCStageFile,
        unstageFile: wailsGateway.SCUnstageFile,
        stageAll: wailsGateway.SCStageAll,
        commit: wailsGateway.SCCommit,
        getHistory: wailsGateway.SCGetHistory,
        getFileDiffs: wailsGateway.SCGetFileDiffs,
        getWorkingFileDiff: wailsGateway.SCGetWorkingFileDiff,
        listBranches: wailsGateway.SCListBranches,
        checkoutBranch: wailsGateway.SCCheckoutBranch,
        createBranch: wailsGateway.SCCreateBranch,
        createBranchFrom: wailsGateway.SCCreateBranchFrom,
        checkoutDetached: wailsGateway.SCCheckoutDetached,
        initRepo: wailsGateway.SCInitRepo,
        readGitIgnore: wailsGateway.SCReadGitIgnore,
        writeGitIgnore: wailsGateway.SCWriteGitIgnore,
    });

    readonly audit = withKernelResult('audit', {
        getSQLAuditLog: wailsGateway.GetSQLAuditLog,
        clearSQLAuditLog: wailsGateway.ClearSQLAuditLog,
        exportSQLAuditLog: wailsGateway.ExportSQLAuditLog,
        pinAuditEntry: wailsGateway.PinAuditEntry,
        getAuditLogPath: wailsGateway.GetAuditLogPath,
        getAppDebugLog: wailsGateway.GetAppDebugLog,
        getAppDebugLogPath: wailsGateway.GetAppDebugLogPath,
        logClientEvent: wailsGateway.LogClientEvent,
    });

    readonly gitTracking: GitTrackingAdapter = {
        enable: () => wailsGateway.EnableGitTracking(),
        disable: () => wailsGateway.DisableGitTracking(),
        getStatus: () => wailsGateway.GetGitTrackingStatus(),
        listTimeline: (limit, eventType) => wailsGateway.ListGitTimeline(limit, eventType),
        getCommitDiff: commitHash => wailsGateway.GetGitCommitDiff(commitHash),
        getCommitFileDiffs: commitHash => wailsGateway.GetCommitFileDiffs(commitHash),
        manualCommit: message => wailsGateway.ManualGitCommit(message),
        getPendingChanges: () => wailsGateway.GetGitPendingChanges(),
        restoreCommit: commitHash => wailsGateway.RestoreGitCommit(commitHash),
        snapshotStoredProcedures: schema => wailsGateway.SnapshotStoredProcedures(schema),
        runMigration: () => wailsGateway.RunGitTrackingMigration(),
    };

    readonly template = withKernelResult('template', {
        loadTemplates: wailsGateway.LoadTemplates,
        saveTemplate: wailsGateway.SaveTemplate,
        deleteTemplate: wailsGateway.DeleteTemplate,
    });

    readonly script = withKernelResult('script', {
        getScripts: wailsGateway.GetScripts,
        getScriptContent: wailsGateway.GetScriptContent,
        saveScript: wailsGateway.SaveScript,
        deleteScript: wailsGateway.DeleteScript,
    });

    readonly bookmark = withKernelResult('bookmark', {
        getBookmarks: wailsGateway.GetBookmarks,
        getBookmarksByConnection: wailsGateway.GetBookmarksByConnection,
        saveBookmark: wailsGateway.SaveBookmark,
        deleteBookmark: wailsGateway.DeleteBookmark,
    });

    readonly imageColumn = withKernelResult('imageColumn', {
        getImageColumns: wailsGateway.GetImageColumns,
        getImageColumnsByConnection: wailsGateway.GetImageColumnsByConnection,
        setImageColumn: wailsGateway.SetImageColumn,
    });

    readonly license: LicenseAdapter = (() => {
        const getLicenseState = wailsGateway.GetLicenseState;
        const startTrial = wailsGateway.StartTrial;
        const restoreLicenseByEmail = wailsGateway.RestoreLicenseByEmail;
        const activateLicense = wailsGateway.ActivateLicense;
        const refreshLicense = wailsGateway.RefreshLicense;
        const deactivateLicense = wailsGateway.DeactivateLicense;
        const setSavedLicenseEmail = wailsGateway.SetSavedLicenseEmail;
        const checkFeatureAccess = wailsGateway.CheckFeatureAccess;
        const recordFeatureUsage = wailsGateway.RecordFeatureUsage;
        const createCheckoutUrl = wailsGateway.CreateCheckoutURL;

        return {
            ...(getLicenseState ? { getLicenseState: () => getLicenseState() } : {}),
            ...(startTrial
                ? {
                      startTrial: (email: string) => startTrial(email),
                  }
                : {}),
            ...(restoreLicenseByEmail
                ? {
                      restoreLicenseByEmail: (email: string) => restoreLicenseByEmail(email),
                  }
                : {}),
            ...(activateLicense
                ? {
                      activateLicense: (key: string, device: string) =>
                          activateLicense(key, device),
                  }
                : {}),
            ...(refreshLicense
                ? {
                      refreshLicense: (token: string) => refreshLicense(token),
                  }
                : {}),
            ...(deactivateLicense
                ? {
                      deactivateLicense: (reason: string) => deactivateLicense(reason),
                  }
                : {}),
            ...(setSavedLicenseEmail
                ? {
                      setSavedLicenseEmail: (email: string) => setSavedLicenseEmail(email),
                  }
                : {}),
            ...(checkFeatureAccess
                ? {
                      checkFeatureAccess: (id: string) => checkFeatureAccess(id),
                  }
                : {}),
            ...(recordFeatureUsage
                ? {
                      recordFeatureUsage: (featureId: string) => recordFeatureUsage(featureId),
                  }
                : {}),
            ...(createCheckoutUrl
                ? {
                      createCheckoutUrl: (email: string) => createCheckoutUrl(email),
                  }
                : {}),
        };
    })();

    readonly plugin: PluginAdapter = (() => {
        const registerPluginContribution = wailsGateway.RegisterPluginContribution;
        const listPluginByCapability = wailsGateway.ListPluginByCapability;

        return {
            ...(registerPluginContribution
                ? {
                      registerPluginContribution: (c: PluginContribution) =>
                          registerPluginContribution(c),
                  }
                : {}),
            ...(listPluginByCapability
                ? {
                      listPluginByCapability: (cap: string) => listPluginByCapability(cap),
                  }
                : {}),
        };
    })();

    readonly queryStats: QueryStatsAdapter = (() => {
        const getQueryStats = wailsGateway.GetQueryStats;

        return {
            ...(getQueryStats
                ? {
                      getQueryStats: (filter: QueryStatFilter) => getQueryStats(filter),
                  }
                : {}),
        };
    })();

    readonly job = withKernelResult('job', {
        list: wailsGateway.ListJobs,
        cancel: wailsGateway.CancelJob,
        kill: wailsGateway.KillJob,
        clearFinished: wailsGateway.ClearFinishedJobs,
    });

    readonly dataImport = withKernelResult('dataImport', {
        pickCSVFile: wailsGateway.PickCSVFile,
        previewCSVImport: wailsGateway.PreviewCSVImport,
        startCSVImport: wailsGateway.StartCSVImport,
    });

    readonly serverSession = withKernelResult('serverSession', {
        list: wailsGateway.ListServerSessions,
        cancel: wailsGateway.CancelServerSession,
        kill: wailsGateway.KillServerSession,
    });

    readonly ai = withKernelResult('ai', {
        getSettings: wailsGateway.GetAISettings,
        setSettings: wailsGateway.SetAISettings,
        saveKey: wailsGateway.SaveAIProviderKey,
        clearKey: wailsGateway.ClearAIProviderKey,
        preview: wailsGateway.PreviewAIChat,
        send: wailsGateway.SendAIChat,
        listModels: wailsGateway.ListAIModels,
        listMentions: wailsGateway.ListAIMentions,
        cancelChat: wailsGateway.CancelAIChat,
        revokeDataGrant: wailsGateway.RevokeAIDataGrant,
        createSession: wailsGateway.CreateAISession,
        listSessions: wailsGateway.ListAISessions,
        getSession: wailsGateway.GetAISession,
        renameSession: wailsGateway.RenameAISession,
        deleteSession: wailsGateway.DeleteAISession,
        startMCPServer: wailsGateway.StartAIMCPServer,
        stopMCPServer: wailsGateway.StopAIMCPServer,
        getMCPStatus: wailsGateway.GetAIMCPStatus,
        connectMCPClient: wailsGateway.ConnectAIMCPClient,
        disconnectMCPClient: wailsGateway.DisconnectAIMCPClient,
        rotateMCPToken: wailsGateway.RotateAIMCPToken,
        setMCPAutoStart: wailsGateway.SetAIMCPAutoStart,
        listChanges: wailsGateway.ListAIChanges,
        getChange: wailsGateway.GetAIChange,
        approveChange: wailsGateway.ApproveAIChange,
        rejectChange: wailsGateway.RejectAIChange,
        resolveChatApproval: wailsGateway.ResolveAIChatApproval,
        listMemoryNotes: wailsGateway.ListAIMemoryNotes,
        addMemoryNote: wailsGateway.AddAIMemoryNote,
        deleteMemoryNote: wailsGateway.DeleteAIMemoryNote,
    });

    readonly stats = withKernelResult('stats', {
        start: wailsGateway.StartStatsSampler,
        stop: wailsGateway.StopStatsSampler,
    });

    readonly terminal = withKernelResult('terminal', {
        open: wailsGateway.TerminalOpen,
        write: wailsGateway.TerminalWrite,
        resize: wailsGateway.TerminalResize,
        close: wailsGateway.TerminalClose,
    });
}
