// SPDX-License-Identifier: GPL-3.0-only

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCellId } from '../../resultPanelUtils';
import type { ResultContextMenuDeps } from '../types';
import { useResultContextMenuCopyActions } from './useResultContextMenuCopyActions';

const { setClipboardTextMock, getClipboardTextMock } = vi.hoisted(() => ({
    setClipboardTextMock: vi.fn().mockResolvedValue(undefined),
    getClipboardTextMock: vi.fn(),
}));

vi.mock('../../../../services/clipboardService', () => ({
    getClipboardText: getClipboardTextMock,
    setClipboardText: setClipboardTextMock,
}));

const BLOCKED = 'Selection contains blurred columns. Unblur to copy.';

const displayRows = [
    {
        key: 'p:0',
        kind: 'persisted' as const,
        persistedIndex: 0,
        values: ['1', 'a@x.com', 'Alice'],
    },
];

function setup(options: {
    blurred: ReadonlySet<number> | undefined;
    selection: Set<string>;
    rowHeaderKeys?: string[];
    canMutateCells?: boolean;
}) {
    const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn() };
    const setEditedCells = vi.fn();
    const deps = {
        setEditedCells,
        setDraftRows: vi.fn(),
        setSelectedCells: vi.fn(),
        draftRows: [],
        deletedRows: new Set<number>(),
        blurredColumnIndexes: options.blurred,
        displayRows,
        displayRowsByKey: new Map(displayRows.map(row => [row.key, row])),
        rowOrder: new Map([['p:0', 0]]),
        editedCells: new Map<string, string>(),
        selectedCells: options.selection,
        selectedRowKeysFromHeader: options.rowHeaderKeys ?? [],
        driver: 'postgres',
        result: { columns: ['id', 'email', 'name'], tableName: 'users', lastExecutedQuery: '' },
        columnDefsByName: new Map(),
    } as unknown as ResultContextMenuDeps;

    const hook = renderHook(() =>
        useResultContextMenuCopyActions({
            deps,
            contextMenu: null,
            canCopy: true,
            canPaste: false,
            canMutateCells: options.canMutateCells ?? false,
            getEffectiveSelection: () => options.selection,
            getSingleSelectedColumnIndex: () => 1,
            getSelectionColumnRange: () => ({ minCol: 0, maxCol: 2 }),
            pkColumns: ['id'],
            closeContextMenu: vi.fn(),
            captureSnapshot: vi.fn(),
            registerUndoAction: vi.fn(),
            toast,
        }),
    );
    return { hook, toast, setEditedCells };
}

function runAllCopyActions(hook: ReturnType<typeof setup>['hook']) {
    hook.result.current.handleContextCopy();
    hook.result.current.copyAsActions.forEach(action => action.onSelect());
    hook.result.current.whereActions.forEach(action => action.onSelect());
}

describe('useResultContextMenuCopyActions with blurred columns', () => {
    beforeEach(() => {
        setClipboardTextMock.mockClear();
    });

    it('blocks every copy action when the selection includes a blurred column', () => {
        const { hook, toast } = setup({
            blurred: new Set([1]),
            selection: new Set([makeCellId('p:0', 1)]),
        });

        runAllCopyActions(hook);

        expect(setClipboardTextMock).not.toHaveBeenCalled();
        // Copy + TSV/CSV/JSON/INSERT/UPDATE + WHERE IN
        expect(toast.info).toHaveBeenCalledTimes(7);
        expect(toast.info).toHaveBeenCalledWith(BLOCKED);
    });

    it('blocks INSERT over a span that crosses a blurred column, and any UPDATE', () => {
        const { hook, toast } = setup({
            blurred: new Set([1]),
            selection: new Set([makeCellId('p:0', 0), makeCellId('p:0', 2)]),
        });

        // Selected cells 0 and 2 are fine to copy as text...
        hook.result.current.handleContextCopy();
        expect(setClipboardTextMock).toHaveBeenCalledTimes(1);

        // ...but INSERT spans 0..2 and UPDATE sets every column, so both refuse.
        const byId = Object.fromEntries(
            hook.result.current.copyAsActions.map(action => [action.id, action]),
        );
        byId['copy-insert'].onSelect();
        byId['copy-update'].onSelect();

        expect(setClipboardTextMock).toHaveBeenCalledTimes(1);
        expect(toast.info).toHaveBeenCalledTimes(2);
    });

    it('blocks INSERT for a row-header selection whenever any column is blurred', () => {
        const { hook, toast } = setup({
            blurred: new Set([1]),
            selection: new Set(),
            rowHeaderKeys: ['p:0'],
        });

        hook.result.current.copyAsActions.find(action => action.id === 'copy-insert')?.onSelect();

        expect(setClipboardTextMock).not.toHaveBeenCalled();
        expect(toast.info).toHaveBeenCalledWith(BLOCKED);
    });

    it('copies as usual when nothing is blurred', () => {
        const { hook, toast } = setup({
            blurred: undefined,
            selection: new Set([makeCellId('p:0', 1)]),
        });

        hook.result.current.handleContextCopy();

        expect(setClipboardTextMock).toHaveBeenCalledWith('a@x.com');
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('copies whole rows picked through the row header', () => {
        const { hook, toast } = setup({
            blurred: undefined,
            selection: new Set(),
            rowHeaderKeys: ['p:0'],
        });

        hook.result.current.handleContextCopy();

        expect(setClipboardTextMock).toHaveBeenCalledWith('1\ta@x.com\tAlice');
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('refuses a row-header copy when any column is blurred', () => {
        const { hook, toast } = setup({
            blurred: new Set([1]),
            selection: new Set(),
            rowHeaderKeys: ['p:0'],
        });

        hook.result.current.handleContextCopy();

        expect(setClipboardTextMock).not.toHaveBeenCalled();
        expect(toast.info).toHaveBeenCalledWith(BLOCKED);
    });

    it('paste leaves blurred cells untouched and says so', async () => {
        getClipboardTextMock.mockResolvedValue('X');
        const { hook, toast, setEditedCells } = setup({
            blurred: new Set([1]),
            selection: new Set([makeCellId('p:0', 0), makeCellId('p:0', 1)]),
            canMutateCells: true,
        });

        hook.result.current.handleContextPaste();

        await vi.waitFor(() => expect(setEditedCells).toHaveBeenCalled());
        const written = setEditedCells.mock.calls[0][0] as Map<string, string>;
        expect(written.get('0:0')).toBe('X');
        expect(written.has('0:1')).toBe(false);
        expect(toast.info).toHaveBeenCalledWith(
            'Skipped 1 blurred cell. Unblur the column to edit.',
        );
    });

    it('paste onto only blurred cells changes nothing', async () => {
        getClipboardTextMock.mockResolvedValue('X');
        const { hook, toast, setEditedCells } = setup({
            blurred: new Set([1]),
            selection: new Set([makeCellId('p:0', 1)]),
            canMutateCells: true,
        });

        hook.result.current.handleContextPaste();

        await vi.waitFor(() => expect(toast.info).toHaveBeenCalled());
        expect(setEditedCells).not.toHaveBeenCalled();
    });
});
