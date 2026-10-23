// SPDX-License-Identifier: GPL-3.0-only

import type { CategoryGroupNode, ObjectLeafNode, SchemaBucketNode } from '../databaseExplorerTypes';

export interface ExplorerSchemaRow {
    kind: 'schema';
    /** React key — a schema header appears exactly once per flat list. */
    key: string;
    bucket: SchemaBucketNode;
    /**
     * Whether this schema's objects are part of the list. When filtering, the
     * explorer force-expands every schema, so this is true more often than the
     * persisted expansion state suggests.
     */
    expanded: boolean;
    /** True when the list is showing filter results rather than the tree. */
    isFiltering: boolean;
}

export interface ExplorerObjectRow {
    kind: 'object';
    key: string;
    item: ObjectLeafNode;
    category: CategoryGroupNode;
    isFiltering: boolean;
}

export type ExplorerRow = ExplorerSchemaRow | ExplorerObjectRow;

/** Stable `[data-object-key]` identity for an object row, shared with selection sync. */
export function explorerObjectKey(categoryKey: string, item: ObjectLeafNode): string {
    return `${categoryKey}:${item.schemaName}.${item.name}`;
}

/** Stable `[data-object-key]` identity for a schema header. */
export function explorerSchemaKey(categoryKey: string, schemaName: string): string {
    return `schema:${categoryKey}:${schemaName}`;
}

/**
 * Flattens the active category into the single row list the explorer renders.
 *
 * The tree is only two levels deep, but rendering it as a tree means every
 * expanded schema mounts all of its objects at once — and filtering expands
 * every schema, so a keystroke could mount tens of thousands of rows. A flat
 * list is what lets the renderer mount only the rows in view.
 *
 * `isSchemaExpanded` is consulted here rather than by the renderer so the
 * expansion decision has exactly one owner: the same call decides both whether
 * object rows exist and what the header's chevron shows. `isFiltering` is taken
 * from the caller rather than inferred from the bucket, because
 * `SchemaBucketNode.totalCount` is the count of already-filtered items and so
 * says nothing about whether a filter is active.
 */
export function buildExplorerRows(
    category: CategoryGroupNode | null,
    isSchemaExpanded: (categoryKey: string, schemaName: string) => boolean,
    isFiltering: boolean,
): ExplorerRow[] {
    if (!category) return [];

    const rows: ExplorerRow[] = [];
    for (const bucket of category.schemas) {
        const expanded = isSchemaExpanded(category.key, bucket.schemaName);
        rows.push({
            kind: 'schema',
            key: `schema:${bucket.id}`,
            bucket,
            expanded,
            isFiltering,
        });

        if (!expanded) continue;

        for (const item of bucket.items) {
            rows.push({
                kind: 'object',
                key: `object:${item.id}`,
                item,
                category,
                isFiltering,
            });
        }
    }

    return rows;
}

/**
 * Maps each rendered object row's `data-object-key` to its index in the flat
 * list, so selection can scroll to a row that is not currently mounted.
 */
export function buildExplorerRowIndex(rows: ExplorerRow[]): Map<string, number> {
    const index = new Map<string, number>();
    rows.forEach((row, position) => {
        if (row.kind !== 'object') return;
        index.set(explorerObjectKey(row.category.key, row.item), position);
    });
    return index;
}
