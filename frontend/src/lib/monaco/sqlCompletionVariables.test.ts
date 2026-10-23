// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { analyzeSqlText, buildSqlCompletionItems, type SqlCompletionEnv } from './sqlCompletion';
import { collectSigilNames, sigilOf } from './sqlCompletionVariables';
import { getSqlFunctionsForDriver } from './sqlCompletionConstants';

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
    fetchColumns: vi.fn(async () => []),
    fetchRelationships: vi.fn(async () => []),
    templates: [],
};

async function suggest(text: string, currentWord: string) {
    const analysis = analyzeSqlText(text, text.length);
    const items = await buildSqlCompletionItems(
        analysis,
        currentWord,
        {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: text.length - currentWord.length + 1,
            endColumn: text.length + 1,
        },
        env,
    );
    return items.map(item => String(item.label));
}

describe('sigilOf', () => {
    it('recognises @ and # prefixes only', () => {
        expect(sigilOf('@tot')).toBe('@');
        expect(sigilOf('#tmp')).toBe('#');
        expect(sigilOf('total')).toBeNull();
    });
});

describe('collectSigilNames', () => {
    it('lists distinct variables case-insensitively and never the word being typed', () => {
        const text = 'DECLARE @Total INT, @count INT; SET @total = 1; SELECT @to';
        const names = collectSigilNames(text, '@', text.length, '@to');
        expect(names.slice(0, 2)).toEqual(['@Total', '@count']);
        expect(names).not.toContain('@to');
    });

    it('adds the system variables for @ but not for #', () => {
        expect(collectSigilNames('SELECT @', '@', 8, '@')).toContain('@@ROWCOUNT');
        expect(collectSigilNames('SELECT #', '#', 8, '#')).toEqual([]);
    });

    it('collects temp tables', () => {
        const text = 'SELECT * INTO #staging FROM users; SELECT * FROM #st';
        expect(collectSigilNames(text, '#', text.length, '#st')).toEqual(['#staging']);
    });
});

describe('variable completion', () => {
    it('offers declared variables after @', async () => {
        const labels = await suggest('DECLARE @total INT; SELECT @t', '@t');
        expect(labels).toContain('@total');
        expect(labels).not.toContain('SELECT');
    });
});

describe('getSqlFunctionsForDriver', () => {
    it('adds engine built-ins to the portable list without duplicates', () => {
        const functions = getSqlFunctionsForDriver('sqlserver');
        expect(functions).toContain('GETDATE');
        expect(functions).toContain('COUNT');
        expect(new Set(functions).size).toBe(functions.length);
    });

    it('falls back to the portable list for an unknown driver', () => {
        expect(getSqlFunctionsForDriver('oracle')).toContain('COUNT');
        expect(getSqlFunctionsForDriver('oracle')).not.toContain('GETDATE');
    });
});
