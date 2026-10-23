// SPDX-License-Identifier: GPL-3.0-only

import { CATEGORY_KEY, type CategoryKey } from './databaseExplorerTypes';

// Catalog object kinds are the singular spellings used by catalog tabs and
// the backend (CatalogObjectDetails); explorer category keys are plural.
// Only the aggregate-function pair differs beyond pluralization, but keep
// the mapping total so the two vocabularies stay convertible in one place.

const CATALOG_KIND_TO_CATEGORY_KEY: Record<string, CategoryKey> = {
    aggregate_function: CATEGORY_KEY.AGGREGATE_FUNCTIONS,
};

const CATEGORY_KEY_TO_CATALOG_KIND: Partial<Record<CategoryKey, string>> = {
    [CATEGORY_KEY.AGGREGATE_FUNCTIONS]: 'aggregate_function',
};

/** Catalog tab objectKind -> explorer category key. */
export function catalogKindToCategoryKey(kind: string): string {
    return CATALOG_KIND_TO_CATEGORY_KEY[kind] ?? kind;
}

/** Explorer category key -> catalog tab objectKind. */
export function categoryKeyToCatalogKind(categoryKey: string): string {
    return CATEGORY_KEY_TO_CATALOG_KIND[categoryKey as CategoryKey] ?? categoryKey;
}
