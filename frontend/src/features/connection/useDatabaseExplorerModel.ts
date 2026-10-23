// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo } from 'react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { type SchemaNode, useSchemaStore } from '../../stores/schemaStore';
import { useDatabaseExplorerUiStore } from '../../stores/databaseExplorerUiStore';
import { onSchemaLoaded } from '../../lib/events';
import { getDriverCategoryDefinitions } from './databaseExplorerCategoryRegistry';
import { buildCategoryTree, buildDatabaseExplorerPersistKey } from './databaseExplorerModel';
import type { CategoryGroupNode } from './databaseExplorerTypes';

interface UseDatabaseExplorerModelArgs {
    profileName: string;
    dbName: string;
    driver: string;
    filter: string;
    fuzzyMatch: boolean;
}

interface UseDatabaseExplorerModelResult {
    schemaKey: string;
    treePersistKey: string;
    categories: CategoryGroupNode[];
    isLoading: boolean;
    hasLoadedSchemas: boolean;
    isFiltering: boolean;
    isCategoryExpanded: (categoryKey: string) => boolean;
    isSchemaExpanded: (categoryKey: string, schemaName: string) => boolean;
    toggleCategory: (categoryKey: string) => void;
    toggleSchema: (categoryKey: string, schemaName: string) => void;
}

export function useDatabaseExplorerModel({
    profileName,
    dbName,
    driver,
    filter,
    fuzzyMatch,
}: UseDatabaseExplorerModelArgs): UseDatabaseExplorerModelResult {
    const schemaKey = `${profileName}:${dbName}`;
    const treePersistKey = buildDatabaseExplorerPersistKey(profileName, dbName, driver);
    const schemas = useSchemaStore(state => state.trees[schemaKey]);
    const isLoading = useSchemaStore(state => state.loadingKeys.has(schemaKey));
    const setTree = useSchemaStore(state => state.setTree);
    const setLoading = useSchemaStore(state => state.setLoading);
    const beginLoad = useSchemaStore(state => state.beginLoad);
    const ensureDefaults = useDatabaseExplorerUiStore(state => state.ensureDefaults);
    const toggleCategoryState = useDatabaseExplorerUiStore(state => state.toggleCategory);
    const toggleSchemaState = useDatabaseExplorerUiStore(state => state.toggleSchema);
    const treeState = useDatabaseExplorerUiStore(state => state.treeStateByKey[treePersistKey]);

    const definitions = useMemo(() => getDriverCategoryDefinitions(driver), [driver]);
    const categories = useMemo(
        () =>
            buildCategoryTree({
                schemas: schemas as SchemaNode[] | undefined,
                definitions,
                filter,
                fuzzyMatch,
                includeEmptyCategories: true,
            }),
        [schemas, definitions, filter, fuzzyMatch],
    );
    const isFiltering = filter.trim().length > 0;

    useEffect(() => {
        ensureDefaults(treePersistKey, 'tables');
    }, [ensureDefaults, treePersistKey]);

    useEffect(() => {
        const unsub = onSchemaLoaded(payload => {
            if (payload.profileName === profileName && payload.dbName === dbName) {
                setTree(profileName, dbName, payload.schemas);
            }
        });
        return () => unsub();
    }, [dbName, profileName, setTree]);

    useEffect(() => {
        if (schemas || isLoading) return;
        if (!beginLoad(profileName, dbName)) return;
        getApiGateway()
            .schema.fetchDatabaseSchema(profileName, dbName)
            .then(unwrapOrThrow)
            .catch(() => {
                setLoading(profileName, dbName, false);
            });
    }, [dbName, isLoading, profileName, schemas, beginLoad, setLoading]);

    const isCategoryExpanded = (categoryKey: string) => {
        if (isFiltering) return true;
        return Boolean(treeState?.expandedCategories.includes(categoryKey));
    };

    const isSchemaExpanded = (categoryKey: string, schemaName: string) => {
        if (isFiltering) return true;
        const expandedSchemas = treeState?.expandedSchemasByCategory[categoryKey] || [];
        return expandedSchemas.includes(schemaName);
    };

    const toggleCategory = (categoryKey: string) => {
        toggleCategoryState(treePersistKey, categoryKey);
    };

    const toggleSchema = (categoryKey: string, schemaName: string) => {
        toggleSchemaState(treePersistKey, categoryKey, schemaName);
    };

    return {
        schemaKey,
        treePersistKey,
        categories,
        isLoading,
        hasLoadedSchemas: Boolean(schemas),
        isFiltering,
        isCategoryExpanded,
        isSchemaExpanded,
        toggleCategory,
        toggleSchema,
    };
}
