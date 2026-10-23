// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ALL_SCHEMAS_VALUE, useExplorerDerivations } from './useExplorerDerivations';
import type { CategoryGroupNode } from '../databaseExplorerTypes';

function category(
    key: string,
    schemas: Array<{ schemaName: string; totalCount: number }>,
): CategoryGroupNode {
    return {
        id: `cat-${key}`,
        key,
        label: key,
        icon: 'table',
        itemIcon: 'table',
        totalCount: schemas.reduce((sum, bucket) => sum + bucket.totalCount, 0),
        schemas: schemas.map(bucket => ({
            id: `${key}:${bucket.schemaName}`,
            schemaName: bucket.schemaName,
            totalCount: bucket.totalCount,
            items: [],
        })),
    } as unknown as CategoryGroupNode;
}

const CATEGORIES = [
    category('tables', [
        { schemaName: 'public', totalCount: 3 },
        { schemaName: 'inv', totalCount: 2 },
    ]),
    category('views', [{ schemaName: 'public', totalCount: 1 }]),
    category('sequences', [{ schemaName: 'inv', totalCount: 4 }]),
];

describe('useExplorerDerivations', () => {
    it('keeps all categories when every schema is selected', () => {
        const { result } = renderHook(() =>
            useExplorerDerivations({
                categories: CATEGORIES,
                selectedSchema: ALL_SCHEMAS_VALUE,
                activeCategoryKey: 'tables',
                showMoreCategories: false,
                schemaNames: ['public', 'inv'],
            }),
        );
        expect(result.current.scopedCategories).toHaveLength(3);
        expect(result.current.scopedCategories[0].totalCount).toBe(5);
    });

    it('scopes buckets and recomputes counts for a selected schema', () => {
        const { result } = renderHook(() =>
            useExplorerDerivations({
                categories: CATEGORIES,
                selectedSchema: 'inv',
                activeCategoryKey: 'tables',
                showMoreCategories: true,
                schemaNames: ['public', 'inv'],
            }),
        );
        const tables = result.current.scopedCategories.find(c => c.key === 'tables');
        expect(tables?.schemas.map(bucket => bucket.schemaName)).toEqual(['inv']);
        expect(tables?.totalCount).toBe(2);
        const views = result.current.scopedCategories.find(c => c.key === 'views');
        expect(views?.schemas).toHaveLength(0);
        expect(views?.totalCount).toBe(0);
    });

    it('splits primary and secondary categories and hides secondary by default', () => {
        const { result } = renderHook(() =>
            useExplorerDerivations({
                categories: CATEGORIES,
                selectedSchema: ALL_SCHEMAS_VALUE,
                activeCategoryKey: 'tables',
                showMoreCategories: false,
                schemaNames: [],
            }),
        );
        expect(result.current.primaryCategories.map(c => c.key)).toEqual(['tables', 'views']);
        expect(result.current.secondaryCategories.map(c => c.key)).toEqual(['sequences']);
        expect(result.current.visibleCategories.map(c => c.key)).toEqual(['tables', 'views']);
    });

    it('falls back to the first category when the active key vanishes', () => {
        const { result } = renderHook(() =>
            useExplorerDerivations({
                categories: CATEGORIES,
                selectedSchema: ALL_SCHEMAS_VALUE,
                activeCategoryKey: 'does-not-exist',
                showMoreCategories: true,
                schemaNames: [],
            }),
        );
        expect(result.current.activeCategory?.key).toBe('tables');
    });

    it('sorts and dedupes available schemas', () => {
        const { result } = renderHook(() =>
            useExplorerDerivations({
                categories: [],
                selectedSchema: ALL_SCHEMAS_VALUE,
                activeCategoryKey: 'tables',
                showMoreCategories: false,
                schemaNames: ['inv', 'public', 'inv', ''],
            }),
        );
        expect(result.current.availableSchemas).toEqual(['inv', 'public']);
    });
});
