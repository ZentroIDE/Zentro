// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { getErrorMessage } from '../../../lib/errors';
import { useToast } from '../../../components/layout/Toast';
import { type TabAction } from './types';
import { useRowSelection } from './useRowSelection';

// Shared workflow scaffolding for the TableInfo schema-object editors
// (foreign keys, indexes, check constraints). Pattern: Template — each view
// keeps only its domain shape (draft type, validation, save phases, table
// markup) and delegates the identical row/selection/dirty/shortcut plumbing
// here.

export interface SchemaObjectRow {
    id: string;
    deleted: boolean;
    isNew?: boolean;
}

interface UseSchemaObjectPanelOptions<TRow extends SchemaObjectRow> {
    /** Loads the current rows; recreate the callback to trigger a refetch. */
    fetchRows: () => Promise<TRow[]>;
    /** Human label used in the load-error toast, e.g. "foreign keys". */
    loadErrorLabel: string;
    /** Counts rows with pending changes (new, deleted, or edited). */
    countDirty: (rows: TRow[]) => number;
    readOnlyMode: boolean;
    onDirtyCountChange?: (count: number) => void;
    /**
     * Row ids selectable via mouse/range selection. Defaults to all rows;
     * views with client-side filtering pass the filtered ids so range
     * selection follows the visible order.
     */
    getSelectableRowIds?: (rows: TRow[]) => string[];
}

export function useSchemaObjectPanel<TRow extends SchemaObjectRow, TField extends string>({
    fetchRows,
    loadErrorLabel,
    countDirty,
    readOnlyMode,
    onDirtyCountChange,
    getSelectableRowIds,
}: UseSchemaObjectPanelOptions<TRow>) {
    const [rows, setRows] = useState<TRow[]>([]);
    const [editCell, setEditCell] = useState<{ rowId: string; field: TField } | null>(null);

    const { toast } = useToast();
    const toastRef = useRef(toast);
    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    const onDirtyCountChangeRef = useRef(onDirtyCountChange);
    useEffect(() => {
        onDirtyCountChangeRef.current = onDirtyCountChange;
    }, [onDirtyCountChange]);

    const handleClearEdit = useCallback(() => setEditCell(null), []);
    const rowIds = useMemo(
        () => (getSelectableRowIds ? getSelectableRowIds(rows) : rows.map(row => row.id)),
        [getSelectableRowIds, rows],
    );
    const {
        selectedRows,
        hasSelection,
        clearSelection,
        clearAfterMutation,
        handleRowMouseDown,
        handleRowMouseEnter,
    } = useRowSelection({ rowIds, onClearEdit: handleClearEdit });

    const {
        data: loadedRows,
        loading,
        saving,
        error: loadError,
        refresh: load,
        runSaving,
    } = useAsyncResource<TRow[]>(fetchRows);

    useEffect(() => {
        if (loadError) {
            toastRef.current.error(
                `Failed to load ${loadErrorLabel}: ${getErrorMessage(loadError)}`,
            );
        }
    }, [loadError, loadErrorLabel]);

    useEffect(() => {
        setRows(loadedRows ?? []);
        setEditCell(null);
        clearSelection();
    }, [loadedRows, clearSelection]);

    const dirtyCount = useMemo(() => countDirty(rows), [countDirty, rows]);
    useEffect(() => {
        onDirtyCountChangeRef.current?.(dirtyCount);
    }, [dirtyCount]);

    // Marks selected persisted rows for drop (toggle) and removes selected
    // new rows entirely — identical across all three editors.
    const toggleDeleteSelected = useCallback(() => {
        if (readOnlyMode || !selectedRows.size) return;
        setRows(prev =>
            prev
                .map(row => {
                    if (!selectedRows.has(row.id)) return row;
                    if (row.isNew) return null;
                    return { ...row, deleted: !row.deleted };
                })
                .filter((row): row is TRow => row !== null),
        );
        clearAfterMutation();
    }, [clearAfterMutation, readOnlyMode, selectedRows]);

    return {
        rows,
        setRows,
        editCell,
        setEditCell,
        selectedRows,
        hasSelection,
        clearSelection,
        clearAfterMutation,
        handleRowMouseDown,
        handleRowMouseEnter,
        loading,
        saving,
        load,
        runSaving,
        toastRef,
        dirtyCount,
        hasChanges: dirtyCount > 0,
        toggleDeleteSelected,
    };
}

/** Publishes the view's toolbar actions to the TableInfo tab chrome. */
export function usePublishedTabActions(
    actions: TabAction[],
    onActionsChange?: (actions: TabAction[]) => void,
) {
    const onActionsChangeRef = useRef(onActionsChange);
    useEffect(() => {
        onActionsChangeRef.current = onActionsChange;
    }, [onActionsChange]);
    useEffect(() => {
        onActionsChangeRef.current?.(actions);
    }, [actions]);
}

/** Max gap between two Escape presses (while not editing a cell) that still
 *  counts as a double-press for onDiscard. */
const DOUBLE_ESCAPE_WINDOW_MS = 500;

interface SchemaObjectShortcutOptions {
    isActive: boolean;
    /** Ctrl/Cmd+S. Omit to leave the shortcut unbound (indexes tab). */
    onSave?: () => void;
    /** Delete, or Ctrl/Cmd+Backspace. */
    onDeleteSelected: () => void;
    /** Escape, every press (while no cell is being edited — a focused
     *  Input/Textarea already handles its own Escape locally). Omit to leave
     *  the shortcut unbound. */
    onEscape?: () => void;
    /** Two Escape presses within DOUBLE_ESCAPE_WINDOW_MS (while no cell is
     *  being edited) discards all pending changes. Omit to leave unbound. */
    onDiscard?: () => void;
    /** Gates onDiscard — double-Escape is a no-op when there's nothing to discard. */
    hasChanges?: boolean;
}

/** Ctrl/Cmd+S save, Delete / Ctrl+Backspace delete, Escape clear, double-Escape
 *  discard-all — active tab only. A focused cell Input/Textarea is left alone
 *  here; each cell's own onKeyDown handles Escape locally (revert that one
 *  field then exit edit mode). */
export function useSchemaObjectShortcuts({
    isActive,
    onSave,
    onDeleteSelected,
    onEscape,
    onDiscard,
    hasChanges,
}: SchemaObjectShortcutOptions) {
    const lastEscapeAtRef = useRef(0);

    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
            )
                return;

            if (
                onSave &&
                (event.key === 's' || event.key === 'S') &&
                (event.ctrlKey || event.metaKey)
            ) {
                event.preventDefault();
                onSave();
                return;
            }

            if (
                event.key === 'Delete' ||
                (event.key === 'Backspace' && (event.ctrlKey || event.metaKey))
            ) {
                onDeleteSelected();
                return;
            }

            if (event.key === 'Escape') {
                onEscape?.();
                if (onDiscard && hasChanges) {
                    const now = Date.now();
                    if (now - lastEscapeAtRef.current <= DOUBLE_ESCAPE_WINDOW_MS) {
                        lastEscapeAtRef.current = 0;
                        onDiscard();
                    } else {
                        lastEscapeAtRef.current = now;
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, onDeleteSelected, onDiscard, onEscape, onSave, hasChanges]);
}
