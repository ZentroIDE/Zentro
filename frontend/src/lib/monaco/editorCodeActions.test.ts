// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { Monaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import type { SchemaNode } from '../../stores/schemaStore';
import { registerSqlCodeActions, type SqlCodeActionDeps } from './editorCodeActions';
import { SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID } from './sqlSuggestionSchemaContext';

function makeModel(text: string): editor.ITextModel {
    const lineStarts = [0];
    for (let index = 0; index < text.length; index++) {
        if (text[index] === '\n') lineStarts.push(index + 1);
    }
    const lines = text.split('\n');
    return {
        uri: { toString: () => 'inmemory://model/1' },
        getValue: () => text,
        getVersionId: () => 7,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
        getOffsetAt: ({ lineNumber, column }: { lineNumber: number; column: number }) =>
            lineStarts[lineNumber - 1] + column - 1,
        getPositionAt: (offset: number) => {
            let lineIndex = 0;
            while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= offset) {
                lineIndex++;
            }
            return { lineNumber: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1 };
        },
    } as unknown as editor.ITextModel;
}

const tree = (name: string, tables: string[]): SchemaNode =>
    ({ Name: name, Tables: tables, Views: [] }) as unknown as SchemaNode;

const columnsByTable: Record<string, string[]> = {
    Customer: ['Name', 'Id', 'Phone No_'],
    Orders: ['Id', 'CustomerId'],
};

function makeDeps(overrides: Partial<SqlCodeActionDeps> = {}): SqlCodeActionDeps {
    return {
        getConnection: () => ({ profileName: 'p', dbName: 'db', driver: 'sqlserver' }),
        getCurrentSchema: () => 'dbo',
        getEnvironmentKey: () => 'dev',
        getTrees: () => ({
            'p:db': [tree('dbo', ['Customer', 'Orders']), tree('sales', ['Orders'])],
        }),
        getSchemaWarnings: () => [],
        getColumnWarnings: () => [],
        getRefreshColumnsCommandId: () => undefined,
        fetchColumns: async (_schema, table) =>
            (columnsByTable[table] ?? []).map(Name => ({ Name })),
        ...overrides,
    };
}

function setup(text: string, deps: SqlCodeActionDeps) {
    const model = makeModel(text);
    let provider: languages.CodeActionProvider | undefined;
    const monaco = {
        languages: {
            registerCodeActionProvider: (_language: string, next: languages.CodeActionProvider) => {
                provider = next;
                return { dispose: () => {} };
            },
        },
    } as unknown as Monaco;
    const codeEditor = { getModel: () => model } as unknown as editor.IStandaloneCodeEditor;
    registerSqlCodeActions(monaco, codeEditor, deps);

    const request = async (startOffset: number, endOffset = startOffset) => {
        const start = model.getPositionAt(startOffset);
        const end = model.getPositionAt(endOffset);
        const range = {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
        };
        const result = await provider!.provideCodeActions(
            model,
            range as never,
            { trigger: 1, only: undefined } as never,
            { isCancellationRequested: false } as never,
        );
        return (result as languages.CodeActionList).actions;
    };
    return { request };
}

