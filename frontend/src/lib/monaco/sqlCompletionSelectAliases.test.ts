// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { analyzeSqlText, buildSqlCompletionItems, type SqlCompletionEnv } from './sqlCompletion';
import { extractCtes } from './sqlCompletionSources';
import { extractOutputColumnsAtCursor, extractProjectedColumns } from './sqlCompletionProjection';

const monacoStub = {
    languages: {
        CompletionItemKind: {
            Field: 1,
            Module: 2,
            Class: 3,
            Keyword: 4,
            Function: 5,
            Text: 6,
            Operator: 7,
            Snippet: 8,
        },
        CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
    },
};

const env: SqlCompletionEnv = {
    monaco: monacoStub,
    schemas: [{ Name: 'dbo', Tables: ['users'], Views: [] }],
    driver: 'sqlserver',
    profileKey: 'main',
    dbName: 'db1',
    fetchColumns: vi.fn(async () => [
        { Name: 'id', DataType: 'int', IsPrimaryKey: true },
        { Name: 'name', DataType: 'varchar' },
    ]),
    fetchRelationships: vi.fn(async () => []),
    templates: [],
};

async function suggestAtEnd(text: string) {
    const analysis = analyzeSqlText(text, text.length);
    const items = await buildSqlCompletionItems(
        analysis,
        '',
        { startLineNumber: 1, endLineNumber: 1, startColumn: text.length, endColumn: text.length },
        env,
    );
    return items.map(item => String(item.label));
}

describe('extractProjectedColumns', () => {
    it('skips DISTINCT and TOP modifiers', () => {
        expect(extractProjectedColumns('select distinct a, b from t')).toEqual(['a', 'b']);
        expect(extractProjectedColumns('select top 10 a, b from t')).toEqual(['a', 'b']);
        expect(extractProjectedColumns('select top (5) percent a from t')).toEqual(['a']);
    });

    it('works without a FROM clause', () => {
        expect(extractProjectedColumns('select 1 as n, 2 m')).toEqual(['n', 'm']);
    });

    it('is not fooled by a FROM inside a subquery', () => {
        expect(extractProjectedColumns('select (select max(x) from y) as m, b from t')).toEqual([
            'm',
            'b',
        ]);
    });

    it('stops at UNION so only the first branch names the columns', () => {
        expect(extractProjectedColumns('select a from t union all select b from u')).toEqual(['a']);
        expect(extractProjectedColumns('select 1 a union all select 2')).toEqual(['a']);
    });
});

describe('extractCtes', () => {
    it('uses an explicit column list over the projection', () => {
        const ctes = extractCtes('with x (a, b) as (select 1, 2) select * from x');
        expect(ctes.get('x')?.columns).toEqual(['a', 'b']);
    });

    it('reads columns of several CTEs, with and without a list', () => {
        const ctes = extractCtes(
            'with x (a) as (select 1), y as (select top 1 n from t) select * from x, y',
        );
        expect(ctes.get('x')?.columns).toEqual(['a']);
        expect(ctes.get('y')?.columns).toEqual(['n']);
    });
});

describe('extractOutputColumnsAtCursor', () => {
    it('finds the select list of the query the cursor is in', () => {
        const text = 'select a as x, b from t order by ';
        expect(extractOutputColumnsAtCursor(text, text.length, 0)).toEqual(['x', 'b']);
    });

    it('uses the inner query for a subquery cursor', () => {
        const text = 'select z from (select a as x from t order by ';
        expect(extractOutputColumnsAtCursor(text, text.length, 1)).toEqual(['x']);
    });
});

describe('ORDER BY / GROUP BY completion', () => {
    it('offers select-list aliases', async () => {
        const labels = await suggestAtEnd('SELECT u.name AS display_name FROM users u ORDER BY ');
        expect(labels).toContain('display_name');
    });

    it('offers them for GROUP BY too', async () => {
        const labels = await suggestAtEnd(
            'SELECT u.name AS display_name, count(*) c FROM users u GROUP BY ',
        );
        expect(labels).toContain('display_name');
        expect(labels).toContain('c');
    });
});
