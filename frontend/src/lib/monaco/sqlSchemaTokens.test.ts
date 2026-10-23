// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { SchemaNode } from '../../stores/schemaStore';
import { collectSqlSchemaTokens, SCHEMA_TOKENS_MAX_CHARS } from './sqlSchemaTokens';

const schemas: SchemaNode[] = [
    { Name: 'dbo', Tables: ['users', 'orders'], Views: ['active_users'] },
    { Name: 'audit', Tables: ['log'], Views: [] },
];

const columns: Record<string, string[]> = {
    'dbo.users': ['id', 'name', 'email'],
    'dbo.orders': ['id', 'user_id', 'total'],
};

function run(sql: string, withColumns = false) {
    const spans = collectSqlSchemaTokens(sql, {
        schemas,
        currentSchema: 'dbo',
        getColumns: withColumns ? (schema, table) => columns[`${schema}.${table}`] : undefined,
    });
    return spans.map(span => ({
        kind: span.kind,
        text: sql.slice(span.startOffset, span.endOffset),
    }));
}

describe('collectSqlSchemaTokens', () => {
    it('marks known tables and aliases, and qualified columns', () => {
        expect(run('select u.name from users u where u.id = 1')).toEqual([
            { kind: 'alias', text: 'u' },
            { kind: 'column', text: 'name' },
            { kind: 'table', text: 'users' },
            { kind: 'alias', text: 'u' },
            { kind: 'alias', text: 'u' },
            { kind: 'column', text: 'id' },
        ]);
    });

    it('does not colour tables that are not in the schema', () => {
        expect(run('select * from nothing n')).toEqual([{ kind: 'alias', text: 'n' }]);
    });

    it('resolves an explicit schema prefix', () => {
        expect(run('select 1 from audit.log')).toEqual([{ kind: 'table', text: 'log' }]);
        expect(run('select 1 from audit.users')).toEqual([]);
    });

    it('treats CTE names as aliases', () => {
        expect(run('with x as (select 1 a) select * from x')).toEqual([
            { kind: 'alias', text: 'x' },
        ]);
    });

    it('handles AS aliases, joins and comma-separated FROM lists', () => {
        const result = run(
            'select 1 from users as u, audit.log l join orders o on o.user_id = u.id',
        );
        expect(result.filter(token => token.kind === 'table').map(token => token.text)).toEqual([
            'users',
            'log',
            'orders',
        ]);
        expect(result.filter(token => token.kind === 'alias').map(token => token.text)).toEqual(
            expect.arrayContaining(['u', 'o', 'l']),
        );
    });

    it('marks unqualified columns only when their columns are cached', () => {
        const sql = 'select name, email from users';
        expect(run(sql).filter(token => token.kind === 'column')).toEqual([]);
        expect(
            run(sql, true)
                .filter(token => token.kind === 'column')
                .map(token => token.text),
        ).toEqual(['name', 'email']);
    });

    it('does not mark a function call or a keyword as a column', () => {
        const result = run('select count(id), id from users', true);
        expect(result.filter(token => token.kind === 'column').map(token => token.text)).toEqual([
            'id',
            'id',
        ]);
    });

    it('uses absolute offsets across statements', () => {
        const sql = 'select 1;\nselect * from users';
        const spans = collectSqlSchemaTokens(sql, { schemas, currentSchema: 'dbo' });
        expect(spans).toHaveLength(1);
        expect(sql.slice(spans[0].startOffset, spans[0].endOffset)).toBe('users');
    });

    it('skips oversized scripts', () => {
        const sql = `select * from users -- ${'x'.repeat(SCHEMA_TOKENS_MAX_CHARS)}`;
        expect(collectSqlSchemaTokens(sql, { schemas, currentSchema: 'dbo' })).toEqual([]);
    });

    it('returns nothing without a schema catalog', () => {
        expect(
            collectSqlSchemaTokens('select * from users', { schemas: [], currentSchema: 'dbo' }),
        ).toEqual([]);
    });

    describe('a Postgres script like the one in the editor', () => {
        const pg: SchemaNode[] = [
            {
                Name: 'public',
                Tables: ['order_details', 'orders', 'customers'],
                Views: [],
            },
        ];
        const sql =
            'SELECT od.order_id, o.* FROM order_details od INNER JOIN public.orders o ON od.order_id = o.order_id;\n\nSELECT *\nFROM customers c2;';
        const tables = (currentSchema: string) =>
            collectSqlSchemaTokens(sql, { schemas: pg, currentSchema })
                .filter(span => span.kind === 'table')
                .map(span => sql.slice(span.startOffset, span.endOffset));

        it('marks every table, including a schema-qualified one', () => {
            expect(tables('public')).toEqual(['order_details', 'orders', 'customers']);
        });

        it('still marks tables while no current schema is known', () => {
            expect(tables('')).toEqual(['order_details', 'orders', 'customers']);
        });

        it('finds a table that lives outside the current schema', () => {
            const spans = collectSqlSchemaTokens('select * from log', {
                schemas: schemas,
                currentSchema: 'dbo',
            });
            expect(spans.map(span => span.kind)).toEqual(['table']);
        });
    });
});
