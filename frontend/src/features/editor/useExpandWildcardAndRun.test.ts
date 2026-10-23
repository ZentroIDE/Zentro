// SPDX-License-Identifier: GPL-3.0-only

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor } from 'monaco-editor';
import { DOM_EVENT } from '../../lib/constants';
import { emitCommand } from '../../lib/commandBus';
import type { SqlCodeActionDeps } from '../../lib/monaco/editorCodeActions';
import type { RunTargetResult } from '../../lib/monaco/monacoRunTarget';
import { useExpandWildcardAndRun } from './useExpandWildcardAndRun';

const toastError = vi.fn();
vi.mock('../../components/layout/Toast', () => ({
    useToast: () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }),
}));

const TAB_ID = 'tab-1';

function makeModel(initialText: string) {
    let text = initialText;
    let version = 1;
    const model = {
        getVersionId: () => version,
        getOffsetAt: ({ column }: { lineNumber: number; column: number }) => column - 1,
        getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
        pushEditOperations: (_before: unknown, edits: Array<{ text: string }>) => {
            text = edits[0].text;
            version += 1;
            return null;
        },
    };
    return {
        model: model as unknown as editor.ITextModel,
        bumpVersion: () => {
            version += 1;
        },
        getText: () => text,
    };
}

const deps: SqlCodeActionDeps = {
    getConnection: () => ({ profileName: 'p', dbName: 'db', driver: 'sqlserver' }),
    getCurrentSchema: () => 'dbo',
    getEnvironmentKey: () => 'dev',
    getTrees: () => ({ 'p:db': [{ Name: 'dbo', Tables: ['Customer'], Views: [] } as never] }),
    getSchemaWarnings: () => [],
    getColumnWarnings: () => [],
    getRefreshColumnsCommandId: () => undefined,
    fetchColumns: async () => [{ Name: 'Name' }, { Name: 'Id' }],
};

function setup(query: string, overrides: { readOnly?: boolean; active?: boolean } = {}) {
    const { model, bumpVersion, getText } = makeModel(query);
    const focus = vi.fn();
    const runTarget = vi.fn();
    const target: RunTargetResult = {
        query,
        range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: query.length + 1,
        },
    };
    renderHook(() =>
        useExpandWildcardAndRun({
            tabId: TAB_ID,
            editorRef: { current: { getModel: () => model, focus } as never },
            isActiveRef: { current: overrides.active ?? true },
            readOnlyRef: { current: overrides.readOnly ?? false },
            codeActionDeps: deps,
            resolveTarget: () => target,
            runTarget,
        }),
    );
    const trigger = () => emitCommand(DOM_EVENT.EXPAND_WILDCARD_AND_RUN_ACTION, { tabId: TAB_ID });
    return { trigger, runTarget, focus, bumpVersion, getText };
}

describe('useExpandWildcardAndRun', () => {
    beforeEach(() => {
        toastError.mockClear();
    });

    it('writes the expanded columns into the editor and runs that query', async () => {
        const { trigger, runTarget, getText, focus } = setup('SELECT * FROM Customer c');

        trigger();
        await vi.waitFor(() => expect(runTarget).toHaveBeenCalledTimes(1));

        expect(getText()).toBe('SELECT Name, Id FROM Customer c');
        expect(runTarget).toHaveBeenCalledWith({
            query: 'SELECT Name, Id FROM Customer c',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 32 },
        });
        expect(focus).toHaveBeenCalled();
    });

    it('runs the query as written when it has no wildcard', async () => {
        const { trigger, runTarget, getText } = setup('SELECT COUNT(*) FROM Customer c');

        trigger();
        await vi.waitFor(() => expect(runTarget).toHaveBeenCalledTimes(1));

        expect(getText()).toBe('SELECT COUNT(*) FROM Customer c');
        expect(runTarget.mock.calls[0][0].query).toBe('SELECT COUNT(*) FROM Customer c');
    });

    it('does not run and reports an error when the columns cannot be resolved', async () => {
        const { trigger, runTarget, getText } = setup('SELECT * FROM Missing m');

        trigger();
        await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

        expect(runTarget).not.toHaveBeenCalled();
        expect(getText()).toBe('SELECT * FROM Missing m');
    });

    it('runs the original text without editing a read-only editor', async () => {
        const { trigger, runTarget, getText } = setup('SELECT * FROM Customer c', {
            readOnly: true,
        });

        trigger();
        await vi.waitFor(() => expect(runTarget).toHaveBeenCalledTimes(1));

        expect(getText()).toBe('SELECT * FROM Customer c');
        expect(runTarget.mock.calls[0][0].query).toBe('SELECT * FROM Customer c');
    });

    it('ignores the command while the tab is not active', async () => {
        const { trigger, runTarget } = setup('SELECT * FROM Customer c', { active: false });

        trigger();
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(runTarget).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it('drops the result when the editor changed while columns were loading', async () => {
        const { trigger, runTarget, bumpVersion, getText } = setup('SELECT * FROM Customer c');
        const slowDeps = deps.fetchColumns;
        deps.fetchColumns = async (...args) => {
            bumpVersion();
            return slowDeps(...args);
        };

        trigger();
        await new Promise(resolve => setTimeout(resolve, 20));
        deps.fetchColumns = slowDeps;

        expect(runTarget).not.toHaveBeenCalled();
        expect(getText()).toBe('SELECT * FROM Customer c');
    });
});
