// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { SqlColumnWarning } from '../../lib/monaco/sqlColumnValidation';
import { useSchemaStore, type SchemaNode } from '../../stores/schemaStore';
import { useColumnCheck } from './useColumnCheck';

const findUnknownColumns = vi.fn();
vi.mock('../../lib/monaco/sqlColumnValidation', () => ({
    findUnknownColumns: (...args: unknown[]) => findUnknownColumns(...args),
}));

const decorations = { update: vi.fn(), clear: vi.fn() };
const setupDecorations = vi.fn(() => decorations);
vi.mock('../../lib/monaco/editorSchemaWarningDecorations', () => ({
    setupSchemaWarningDecorations: (...args: unknown[]) => setupDecorations(...(args as [])),
}));

const warning: SqlColumnWarning = {
    kind: 'unknown',
    severity: 'warning',
    shortMessage: 'not found',
    qualifiers: [],
    columnName: 'Salary',
    quoted: false,
    startOffset: 7,
    endOffset: 13,
    message: 'not found',
    suggestions: [],
    tables: [],
};

const params = {
    tabId: 'tab-1',
    inlineMessages: false,
    enabled: true,
    sqlText: 'SELECT Salary FROM Employee',
    schemas: [{ Name: 'dbo', Tables: ['Employee'], Views: [] }] as unknown as SchemaNode[],
    currentSchema: 'dbo',
    profileName: 'main',
    dbName: 'db',
    driver: 'sqlserver',
};

function makeEditor(commandId: string | null = 'cmd-1') {
    const addCommand = vi.fn((_key: number, _handler: (...args: never[]) => void) => commandId);
    return { editor: { addCommand } as unknown as editor.IStandaloneCodeEditor, addCommand };
}

const monaco = {} as Monaco;
const flush = () => act(async () => vi.advanceTimersByTimeAsync(600));

describe('useColumnCheck', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        findUnknownColumns.mockReset();
        findUnknownColumns.mockResolvedValue([warning]);
        decorations.update.mockClear();
        decorations.clear.mockClear();
        setupDecorations.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('sets up squiggles for this tab under their own marker source', () => {
        const { result } = renderHook(() => useColumnCheck(params));
        const { editor: fakeEditor } = makeEditor();

        act(() => {
            result.current.attach(fakeEditor, monaco);
        });

        expect(setupDecorations).toHaveBeenCalledWith(
            fakeEditor,
            monaco,
            'zentro-column-check-tab-1',
            {
                source: 'column-check',
            },
        );
    });

    it('shows the warnings once the check finishes, and exposes them to providers', async () => {
        const { result } = renderHook(() => useColumnCheck(params));
        act(() => {
            result.current.attach(makeEditor().editor, monaco);
        });

        await flush();

        expect(decorations.update).toHaveBeenLastCalledWith([warning], false);
        expect(result.current.getWarnings()).toEqual([warning]);
    });

    it('registers a per-editor refresh command and exposes its id', () => {
        const { result } = renderHook(() => useColumnCheck(params));
        const { editor: fakeEditor, addCommand } = makeEditor('cmd-42');

        act(() => {
            result.current.attach(fakeEditor, monaco);
        });

        expect(addCommand).toHaveBeenCalledTimes(1);
        expect(result.current.getRefreshCommandId()).toBe('cmd-42');
    });

    it('has no refresh command id when the editor cannot register one', () => {
        const { result } = renderHook(() => useColumnCheck(params));

        act(() => {
            result.current.attach(makeEditor(null).editor, monaco);
        });

        expect(result.current.getRefreshCommandId()).toBeUndefined();
    });

    it('re-reads the tables when the refresh command runs', async () => {
        const forced = vi.spyOn(useSchemaStore.getState(), 'checkAndFetchColumns');
        forced.mockResolvedValue([]);
        const { result } = renderHook(() => useColumnCheck(params));
        const { editor: fakeEditor, addCommand } = makeEditor();
        act(() => {
            result.current.attach(fakeEditor, monaco);
        });
        const handler = addCommand.mock.calls[0][1] as (a: unknown, t: unknown) => void;

        await act(async () => {
            handler(null, [{ schemaName: 'dbo', name: 'Employee' }]);
        });

        expect(forced).toHaveBeenCalledWith('main', 'db', 'dbo', 'Employee', { force: true });
        forced.mockRestore();
    });

    it('clears the squiggles when the editor is detached', () => {
        const { result } = renderHook(() => useColumnCheck(params));
        let detach = () => {};
        act(() => {
            detach = result.current.attach(makeEditor().editor, monaco);
        });

        detach();

        expect(decorations.clear).toHaveBeenCalledTimes(1);
    });
});
