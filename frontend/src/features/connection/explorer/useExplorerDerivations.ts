// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { CATEGORY_KEY, type CategoryGroupNode } from '../databaseExplorerTypes';

export const ALL_SCHEMAS_VALUE = '__all_schemas__';
export const PRIMARY_CATEGORY_KEYS = new Set<string>([CATEGORY_KEY.TABLES, CATEGORY_KEY.VIEWS]);

interface ExplorerDerivationsInput {
    categories: CategoryGroupNode[];
    selectedSchema: string;
    activeCategoryKey: string;
    showMoreCategories: boolean;
    schemaNames: string[];
}

// Pure view-state derivations for the explorer: schema scoping, category
// grouping, and active-category resolution. No effects, no store writes.
export function useExplorerDerivations({
    categories,
    selectedSchema,
    activeCategoryKey,
    showMoreCategories,
    schemaNames,
}: ExplorerDerivationsInput) {
    const availableSchemas = useMemo(() => {
        if (schemaNames.length === 0) return [];
        return Array.from(new Set(schemaNames.filter(Boolean))).sort((left, right) =>
            left.localeCompare(right),
        );
    }, [schemaNames]);

    const scopedCategories = useMemo(() => {
        if (selectedSchema === ALL_SCHEMAS_VALUE) return categories;
        return categories.map(category => {
            const scopedSchemas = category.schemas.filter(
                bucket => bucket.schemaName === selectedSchema,
            );
            return {
                ...category,
                schemas: scopedSchemas,
                totalCount: scopedSchemas.reduce((sum, bucket) => sum + bucket.totalCount, 0),
            };
        });
    }, [categories, selectedSchema]);

    const primaryCategories = useMemo(
        () => scopedCategories.filter(category => PRIMARY_CATEGORY_KEYS.has(category.key)),
        [scopedCategories],
    );
    const secondaryCategories = useMemo(
        () => scopedCategories.filter(category => !PRIMARY_CATEGORY_KEYS.has(category.key)),
        [scopedCategories],
    );
    const visibleCategories = useMemo(
        () => (showMoreCategories ? scopedCategories : primaryCategories),
        [primaryCategories, scopedCategories, showMoreCategories],
    );
    const activeCategory = useMemo(
        () =>
            scopedCategories.find(category => category.key === activeCategoryKey) ||
            scopedCategories[0] ||
            null,
        [activeCategoryKey, scopedCategories],
    );

    return {
        availableSchemas,
        scopedCategories,
        primaryCategories,
        secondaryCategories,
        visibleCategories,
        activeCategory,
    };
}