describe('registerSqlCodeActions: Expand *', () => {
    it('offers to expand the wildcard under the cursor', async () => {
        const sql = 'SELECT * FROM Customer c';
        const { request } = setup(sql, makeDeps());

        const actions = await request(sql.indexOf('*') + 1);

        expect(actions.map(action => action.title)).toEqual(['Expand * to columns']);
        const textEdit = actions[0].edit?.edits[0] as languages.IWorkspaceTextEdit;
        expect(textEdit.textEdit.text).toBe('Name, Id, [Phone No_]');
        expect(textEdit.textEdit.range).toEqual({
            startLineNumber: 1,
            startColumn: 8,
            endLineNumber: 1,
            endColumn: 9,
        });
        expect(textEdit.versionId).toBe(7);
    });

    it('titles alias wildcards after their qualifier', async () => {
        const sql = 'SELECT c.*, o.Id FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        const { request } = setup(sql, makeDeps());

        const actions = await request(sql.indexOf('c.*') + 1);

        expect(actions.map(action => action.title)).toEqual(['Expand c.* to columns']);
    });

    it('offers nothing when the cursor is away from any wildcard', async () => {
        const sql = 'SELECT * FROM Customer c';
        const { request } = setup(sql, makeDeps());

        expect(await request(sql.indexOf('Customer'))).toEqual([]);
    });

    it('does not treat COUNT(*) as a wildcard', async () => {
        const sql = 'SELECT COUNT(*) FROM Customer c';
        const { request } = setup(sql, makeDeps());

        expect(await request(sql.indexOf('*') + 1)).toEqual([]);
    });

    it('indents a long expansion like the line it sits on', async () => {
        const sql = 'SELECT\n  * FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        const { request } = setup(sql, makeDeps());

        const actions = await request(sql.indexOf('*') + 1);
        const textEdit = actions[0].edit?.edits[0] as languages.IWorkspaceTextEdit;

        expect(textEdit.textEdit.text.startsWith('\n        c.Name\n      , c.Id')).toBe(true);
    });

    it('offers nothing without an active connection or a loaded catalog', async () => {
        const sql = 'SELECT * FROM Customer c';
        const noConnection = setup(sql, makeDeps({ getConnection: () => null }));
        const noCatalog = setup(sql, makeDeps({ getTrees: () => ({}) }));

        expect(await noConnection.request(8)).toEqual([]);
        expect(await noCatalog.request(8)).toEqual([]);
    });

    it('offers nothing when a joined source has unknown columns', async () => {
        const sql = 'SELECT * FROM Customer c JOIN Unknown u ON u.Id = c.Id';
        const { request } = setup(sql, makeDeps());

        expect(await request(8)).toEqual([]);
    });
});

describe('registerSqlCodeActions: Switch schema', () => {
    it('still offers other schemas that contain the missing object', async () => {
        const sql = 'SELECT 1 FROM Orders';
        const start = sql.indexOf('Orders');
        const { request } = setup(
            sql,
            makeDeps({
                getTrees: () => ({
                    'p:db': [tree('dbo', ['Customer']), tree('sales', ['Orders'])],
                }),
                getSchemaWarnings: () => [
                    {
                        objectName: 'Orders',
                        schemaName: 'dbo',
                        startOffset: start,
                        endOffset: start + 'Orders'.length,
                        message: 'not found',
                    },
                ],
            }),
        );

        const actions = await request(start + 2);

        expect(actions.map(action => action.title)).toEqual(['Switch schema to sales']);
        expect(actions[0].command?.id).toBe(SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID);
        expect(actions[0].command?.arguments).toEqual([{ schemaName: 'sales' }]);
    });
});

