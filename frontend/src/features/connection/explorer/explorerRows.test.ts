// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { OBJECT_TYPE } from '../../../lib/constants';
import { CATEGORY_KEY, type CategoryGroupNode } from '../databaseExplorerTypes';
import {
    buildExplorerRowIndex,
    buildExplorerRows,
    explorerObjectKey,
    explorerSchemaKey,
    type ExplorerObjectRow,
} from './explorerRows';

function categoryWith(schemas: Array<{ name: string; items: string[] }>): CategoryGroupNode {
    return {
        id: CATEGORY_KEY.TABLES,
        key: CATEGORY_KEY.TABLES,
        label: 'Tables',
        icon: 'table',
        itemIcon: 'table',
        totalCount: schemas.reduce((sum, schema) => sum + schema.items.length, 0),
        canOpenDefinition: true,
        allowCreateTable: true,
        dropObjectType: OBJECT_TYPE.TABLE,
        schemas: schemas.map(schema => ({
            id: `${CATEGORY_KEY.TABLES}:${schema.name}`,
            schemaName: schema.name,
            totalCount: schema.items.length,
            items: schema.items.map(item => ({
                id: `${CATEGORY_KEY.TABLES}:${schema.name}:${item}`,
                name: item,
                schemaName: schema.name,
                categoryKey: CATEGORY_KEY.TABLES,
                categoryLabel: 'Tables',
            })),
        })),
    } satisfies CategoryGroupNode;
}

function objectRowAt(
    rows: ReturnType<typeof buildExplorerRows>,
    position: number,
): ExplorerObjectRow {
    const row = rows[position];
    if (!row || row.kind !== 'object') {
        throw new Error(`expected an object row at ${position}, got ${row?.kind ?? 'nothing'}`);
    }
    return row;
}

const CATEGORY = categoryWith([
    { name: 'dbo', items: ['Customer', 'Orders'] },
    { name: 'inv', items: ['Stock'] },
]);

describe('buildExplorerRows', () => {
    it('emits one header per schema and no objects when nothing is expanded', () => {
        const rows = buildExplorerRows(CATEGORY, () => false, false);

        expect(rows.map(row => [row.kind, row.key])).toEqual([
            ['schema', 'schema:tables:dbo'],
            ['schema', 'schema:tables:inv'],
        ]);
    });

    it('interleaves each expanded schema with its own objects', () => {
        const rows = buildExplorerRows(CATEGORY, (_key, schemaName) => schemaName === 'dbo', false);

        expect(rows.map(row => [row.kind, row.key])).toEqual([
            ['schema', 'schema:tables:dbo'],
            ['object', 'object:tables:dbo:Customer'],
            ['object', 'object:tables:dbo:Orders'],
            ['schema', 'schema:tables:inv'],
        ]);
    });

    it('walks the whole tree while filtering', () => {
        const rows = buildExplorerRows(CATEGORY, () => true, true);

        expect(rows).toHaveLength(5);
        expect(rows.every(row => row.isFiltering)).toBe(true);
        expect(rows.filter(row => row.kind === 'object')).toHaveLength(3);
    });

    it('marks the expansion state the header has to render', () => {
        const rows = buildExplorerRows(CATEGORY, (_key, schemaName) => schemaName === 'inv', false);
        const headers = rows.filter(row => row.kind === 'schema');

        expect(headers.map(row => (row.kind === 'schema' ? row.expanded : null))).toEqual([
            false,
            true,
        ]);
    });

    it('returns nothing for a missing category', () => {
        expect(buildExplorerRows(null, () => true, false)).toEqual([]);
    });
});

describe('buildExplorerRowIndex', () => {
    it('maps every object row key to its position in the flat list', () => {
        const rows = buildExplorerRows(CATEGORY, () => true, false);
        const index = buildExplorerRowIndex(rows);

        expect(rows.map(row => row.kind)).toEqual([
            'schema',
            'object',
            'object',
            'schema',
            'object',
        ]);
        expect(index.size).toBe(3);
        expect(index.get(explorerObjectKey(CATEGORY_KEY.TABLES, objectRowAt(rows, 1).item))).toBe(
            1,
        );
        expect(index.get(explorerObjectKey(CATEGORY_KEY.TABLES, objectRowAt(rows, 4).item))).toBe(
            4,
        );
        expect(objectRowAt(rows, 4).item.name).toBe('Stock');
    });

    it('omits header rows so a reveal never targets one', () => {
        const rows = buildExplorerRows(CATEGORY, () => false, false);
        const index = buildExplorerRowIndex(rows);

        expect(index.size).toBe(0);
        expect(index.get(explorerSchemaKey(CATEGORY_KEY.TABLES, 'dbo'))).toBeUndefined();
    });
});
