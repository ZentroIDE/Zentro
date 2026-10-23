// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { buildCompletionPlan } from './sqlCompletionEngineCore';
import { createEmptyCompletionMemory, recordCompletionAcceptance } from './sqlCompletionMemory';

const range = {
    startLineNumber: 1,
    endLineNumber: 1,
    startColumn: 15,
    endColumn: 15,
};

const services = {
    fetchColumns: async () => [],
    fetchRelationships: async () => [],
};

describe('buildCompletionPlan', () => {
    it('suppresses suggestions inside comments', async () => {
        const result = await buildCompletionPlan(
            {
                sqlText: 'SELECT 1 -- fro',
                cursorOffset: 15,
                currentWord: 'fro',
                range,
                editorFlavor: 'main',
                driver: 'postgres',
                currentSchema: 'public',
                catalogSnapshot: [],
                templates: [],
            },
            services,
            createEmptyCompletionMemory(),
        );

        expect(result.candidates).toEqual([]);
        expect(result.suppressedReason).toBe('comment-or-string');
    });

    it('uses the base query to rank filter columns from its source', async () => {
        const result = await buildCompletionPlan(
            {
                sqlText: 'na',
                cursorOffset: 2,
                currentWord: 'na',
                range,
                editorFlavor: 'filter',
                baseQuery: 'SELECT * FROM public.users u',
                driver: 'postgres',
                currentSchema: 'public',
                catalogSnapshot: [{ Name: 'public', Tables: ['users'], Views: [] }],
                templates: [],
            },
            {
                ...services,
                fetchColumns: async () => [{ Name: 'name' }, { Name: 'id' }],
            },
            createEmptyCompletionMemory(),
        );

        expect(result.candidates[0]?.label).toBe('name');
        expect(result.context.clause).toBe('where');
    });

    it('applies a bounded acceptance boost and exposes ranking reasons', async () => {
        const request = {
            sqlText: 'SELECT * FROM ',
            cursorOffset: 14,
            currentWord: '',
            range,
            editorFlavor: 'main' as const,
            driver: 'postgres',
            currentSchema: 'public',
            catalogSnapshot: [{ Name: 'public', Tables: ['accounts', 'users'], Views: [] }],
            templates: [],
        };
        const baseline = await buildCompletionPlan(
            request,
            services,
            createEmptyCompletionMemory(),
        );
        const users = baseline.candidates.find(candidate => candidate.label === 'users');
        expect(users).toBeDefined();

        let memory = createEmptyCompletionMemory();
        for (let index = 0; index < 100; index += 1) {
            memory = recordCompletionAcceptance(memory, {
                suggestionKey: users!.acceptance.suggestionKey,
                suggestionKind: users!.acceptance.suggestionKind,
                contextBucket: users!.acceptance.contextBucket,
                acceptedAt: index,
            });
        }
        const learned = await buildCompletionPlan(request, services, memory);
        const learnedUsers = learned.candidates.find(candidate => candidate.label === 'users');

        expect(learnedUsers?.ranking.adaptiveBoost).toBeGreaterThan(0);
        expect(learnedUsers?.ranking.adaptiveBoost).toBeLessThanOrEqual(180);
        expect(learned.candidates[0]?.label).toBe('users');
    });

    it('orders equal-scored candidates deterministically by normalized label', async () => {
        const result = await buildCompletionPlan(
            {
                sqlText: 'SELECT * FROM ',
                cursorOffset: 14,
                currentWord: '',
                range,
                editorFlavor: 'main',
                driver: 'postgres',
                currentSchema: 'public',
                catalogSnapshot: [{ Name: 'public', Tables: ['zebra', 'alpha'], Views: [] }],
                templates: [],
            },
            services,
            createEmptyCompletionMemory(),
        );

        const tableLabels = result.candidates
            .filter(candidate => candidate.kind === 'table')
            .map(candidate => candidate.label);
        expect(tableLabels).toEqual(['alpha', 'zebra']);
    });

    it.each(['SELECT * FROM ', 'UPDATE ', 'INSERT INTO ', 'DELETE FROM ', 'ALTER TABLE '])(
        'ranks table targets first for "%s"',
        async sqlText => {
            const result = await buildCompletionPlan(
                {
                    sqlText,
                    cursorOffset: sqlText.length,
                    currentWord: '',
                    range,
                    editorFlavor: 'main',
                    driver: 'postgres',
                    currentSchema: 'public',
                    catalogSnapshot: [
                        { Name: 'public', Tables: ['categories', 'customers'], Views: [] },
                    ],
                    templates: [],
                },
                services,
                createEmptyCompletionMemory(),
            );

            expect(result.candidates[0]?.kind).toBe('table');
            expect(result.candidates[0]?.label).toBe('categories');
        },
    );

    it('keeps tables above a repeatedly accepted keyword in table-target context', async () => {
        const request = {
            sqlText: 'SELECT * FROM ',
            cursorOffset: 14,
            currentWord: '',
            range,
            editorFlavor: 'main' as const,
            driver: 'postgres',
            currentSchema: 'public',
            catalogSnapshot: [{ Name: 'public', Tables: ['categories', 'customers'], Views: [] }],
            templates: [],
        };
        const baseline = await buildCompletionPlan(
            request,
            services,
            createEmptyCompletionMemory(),
        );
        const keyword = baseline.candidates.find(candidate => candidate.label === 'AS');
        expect(keyword).toBeDefined();

        let memory = createEmptyCompletionMemory();
        for (let index = 0; index < 100; index += 1) {
            memory = recordCompletionAcceptance(memory, {
                ...keyword!.acceptance,
                acceptedAt: index,
            });
        }
        const learned = await buildCompletionPlan(request, services, memory);

        expect(learned.candidates[0]?.kind).toBe('table');
        expect(learned.candidates.find(candidate => candidate.label === 'AS')?.ranking).toEqual(
            expect.objectContaining({ adaptiveBoost: 180 }),
        );
        expect(learned.candidates[0]?.ranking.reasons).toContain('table-target');
    });

    it('quotes column names that are not valid bare identifiers for the driver', async () => {
        const result = await buildCompletionPlan(
            {
                sqlText: 'SELECT c.pho FROM Customer c;',
                cursorOffset: 12,
                currentWord: 'pho',
                range: { startLineNumber: 1, endLineNumber: 1, startColumn: 10, endColumn: 13 },
                editorFlavor: 'main',
                driver: 'sqlserver',
                currentSchema: 'dbo',
                catalogSnapshot: [{ Name: 'dbo', Tables: ['Customer'], Views: [] }],
                templates: [],
            },
            {
                ...services,
                fetchColumns: async () => [
                    { Name: 'Phone No_', DataType: 'nvarchar' },
                    { Name: 'Name', DataType: 'nvarchar' },
                ],
            },
            createEmptyCompletionMemory(),
        );

        const phone = result.candidates.find(candidate => candidate.label === 'Phone No_');
        expect(phone?.item.insertText).toBe('[Phone No_]');
        const name = result.candidates.find(candidate => candidate.label === 'Name');
        expect(name?.item.insertText).toBe('Name');
    });

    it('replaces the surrounding bracket pair when the user already typed the opener', async () => {
        const quotedRange = {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 10,
            endColumn: 15,
        };
        const result = await buildCompletionPlan(
            {
                sqlText: 'SELECT c.[pho] FROM Customer c;',
                cursorOffset: 13,
                currentWord: 'pho',
                range: { startLineNumber: 1, endLineNumber: 1, startColumn: 11, endColumn: 14 },
                quotedIdentifier: { range: quotedRange, opener: '[' },
                editorFlavor: 'main',
                driver: 'sqlserver',
                currentSchema: 'dbo',
                catalogSnapshot: [{ Name: 'dbo', Tables: ['Customer'], Views: [] }],
                templates: [],
            },
            { ...services, fetchColumns: async () => [{ Name: 'Phone No_' }] },
            createEmptyCompletionMemory(),
        );

        const phone = result.candidates.find(candidate => candidate.label === 'Phone No_');
        expect(phone?.item.insertText).toBe('[Phone No_]');
        expect(phone?.item.range).toEqual(quotedRange);
        expect(phone?.item.filterText).toBe('[Phone No_');
    });

    it('does not reuse an alias already taken by another table in the statement', async () => {
        const sqlText = 'SELECT * FROM Customer c JOIN ';
        const result = await buildCompletionPlan(
            {
                sqlText,
                cursorOffset: sqlText.length,
                currentWord: '',
                range: { startLineNumber: 1, endLineNumber: 1, startColumn: 31, endColumn: 31 },
                editorFlavor: 'main',
                driver: 'sqlserver',
                currentSchema: 'dbo',
                catalogSnapshot: [{ Name: 'dbo', Tables: ['Customer', 'Contact'], Views: [] }],
                templates: [],
            },
            services,
            createEmptyCompletionMemory(),
        );

        const contact = result.candidates.find(candidate => candidate.label === 'Contact');
        expect(contact?.item.insertText).toBe('Contact c2');
    });

    describe('columns from several joined sources', () => {
        const catalogSnapshot = [{ Name: 'dbo', Tables: ['Customer', 'Orders'], Views: [] }];
        const fetchColumns = async (_schema: string, table: string) =>
            table === 'Customer'
                ? [
                      { Name: 'Id', DataType: 'int' },
                      { Name: 'Phone No_', DataType: 'nvarchar' },
                  ]
                : [
                      { Name: 'Id', DataType: 'int' },
                      { Name: 'CustomerId', DataType: 'int' },
                  ];

        const run = (sqlText: string, cursorOffset: number, currentWord = '') =>
            buildCompletionPlan(
                {
                    sqlText,
                    cursorOffset,
                    currentWord,
                    range: {
                        startLineNumber: 1,
                        endLineNumber: 1,
                        startColumn: cursorOffset + 1 - currentWord.length,
                        endColumn: cursorOffset + 1,
                    },
                    editorFlavor: 'main',
                    driver: 'sqlserver',
                    currentSchema: 'dbo',
                    catalogSnapshot,
                    templates: [],
                },
                { ...services, fetchColumns },
                createEmptyCompletionMemory(),
            );

        it('offers a same-named column once per alias instead of collapsing it', async () => {
            const sqlText = 'SELECT  FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
            const result = await run(sqlText, 'SELECT '.length);

            const byLabel = new Map(result.candidates.map(c => [c.label, c]));
            expect(byLabel.get('c.Id')?.item.insertText).toBe('c.Id');
            expect(byLabel.get('o.Id')?.item.insertText).toBe('o.Id');
            expect(byLabel.get('c.Phone No_')?.item.insertText).toBe('c.[Phone No_]');
            expect(byLabel.get('c.Id')?.item.detail).toBe('int - c (Customer)');
            expect(byLabel.get('o.Id')?.item.detail).toBe('int - o (Orders)');
        });

        it('treats a typed column prefix as a prefix hit on the alias-qualified field', async () => {
            const sqlText = 'SELECT pho FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
            const result = await run(sqlText, 'SELECT pho'.length, 'pho');

            const labels = result.candidates.map(c => c.label);
            expect(labels.indexOf('c.Phone No_')).toBeGreaterThanOrEqual(0);
            expect(labels.indexOf('c.Phone No_')).toBeLessThan(labels.indexOf('c.Id'));
            expect(labels.indexOf('c.Phone No_')).toBeLessThan(labels.indexOf('o.CustomerId'));
        });

        it('keeps bare column names when only one source is in play', async () => {
            const sqlText = 'SELECT  FROM Customer c';
            const result = await run(sqlText, 'SELECT '.length);

            expect(result.candidates.find(c => c.label === 'Id')?.item.insertText).toBe('Id');
            expect(result.candidates.some(c => c.label === 'c.Id')).toBe(false);
        });
    });

    describe('select list expansion', () => {
        const catalogSnapshot = [
            { Name: 'dbo', Tables: ['Customer', 'Orders', 'Items', 'Wide'], Views: [] },
        ];
        // Deliberately not alphabetical: the expansion must follow table order.
        const columnsByTable: Record<string, string[]> = {
            Customer: ['Name', 'Id', 'Phone No_'],
            Orders: ['Id', 'CustomerId'],
            Items: ['Sku'],
            Wide: ['A', 'B', 'C', 'D', 'E', 'F'],
        };
        const fetchColumns = async (_schema: string, table: string) =>
            (columnsByTable[table] ?? []).map(Name => ({ Name }));

        const run = (sqlText: string, cursorOffset: number, currentWord = '', lineIndent = '') =>
            buildCompletionPlan(
                {
                    sqlText,
                    cursorOffset,
                    currentWord,
                    range: {
                        startLineNumber: 1,
                        endLineNumber: 1,
                        startColumn: cursorOffset + 1 - currentWord.length,
                        endColumn: cursorOffset + 1,
                    },
                    lineIndent,
                    editorFlavor: 'main',
                    driver: 'sqlserver',
                    currentSchema: 'dbo',
                    catalogSnapshot,
                    templates: [],
                },
                { ...services, fetchColumns },
                createEmptyCompletionMemory(),
            );
        const find = (result: Awaited<ReturnType<typeof run>>, label: string) =>
            result.candidates.find(c => c.label === label);

        it('expands every column of every joined table, alias-qualified, in table order', async () => {
            const sqlText = 'SELECT  FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
            const result = await run(sqlText, 'SELECT '.length);

            expect(find(result, 'All columns')?.item.insertText).toBe(
                '\n      c.Name\n    , c.Id\n    , c.[Phone No_]\n    , o.Id\n    , o.CustomerId',
            );
            expect(find(result, 'All columns')?.item.detail).toBe('5 columns from 2 tables');
        });

        it('offers an alias.* shortcut per joined table', async () => {
            const sqlText = 'SELECT  FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
            const result = await run(sqlText, 'SELECT '.length);

            expect(find(result, 'c.*')?.item.insertText).toBe('c.*');
            expect(find(result, 'c.*')?.item.detail).toBe('All columns of Customer (3)');
            expect(find(result, 'o.*')?.item.insertText).toBe('o.*');
        });

        it('keeps a short expansion on one line and covers more than two tables', async () => {
            const sqlText = 'SELECT  FROM Orders o JOIN Items i ON i.Sku = o.Id';
            const result = await run(sqlText, 'SELECT '.length);

            expect(find(result, 'All columns')?.item.insertText).toBe('o.Id, o.CustomerId, i.Sku');
        });

        it('leaves columns bare with a single source and skips the alias shortcuts', async () => {
            const sqlText = 'SELECT  FROM Orders o';
            const result = await run(sqlText, 'SELECT '.length);

            expect(find(result, 'All columns')?.item.insertText).toBe('Id, CustomerId');
            expect(find(result, 'o.*')).toBeUndefined();
        });

        it('completes the rest of one source after "alias." with * and the remaining columns', async () => {
            const sqlText = 'SELECT c. FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
            const result = await run(sqlText, 'SELECT c.'.length);

            expect(find(result, '*')?.item.insertText).toBe('*');
            expect(find(result, 'All columns')?.item.insertText).toBe('Name, c.Id, c.[Phone No_]');
        });

        it('indents a long list relative to the line it is inserted into', async () => {
            const sqlText = '  SELECT  FROM Wide w';
            const result = await run(sqlText, '  SELECT '.length, '', '  ');

            expect(find(result, 'All columns')?.item.insertText).toBe(
                '\n        A\n      , B\n      , C\n      , D\n      , E\n      , F',
            );
        });

        it('keeps the first column inline after "alias." and puts the rest comma-first', async () => {
            const sqlText = 'SELECT w. FROM Wide w';
            const result = await run(sqlText, 'SELECT w.'.length);

            expect(find(result, 'All columns')?.item.insertText).toBe(
                'A\n    , w.B\n    , w.C\n    , w.D\n    , w.E\n    , w.F',
            );
        });

        it('does not offer expansions outside the select list', async () => {
            const sqlText = 'SELECT * FROM Customer c WHERE ';
            const result = await run(sqlText, sqlText.length);

            expect(find(result, 'All columns')).toBeUndefined();
        });
    });
});
