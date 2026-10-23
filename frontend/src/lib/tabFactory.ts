// SPDX-License-Identifier: GPL-3.0-only

import { TAB_TYPE, GENERATED_KIND } from './constants';
import type {
    CatalogTabContext,
    PinnedConnection,
    Tab,
    TabQueryContext,
} from '../stores/editor/types';

export interface TabFactory {
    type: string;
    create(config: Record<string, unknown>): Partial<Tab>;
}

export function createQueryTab(
    name?: string,
    query?: string,
    context?: Partial<TabQueryContext>,
): Partial<Tab> {
    return {
        type: TAB_TYPE.QUERY,
        name: name || 'New Query',
        query: query || '',
        context,
    };
}

export function createSettingsTab(): Partial<Tab> {
    return {
        type: TAB_TYPE.SETTINGS,
        name: 'Settings',
    };
}

export function createShortcutsTab(): Partial<Tab> {
    return {
        type: TAB_TYPE.SHORTCUTS,
        name: 'Keyboard Shortcuts',
    };
}

// createTableTab is the single place a Table tab's Pinned Environment
// (ADR-0001) gets stamped — connection is captured once here and never
// mutated afterward. Every call site that opens a table tab must go through
// this factory rather than constructing `{ type: 'table', ... }` inline, so
// pinning has exactly one implementation to get right.
export function createTableTab(qualifiedName: string, connection?: PinnedConnection): Partial<Tab> {
    return {
        type: TAB_TYPE.TABLE,
        name: qualifiedName,
        content: qualifiedName,
        query: '',
        connection,
    };
}

export function createCatalogTab(
    catalog: CatalogTabContext,
    connection?: PinnedConnection,
): Partial<Tab> {
    return {
        type: TAB_TYPE.CATALOG,
        name: catalog.name,
        readOnly: true,
        // catalog carries its own copy of the pinned identity (existing
        // pattern — connectionID/driver were already duplicated here)
        // rather than requiring every catalog-detail call site to also
        // thread the separate `connection` prop through.
        catalog: {
            ...catalog,
            connectionID: connection?.connectionID || catalog.connectionID,
            dbName: connection?.dbName || catalog.dbName,
        },
        connection,
    };
}

export function createCompareTab(name?: string): Partial<Tab> {
    return {
        type: TAB_TYPE.COMPARE,
        name: name || 'Schema Diff',
    };
}

export function createGitDiffTab(): Partial<Tab> {
    return {
        type: TAB_TYPE.GIT_DIFF,
        name: 'Git Diff',
        readOnly: true,
    };
}

export function createScriptTab(
    name: string,
    query: string,
    scriptId: string,
    projectId: string,
    connectionName: string,
): Partial<Tab> {
    return {
        type: TAB_TYPE.QUERY,
        name,
        query,
        context: {
            savedScriptId: scriptId,
            scriptProjectId: projectId,
            scriptConnectionName: connectionName,
        },
    };
}

export function createExplainTab(sourceTabId: string, analyze: boolean): Partial<Tab> {
    const explainTabId = `${sourceTabId}::explain:${analyze ? 'analyze' : 'plan'}`;
    return {
        id: explainTabId,
        name: analyze ? 'Explain (Analyze)' : 'Explain',
        type: TAB_TYPE.QUERY,
        sourceTabId,
        generatedKind: GENERATED_KIND.EXPLAIN,
        readOnly: true,
    };
}

export function createReadOnlyQueryTab(name: string, query: string): Partial<Tab> {
    return {
        type: TAB_TYPE.QUERY,
        name,
        query,
        readOnly: true,
    };
}

const factories = new Map<string, TabFactory>();

export function registerTabFactory(factory: TabFactory): void {
    factories.set(factory.type, factory);
}

export function resolveTabFactory(type: string): TabFactory | undefined {
    return factories.get(type);
}
