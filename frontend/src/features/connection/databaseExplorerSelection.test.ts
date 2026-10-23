// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { resolveDatabaseExplorerSelection } from './databaseExplorerSelection';
import type { CategoryGroupNode } from './databaseExplorerTypes';

function makeCategory(
    key: CategoryGroupNode['key'],
    canOpenDefinition: boolean,
    schemaName: string,
    items: string[],
): CategoryGroupNode {
    return {
        id: key,
        key,
        label: key,
        icon: 'table',
        itemIcon: 'table',
        totalCount: items.length,
        canOpenDefinition,
        allowCreateTable: false,
        dropObjectType: null,
        schemas: [
            {
                id: `${key}:${schemaName}`,
                schemaName,
                totalCount: items.length,
                items: items.map(name => ({
                    id: `${key}:${schemaName}:${name}`,
                    name,
                    schemaName,
                    categoryKey: key,
                    categoryLabel: key,
                })),
            },
        ],
    };
}

describe('resolveDatabaseExplorerSelection', () => {
    it('prefers tables category when object exists there', () => {
        const categories: CategoryGroupNode[] = [
            makeCategory('views', true, 'public', ['users']),
            makeCategory('tables', true, 'public', ['users']),
        ];

        const selected = resolveDatabaseExplorerSelection(categories, 'public', 'users');
        expect(selected?.categoryKey).toBe('tables');
        expect(selected?.selectedObjectKey).toBe('tables:public.users');
        expect(selected?.isPrimaryCategory).toBe(true);
    });

    it('falls back to openable non-table categories when table is missing', () => {
        const categories: CategoryGroupNode[] = [
            makeCategory('indexes', false, 'public', ['orders_idx']),
            makeCategory('views', true, 'public', ['orders']),
        ];

        const selected = resolveDatabaseExplorerSelection(categories, 'public', 'orders');
        expect(selected?.categoryKey).toBe('views');
        expect(selected?.selectedObjectKey).toBe('views:public.orders');
    });

    it('returns null when target object does not exist', () => {
        const categories: CategoryGroupNode[] = [
            makeCategory('tables', true, 'public', ['customers']),
        ];

        const selected = resolveDatabaseExplorerSelection(categories, 'public', 'orders');
        expect(selected).toBeNull();
    });

    it('returns null for missing schema/table target', () => {
        const categories: CategoryGroupNode[] = [
            makeCategory('tables', true, 'public', ['orders']),
        ];

        expect(resolveDatabaseExplorerSelection(categories, '', 'orders')).toBeNull();
        expect(resolveDatabaseExplorerSelection(categories, 'public', '')).toBeNull();
    });
});
