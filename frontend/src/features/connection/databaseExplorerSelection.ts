// SPDX-License-Identifier: GPL-3.0-only

import { CATEGORY_KEY, type CategoryGroupNode } from './databaseExplorerTypes';

export interface DatabaseExplorerSelection {
    categoryKey: string;
    schemaName: string;
    objectName: string;
    selectedObjectKey: string;
    isPrimaryCategory: boolean;
}

function findObjectInCategory(category: CategoryGroupNode, schemaName: string, objectName: string) {
    const bucket = category.schemas.find(schema => schema.schemaName === schemaName);
    if (!bucket) return null;
    const item = bucket.items.find(candidate => candidate.name === objectName);
    if (!item) return null;
    return {
        categoryKey: category.key,
        schemaName,
        objectName: item.name,
        selectedObjectKey: `${category.key}:${schemaName}.${item.name}`,
        isPrimaryCategory:
            category.key === CATEGORY_KEY.TABLES || category.key === CATEGORY_KEY.VIEWS,
    } satisfies DatabaseExplorerSelection;
}

export function resolveDatabaseExplorerSelection(
    categories: CategoryGroupNode[],
    schemaName: string,
    objectName: string,
    targetCategoryKey?: string,
): DatabaseExplorerSelection | null {
    if (!schemaName || !objectName) return null;

    if (targetCategoryKey) {
        const targetCategory = categories.find(category => category.key === targetCategoryKey);
        if (targetCategory) {
            const selected = findObjectInCategory(targetCategory, schemaName, objectName);
            if (selected) return selected;
        }
    }

    const openableCategories = categories.filter(category => category.canOpenDefinition);
    if (openableCategories.length === 0) return null;

    const tableCategory = openableCategories.find(category => category.key === CATEGORY_KEY.TABLES);
    if (tableCategory && tableCategory.key !== targetCategoryKey) {
        const selected = findObjectInCategory(tableCategory, schemaName, objectName);
        if (selected) return selected;
    }

    for (const category of openableCategories) {
        if (category.key === CATEGORY_KEY.TABLES || category.key === targetCategoryKey) continue;
        const selected = findObjectInCategory(category, schemaName, objectName);
        if (selected) return selected;
    }

    return null;
}
