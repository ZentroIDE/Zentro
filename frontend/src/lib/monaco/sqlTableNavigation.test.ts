// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { SchemaNode } from '../../stores/schemaStore';
import {
    resolveSqlObjectNavigationAtPosition,
    resolveTableNavigationAtPosition,
    type SqlModelLike,
    type SqlPositionLike,
} from './sqlTableNavigation';

function createModel(text: string): SqlModelLike {
    return {
        getValue: () => text,
        getOffsetAt: (position: SqlPositionLike) => {
            const lines = text.split('\n');
            let offset = 0;
            for (let i = 0; i < position.lineNumber - 1; i++) {
                offset += (lines[i]?.length ?? 0) + 1;
            }
            return offset + Math.max(0, position.column - 1);
        },
    };
}

const schemas: SchemaNode[] = [
    {
        Name: 'public',
        Tables: ['users', 'orders'],
        Views: ['active_users'],
    },
    {
        Name: 'audit',
        Tables: ['users'],
        Views: [],
        Functions: ['sp_recompute_balance'],
    },
];

describe('sqlTableNavigation.resolveTableNavigationAtPosition', () => {
    it('resolves unqualified table name when it has a single match', () => {
        const model = createModel('SELECT * FROM orders o');
        const result = resolveTableNavigationAtPosition(
            model,
            { lineNumber: 1, column: 15 },
            schemas,
        );

        expect(result.kind).toBe('single_match');
        if (result.kind !== 'single_match') return;
        expect(result.match.qualifiedName).toBe('public.orders');
    });

    it('resolves schema-qualified table name', () => {
        const model = createModel('SELECT * FROM public.users u');
        const result = resolveTableNavigationAtPosition(
            model,
            { lineNumber: 1, column: 23 },
            schemas,
        );

        expect(result.kind).toBe('single_match');
        if (result.kind !== 'single_match') return;
        expect(result.match.qualifiedName).toBe('public.users');
    });

    it('resolves quoted schema/table identifier', () => {
        const model = createModel('SELECT * FROM "public"."users"');
        const result = resolveTableNavigationAtPosition(
            model,
            { lineNumber: 1, column: 28 },
            schemas,
        );

        expect(result.kind).toBe('single_match');
        if (result.kind !== 'single_match') return;
        expect(result.match.qualifiedName).toBe('public.users');
    });

    it('returns not_found when the table does not exist in context', () => {
        const model = createModel('SELECT * FROM products');
        const result = resolveTableNavigationAtPosition(
            model,
            { lineNumber: 1, column: 17 },
            schemas,
        );

        expect(result.kind).toBe('not_found');
    });

    it('returns multiple_matches when table name exists in multiple schemas', () => {
        const model = createModel('SELECT * FROM users');
        const result = resolveTableNavigationAtPosition(
            model,
            { lineNumber: 1, column: 15 },
            schemas,
        );

        expect(result.kind).toBe('multiple_matches');
        if (result.kind !== 'multiple_matches') return;
        expect(result.matches.map(x => x.qualifiedName)).toEqual(['audit.users', 'public.users']);
    });

    it('resolves function object in sql object navigation mode', () => {
        const model = createModel('SELECT * FROM sp_recompute_balance');
        const result = resolveSqlObjectNavigationAtPosition(
            model,
            { lineNumber: 1, column: 18 },
            schemas,
        );

        expect(result.kind).toBe('single_match');
        if (result.kind !== 'single_match') return;
        expect(result.match.qualifiedName).toBe('audit.sp_recompute_balance');
        expect(result.match.objectKind).toBe('function');
    });
    describe('aliases and qualifiers', () => {
        const join = 'SELECT o.id FROM orders o JOIN active_users u ON u.id = o.user_id';
        const at = (sql: string, marker: string, extra = 0) => ({
            lineNumber: 1,
            column: sql.indexOf(marker) + 1 + extra,
        });
        const navigate = (sql: string, position: { lineNumber: number; column: number }) =>
            resolveTableNavigationAtPosition(createModel(sql), position, schemas);
        const qualifiedNameOf = (result: ReturnType<typeof navigate>) =>
            result.kind === 'single_match' ? result.match.qualifiedName : result.kind;

        it('opens the aliased table when clicking the alias of a qualified column after ON', () => {
            const onClause = join.indexOf('ON u.id');
            expect(qualifiedNameOf(navigate(join, { lineNumber: 1, column: onClause + 5 }))).toBe(
                'public.active_users',
            );
            const orderAlias = join.indexOf('o.user_id');
            expect(qualifiedNameOf(navigate(join, { lineNumber: 1, column: orderAlias + 1 }))).toBe(
                'public.orders',
            );
        });

        it('opens the table when clicking a table name used as qualifier', () => {
            const sql =
                'SELECT * FROM orders LEFT JOIN active_users ON orders.user_id = active_users.id';

            expect(qualifiedNameOf(navigate(sql, at(sql, 'orders.user_id', 2)))).toBe(
                'public.orders',
            );
            expect(qualifiedNameOf(navigate(sql, at(sql, 'active_users.id', 2)))).toBe(
                'public.active_users',
            );
        });

        it('does not treat the column part as a table', () => {
            expect(navigate(join, at(join, 'user_id', 2)).kind).toBe('not_found');
        });

        it('opens the alias declaration in FROM', () => {
            expect(qualifiedNameOf(navigate(join, at(join, ' o JOIN', 1)))).toBe('public.orders');
        });

        it('lets an alias shadow a real table of the same name', () => {
            const sql = 'SELECT users.id FROM orders users';

            expect(qualifiedNameOf(navigate(sql, at(sql, 'users.id', 2)))).toBe('public.orders');
        });

        it('uses the statement under the cursor, not an earlier one', () => {
            const sql = 'SELECT o.id FROM active_users o;\n\nSELECT o.id FROM orders o';

            expect(qualifiedNameOf(navigate(sql, { lineNumber: 3, column: 8 }))).toBe(
                'public.orders',
            );
            expect(qualifiedNameOf(navigate(sql, { lineNumber: 1, column: 8 }))).toBe(
                'public.active_users',
            );
        });

        it('keeps opening the table when the click lands on the schema part', () => {
            const sql = 'SELECT * FROM public.orders o';

            expect(qualifiedNameOf(navigate(sql, at(sql, 'public', 2)))).toBe('public.orders');
        });

        it('reports the qualifier the click landed on, not the whole chain', () => {
            const sql = 'SELECT z.id FROM orders o';
            const result = navigate(sql, at(sql, 'z.id', 0));

            expect(result).toEqual({ kind: 'not_found', lookup: 'z' });
        });

        it('returns not_found for an alias of a CTE or subquery', () => {
            const sql = 'SELECT x.id FROM (SELECT 1 AS id) x';

            expect(navigate(sql, at(sql, 'x.id', 0)).kind).toBe('not_found');
        });
    });
});
