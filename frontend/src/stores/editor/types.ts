// SPDX-License-Identifier: GPL-3.0-only

import { TabType, TAB_TYPE, GENERATED_KIND } from '../../lib/constants';
import { TabGroupSplitDirection } from '../../lib/enums';
import type {
    SchemaDiffSource,
    SchemaMigrationResult,
    SchemaSnapshot,
} from '../../types/schemaDiff';

export { TabGroupSplitDirection };

export interface TabQueryContext {
    savedScriptId?: string;
    scriptProjectId?: string;
    scriptConnectionName?: string;
    resultFilterExpr?: string;
    resultOrderByExpr?: string;
    resultQuickFilter?: string;
    resultFilterBaseQuery?: string;
    schemaDiffLeftSource?: SchemaDiffSource;
    schemaDiffRightSource?: SchemaDiffSource;
    schemaDiffLeftSnapshot?: SchemaSnapshot;
    schemaDiffRightSnapshot?: SchemaSnapshot;
    schemaDiffMigration?: SchemaMigrationResult;
    schemaDiffShowUnified?: boolean;
    schemaDiffIgnoreWhitespace?: boolean;
    schemaDiffOptions?: {
        tables: boolean;
        indexes: boolean;
        constraints: boolean;
        views: boolean;
        routines: boolean;
    };
    sourceControlFile?: 'gitignore';
    isWritePreview?: boolean;
    writePreviewSessionId?: string;
    writePreviewOriginalSql?: string;
    writePreviewSourceTabId?: string;
    writePreviewEnvironmentKey?: string;
    writePreviewRiskLevel?: string;
    writePreviewPreviewRowCount?: number;
    writePreviewUsedProtectionLayers?: string[];
}

export interface CatalogTabContext {
    /** Pool connection ID (stable identity — not the display Name, which
     * can be renamed). */
    connectionID: string;
    dbName: string;
    driver: string;
    objectKind: string;
    schema: string;
    name: string;
    catalogPath: string;
    tableName?: string;
    environmentKey?: string;
}

// PinnedConnection is a Table/Catalog tab's Pinned Environment (ADR-0001,
// docs/adr/0001-pinned-environment-context-for-data-tabs.md): captured once
// at tab-open time, immutable for the tab's life, and never re-resolved
// when the Active Environment (Toolbar's env switcher, used by Query tabs)
// changes elsewhere in the app.
export interface PinnedConnection {
    /** Pool connection ID (stable identity — not the display Name, which
     * can be renamed). */
    connectionID: string;
    dbName: string;
    driver: string;
    environmentKey: string;
}

export interface Tab {
    id: string;
    name: string;
    query: string;
    isRunning: boolean;
    type?: TabType;
    content?: string;
    catalog?: CatalogTabContext;
    readOnly?: boolean;
    sourceTabId?: string;
    generatedKind?: (typeof GENERATED_KIND)[keyof typeof GENERATED_KIND];
    context?: TabQueryContext;
    gitDiffBefore?: string;
    gitDiffAfter?: string;
    // Table/Catalog tabs only — see PinnedConnection. Query tabs leave this
    // undefined and stay on the ambient Active Environment.
    connection?: PinnedConnection;
}

export interface TabGroup {
    id: string;
    tabs: Tab[];
    activeTabId: string | null;
}

export interface ProjectEditorSession {
    groups: TabGroup[];
    activeGroupId: string | null;
}

export interface EditorState {
    projectSessions: Record<string, ProjectEditorSession>;
    activeProjectId: string | null;
    groups: TabGroup[];
    activeGroupId: string | null;

    switchProject: (projectId: string | null) => void;
    hydrateProjectSession: (
        projectId: string | null,
        session: Partial<ProjectEditorSession>,
        activate?: boolean,
    ) => void;
    resetProject: (projectId?: string | null) => void;
    addTab: (tabInit?: Partial<Tab>, targetGroupId?: string) => string;
    removeTab: (id: string, groupId?: string) => void;
    setActiveTabId: (tabId: string, groupId: string) => void;
    setActiveGroupId: (groupId: string) => void;
    updateTabQuery: (id: string, query: string) => void;
    updateTabContext: (id: string, patch: Partial<TabQueryContext>) => void;
    setTabRunning: (id: string, isRunning: boolean) => void;
    renameTab: (id: string, newName: string) => void;
    setTabQuery: (id: string, query: string) => void;
    splitGroup: (sourceGroupId: string, tabId: string) => void;
    splitGroupFromDrag: (
        sourceGroupId: string,
        tabId: string,
        targetGroupId: string,
        direction: TabGroupSplitDirection,
    ) => void;
    closeGroup: (groupId: string) => void;
    moveTab: (
        tabId: string,
        sourceGroupId: string,
        targetGroupId: string,
        newIndex: number,
    ) => void;
}
