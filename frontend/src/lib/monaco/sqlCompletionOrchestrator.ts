// SPDX-License-Identifier: GPL-3.0-only

import { mergeWithBuiltinTemplates } from '../builtinTemplates';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useTemplateStore } from '../../stores/templateStore';
import { buildCompletionPlan, type SqlCompletionRequest } from './sqlCompletionEngineCore';
import { getSchemasForActiveDatabase } from './sqlCompletionIdentifiers';
import { resolveTableSuggestionItem } from './sqlSuggestionTableDocs';
import type { languages } from 'monaco-editor';
import type { SchemaNode } from '../../stores/schemaStore';

export type SqlCompletionEditorRequest = Omit<
    SqlCompletionRequest,
    'driver' | 'currentSchema' | 'profileKey' | 'dbName' | 'catalogSnapshot' | 'templates'
> & {
    shouldAbort?: () => boolean;
};

export function resolveCompletionCatalog(
    trees: Record<string, SchemaNode[]>,
    profileKey: string,
    dbName: string,
): SchemaNode[] {
    const exact = getSchemasForActiveDatabase(trees, profileKey, dbName);
    if (exact.length > 0) return exact;

    const normalizedProfile = profileKey.trim().toLowerCase();
    const normalizedDb = dbName.trim().toLowerCase();
    const entries = Object.entries(trees).filter(([, schemas]) => schemas.length > 0);
    const caseInsensitiveExact = entries.find(([key]) => {
        const separator = key.lastIndexOf(':');
        if (separator < 0) return false;
        return (
            key.slice(0, separator).trim().toLowerCase() === normalizedProfile &&
            key
                .slice(separator + 1)
                .trim()
                .toLowerCase() === normalizedDb
        );
    });
    if (caseInsensitiveExact) return caseInsensitiveExact[1];

    const sameDatabase = entries.filter(([key]) => {
        const separator = key.lastIndexOf(':');
        return (
            separator >= 0 &&
            key
                .slice(separator + 1)
                .trim()
                .toLowerCase() === normalizedDb
        );
    });
    if (sameDatabase.length === 1) return sameDatabase[0][1];
    if (entries.length === 1) return entries[0][1];
    return [];
}

export async function buildEditorCompletionPlan(request: SqlCompletionEditorRequest) {
    const { shouldAbort, ...engineRequest } = request;
    const profile = useConnectionStore.getState().activeProfile;
    const profileKey = profile?.name ?? '';
    const dbName = profile?.db_name ?? '';
    const activeProject = useProjectStore.getState().activeProject;
    const environmentKey =
        useEnvironmentStore.getState().activeEnvironmentKey ||
        activeProject?.default_environment_key;
    const currentSchema =
        activeProject?.environments?.find(environment => environment.key === environmentKey)
            ?.last_schema || '';
    const schemas = resolveCompletionCatalog(useSchemaStore.getState().trees, profileKey, dbName);

    return buildCompletionPlan(
        {
            ...engineRequest,
            driver: profile?.driver || '',
            currentSchema,
            profileKey,
            dbName,
            catalogSnapshot: schemas,
            templates:
                engineRequest.editorFlavor === 'main'
                    ? mergeWithBuiltinTemplates(
                          profile?.driver || '',
                          useTemplateStore.getState().templates,
                      )
                    : [],
        },
        {
            shouldAbort,
            fetchColumns: async (schemaName, tableName) => {
                if (shouldAbort?.()) return [];
                return useSchemaStore
                    .getState()
                    .checkAndFetchColumns(profileKey, dbName, schemaName, tableName);
            },
            fetchRelationships: async (schemaName, tableName) => {
                if (shouldAbort?.()) return [];
                return useSchemaStore
                    .getState()
                    .checkAndFetchRelationships(profileKey, dbName, schemaName, tableName);
            },
        },
        activeProject?.completion_memory,
    );
}

export function resolveEditorCompletionItem(
    item: languages.CompletionItem,
    shouldAbort: () => boolean,
) {
    return resolveTableSuggestionItem(item, {
        shouldAbort,
        fetchColumns: meta =>
            useSchemaStore
                .getState()
                .checkAndFetchColumns(
                    meta.profileKey,
                    meta.dbName,
                    meta.schemaName,
                    meta.tableName,
                ),
    });
}