describe('registerSqlCodeActions: unknown columns', () => {
    const sql = 'SELECT [Contact Persod], Name FROM Employee e';
    const start = sql.indexOf('[Contact Persod]');
    const end = start + '[Contact Persod]'.length;
    const columnWarning = {
        kind: 'unknown' as const,
        severity: 'warning' as const,
        shortMessage: 'not found',
        qualifiers: [] as string[],
        columnName: 'Contact Persod',
        quoted: true,
        startOffset: start,
        endOffset: end,
        message: 'not found',
        suggestions: ['Contact Person', 'Contact Persons'],
        tables: [{ schemaName: 'dbo', name: 'Employee' }],
    };
    const depsWithWarning = (overrides: Partial<SqlCodeActionDeps> = {}) =>
        makeDeps({
            getColumnWarnings: () => [columnWarning],
            getRefreshColumnsCommandId: () => 'cmd-refresh',
            ...overrides,
        });

    it('offers each suggestion, best first and preferred, keeping the original quoting', async () => {
        const { request } = setup(sql, depsWithWarning());

        const actions = await request(start + 3);

        const titles = actions.map(action => action.title);
        expect(titles).toEqual([
            'Change to "Contact Person"',
            'Change to "Contact Persons"',
            'Refresh columns of Employee',
        ]);
        expect(actions[0].isPreferred).toBe(true);
        expect(actions[1].isPreferred).toBe(false);
        const textEdit = actions[0].edit?.edits[0] as languages.IWorkspaceTextEdit;
        expect(textEdit.textEdit.text).toBe('[Contact Person]');
        expect(textEdit.textEdit.range).toEqual({
            startLineNumber: 1,
            startColumn: start + 1,
            endLineNumber: 1,
            endColumn: end + 1,
        });
    });

    it('leaves an unquoted column unquoted unless the new name needs quotes', async () => {
        const bare = { ...columnWarning, quoted: false, suggestions: ['Phone', 'Phone No_'] };
        const { request } = setup(sql, depsWithWarning({ getColumnWarnings: () => [bare] }));

        const actions = await request(start + 3);

        const texts = actions
            .slice(0, 2)
            .map(action => (action.edit?.edits[0] as languages.IWorkspaceTextEdit).textEdit.text);
        expect(texts).toEqual(['Phone', '[Phone No_]']);
    });

    it('runs the per-editor refresh command with the tables of the warning', async () => {
        const { request } = setup(sql, depsWithWarning());

        const actions = await request(start + 3);

        const refresh = actions.find(action => action.title.startsWith('Refresh'));
        expect(refresh?.command?.id).toBe('cmd-refresh');
        expect(refresh?.command?.arguments).toEqual([[{ schemaName: 'dbo', name: 'Employee' }]]);
    });

    it('offers only the refresh when there is no suggestion', async () => {
        const noGuess = { ...columnWarning, suggestions: [] };
        const { request } = setup(sql, depsWithWarning({ getColumnWarnings: () => [noGuess] }));

        expect((await request(start + 3)).map(action => action.title)).toEqual([
            'Refresh columns of Employee',
        ]);
    });

    it('omits the refresh when the editor has no refresh command', async () => {
        const { request } = setup(
            sql,
            depsWithWarning({ getRefreshColumnsCommandId: () => undefined }),
        );

        expect((await request(start + 3)).map(action => action.title)).toEqual([
            'Change to "Contact Person"',
            'Change to "Contact Persons"',
        ]);
    });

    it('offers nothing when the cursor is not on the unknown column', async () => {
        const { request } = setup(sql, depsWithWarning());

        expect(await request(sql.indexOf('Name'))).toEqual([]);
    });

    it('offers a single refresh for several warnings on the same tables', async () => {
        const second = { ...columnWarning, startOffset: start, endOffset: end, suggestions: [] };
        const { request } = setup(
            sql,
            depsWithWarning({ getColumnWarnings: () => [second, second] }),
        );

        const titles = (await request(start, end)).map(action => action.title);

        expect(titles).toEqual(['Refresh columns of Employee']);
    });
});

describe('registerSqlCodeActions: ambiguous columns', () => {
    const sql = 'SELECT order_id FROM orders o JOIN order_details od ON 1 = 1';
    const start = sql.indexOf('order_id');
    const ambiguous = {
        kind: 'ambiguous' as const,
        severity: 'error' as const,
        columnName: 'order_id',
        quoted: false,
        startOffset: start,
        endOffset: start + 'order_id'.length,
        message: 'ambiguous',
        shortMessage: 'ambiguous',
        suggestions: [],
        qualifiers: ['o', 'od'],
        tables: [{ schemaName: 'public', name: 'orders' }],
    };
    const depsWith = (warning = ambiguous) =>
        makeDeps({
            getColumnWarnings: () => [warning],
            getRefreshColumnsCommandId: () => 'cmd-refresh',
        });

    it('offers one qualify fix per table, none preferred, and no refresh', async () => {
        const { request } = setup(sql, depsWith());

        const actions = await request(start + 2);

        expect(actions.map(action => action.title)).toEqual([
            'Qualify as o.order_id',
            'Qualify as od.order_id',
        ]);
        expect(actions.every(action => !action.isPreferred)).toBe(true);
        const edit = actions[1].edit?.edits[0] as languages.IWorkspaceTextEdit;
        expect(edit.textEdit.text).toBe('od.order_id');
        expect(edit.textEdit.range).toEqual({
            startLineNumber: 1,
            startColumn: start + 1,
            endLineNumber: 1,
            endColumn: start + 1 + 'order_id'.length,
        });
    });

    it('quotes the qualified name for the driver and keeps a quoted column quoted', async () => {
        const quoted = { ...ambiguous, columnName: 'order id', quoted: true, qualifiers: ['o'] };
        const { request } = setup(sql, depsWith(quoted));

        const [action] = await request(start + 2);

        expect((action.edit?.edits[0] as languages.IWorkspaceTextEdit).textEdit.text).toBe(
            'o.[order id]',
        );
    });
});
