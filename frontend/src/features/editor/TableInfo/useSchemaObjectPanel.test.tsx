// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('../../../components/layout/Toast', () => ({
    useToast: () => ({ toast: { error: toastError, success: vi.fn() } }),
}));

import {
    useSchemaObjectPanel,
    useSchemaObjectShortcuts,
    usePublishedTabActions,
    type SchemaObjectRow,
} from './useSchemaObjectPanel';

interface TestRow extends SchemaObjectRow {
    name: string;
    edited?: boolean;
}

const countDirty = (rows: TestRow[]) =>
    rows.filter(row => row.isNew || row.deleted || row.edited).length;

const makeRows = (): TestRow[] => [
    { id: 'r1', name: 'one', deleted: false },
    { id: 'r2', name: 'two', deleted: false },
    { id: 'r3', name: 'three', deleted: false, isNew: true },
];

function renderPanel(overrides: Partial<Parameters<typeof useSchemaObjectPanel>[0]> = {}) {
    const fetchRows = vi.fn(async () => makeRows());
    const onDirtyCountChange = vi.fn();
    const hook = renderHook(() =>
        useSchemaObjectPanel<TestRow, 'name'>({
            fetchRows,
            loadErrorLabel: 'test objects',
            countDirty,
            readOnlyMode: false,
            onDirtyCountChange,
            ...(overrides as object),
        }),
    );
    return { ...hook, fetchRows, onDirtyCountChange };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useSchemaObjectPanel', () => {
    it('loads rows and reports the dirty count', async () => {
        const { result, onDirtyCountChange } = renderPanel();

        await waitFor(() => expect(result.current.rows).toHaveLength(3));
        expect(result.current.loading).toBe(false);
        // one isNew row is dirty from the start
        expect(result.current.dirtyCount).toBe(1);
        expect(onDirtyCountChange).toHaveBeenLastCalledWith(1);
        expect(result.current.hasChanges).toBe(true);
    });

    it('toasts when loading fails', async () => {
        renderPanel({ fetchRows: async () => Promise.reject(new Error('boom')) });

        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith('Failed to load test objects: boom'),
        );
    });

    it('toggleDeleteSelected marks persisted rows and removes new rows', async () => {
        const { result } = renderPanel();
        await waitFor(() => expect(result.current.rows).toHaveLength(3));

        act(() => {
            result.current.handleRowMouseDown(
                { button: 0, ctrlKey: false, metaKey: false, shiftKey: false },
                'r1',
            );
        });
        act(() => {
            result.current.handleRowMouseDown(
                { button: 0, ctrlKey: true, metaKey: false, shiftKey: false },
                'r3',
            );
        });
        expect(result.current.selectedRows).toEqual(new Set(['r1', 'r3']));

        act(() => {
            result.current.toggleDeleteSelected();
        });

        const byId = Object.fromEntries(result.current.rows.map(row => [row.id, row]));
        expect(byId.r1.deleted).toBe(true);
        expect(byId.r2.deleted).toBe(false);
        expect(byId.r3).toBeUndefined();
        expect(result.current.selectedRows.size).toBe(0);
    });

    it('does nothing on toggleDeleteSelected in read-only mode', async () => {
        const { result } = renderPanel({ readOnlyMode: true });
        await waitFor(() => expect(result.current.rows).toHaveLength(3));

        act(() => {
            result.current.handleRowMouseDown(
                { button: 0, ctrlKey: false, metaKey: false, shiftKey: false },
                'r1',
            );
        });
        act(() => {
            result.current.toggleDeleteSelected();
        });

        expect(result.current.rows.find(row => row.id === 'r1')?.deleted).toBe(false);
    });

    it('restricts selection to getSelectableRowIds order', async () => {
        const { result } = renderPanel({
            getSelectableRowIds: rows => rows.filter(row => !row.isNew).map(row => row.id),
        });
        await waitFor(() => expect(result.current.rows).toHaveLength(3));

        act(() => {
            result.current.handleRowMouseDown(
                { button: 0, ctrlKey: false, metaKey: false, shiftKey: false },
                'r1',
            );
        });
        act(() => {
            result.current.handleRowMouseDown(
                { button: 0, ctrlKey: false, metaKey: false, shiftKey: true },
                'r2',
            );
        });
        expect(result.current.selectedRows).toEqual(new Set(['r1', 'r2']));
    });

    it('clears edit state when selection clears', async () => {
        const { result } = renderPanel();
        await waitFor(() => expect(result.current.rows).toHaveLength(3));

        act(() => {
            result.current.setEditCell({ rowId: 'r1', field: 'name' });
        });
        expect(result.current.editCell).not.toBeNull();

        act(() => {
            result.current.clearSelection();
        });
        expect(result.current.editCell).toBeNull();
    });
});

describe('useSchemaObjectShortcuts', () => {
    function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, ...opts }));
    }

    it('binds save/delete/escape while active', () => {
        const onSave = vi.fn();
        const onDeleteSelected = vi.fn();
        const onEscape = vi.fn();
        renderHook(() =>
            useSchemaObjectShortcuts({ isActive: true, onSave, onDeleteSelected, onEscape }),
        );

        fireKey('s', { ctrlKey: true });
        fireKey('Delete');
        fireKey('Escape');

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onDeleteSelected).toHaveBeenCalledTimes(1);
        expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('ignores keys when inactive and skips unbound handlers', () => {
        const onDeleteSelected = vi.fn();
        renderHook(() => useSchemaObjectShortcuts({ isActive: false, onDeleteSelected }));
        fireKey('Delete');
        expect(onDeleteSelected).not.toHaveBeenCalled();

        // Active but without onSave: Ctrl+S must not throw.
        renderHook(() => useSchemaObjectShortcuts({ isActive: true, onDeleteSelected }));
        fireKey('s', { ctrlKey: true });
        fireKey('Delete');
        expect(onDeleteSelected).toHaveBeenCalledTimes(1);
    });

    it('discards on a second Escape within the double-press window, not on the first', () => {
        const onDiscard = vi.fn();
        renderHook(() =>
            useSchemaObjectShortcuts({
                isActive: true,
                onDeleteSelected: vi.fn(),
                onDiscard,
                hasChanges: true,
            }),
        );

        fireKey('Escape');
        expect(onDiscard).not.toHaveBeenCalled();

        fireKey('Escape');
        expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it('does not discard on double-Escape when there are no pending changes', () => {
        const onDiscard = vi.fn();
        renderHook(() =>
            useSchemaObjectShortcuts({
                isActive: true,
                onDeleteSelected: vi.fn(),
                onDiscard,
                hasChanges: false,
            }),
        );

        fireKey('Escape');
        fireKey('Escape');
        expect(onDiscard).not.toHaveBeenCalled();
    });
});

describe('usePublishedTabActions', () => {
    it('publishes the latest actions to the parent callback', () => {
        const onActionsChange = vi.fn();
        const first = [{ id: 'a', label: 'A', title: 'A', onClick: vi.fn() }];
        const second = [{ id: 'b', label: 'B', title: 'B', onClick: vi.fn() }];

        const { rerender } = renderHook(
            ({ actions }) => usePublishedTabActions(actions, onActionsChange),
            { initialProps: { actions: first } },
        );
        expect(onActionsChange).toHaveBeenLastCalledWith(first);

        rerender({ actions: second });
        expect(onActionsChange).toHaveBeenLastCalledWith(second);
    });
});
