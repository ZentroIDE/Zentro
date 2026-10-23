// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DisplayRow } from '../../../lib/dataEditing';
import { emitCommand } from '../../../lib/commandBus';
import { DOM_EVENT } from '../../../lib/constants';

import {
    CellContextMenuPayload,
    CellEditPayload,
    CellValue,
    DataColumnMeta,
    DataTableMeta,
    DeletedRowKeys,
    EditedCells,
    FocusCellRequest,
    RevertPayload,
    RowDeletePayload,
    RowKey,
    SelectedCells,
    SelectedRowKeys,
} from '../types';
import {
    makeCellKey,
    parseCellKey,
    mergeDatetimeEditableValue,
    splitDatetimeEditableValue,
} from '../cells/cellUtils';
import { applyDraftRowValueChanges } from '../cells/draftRowUpdates';
import { addColumnSelection, getVisualIndexRange, toggleColumnSelection } from '../selectionUtils';
import { DraftRow } from '../../../lib/dataEditing';

interface UseDataTableInteractionsArgs {
    saveCommandId?: string;
    isDone: boolean;
    columns: string[];
    rows: string[][];
    /** Data-column ids in current VISUAL order — drag-range selection has to
     *  resolve "columns between two endpoints" against this, not against the
     *  fixed schema order `columns` is in, or a reorder desyncs the range. */
    columnOrder: string[];
    dataColumnById: Map<string, DataColumnMeta>;
    selectedCells: SelectedCells;
    onSelectedCellsChange: (cells: SelectedCells) => void;
    selectedRowKeys: SelectedRowKeys;
    onSelectedRowKeysChange: (keys: SelectedRowKeys) => void;
    editedCells: EditedCells;
    deletedRowKeys: DeletedRowKeys;
    draftRows: DraftRow[];
    displayRows: DisplayRow[];
    displayRowsByKey: Map<string, DisplayRow>;
    rowOrder: Map<string, number>;
    isEditable: boolean;
    focusCellRequest?: FocusCellRequest | null;
    onFocusCellRequestHandled?: () => void;
    onRemoveDraftRows?: (draftIds: string[]) => void;
    onCellContextMenu?: (payload: CellContextMenuPayload) => void;
    onRowHeaderContextMenu?: (payload: CellContextMenuPayload) => void;
    onReadOnlyEditAttempt?: () => void;
    /** Columns whose values are blurred. Their cells cannot be opened for editing. */
    blurredColumnIndexes?: DataTableMeta['blurredColumnIndexes'];
    onBlurredEditAttempt?: () => void;
    onCellEdit?: (payload: CellEditPayload) => void;
    onRowDelete?: (payload: RowDeletePayload) => void;
    onRevert?: (payload: RevertPayload) => void;
    onDraftRowsChange?: (draftRows: DraftRow[]) => void;
    onEditedCellsChange?: (editedCells: EditedCells) => void;
    onDeletedRowKeysChange?: (deletedRowKeys: DeletedRowKeys) => void;
}

export interface DataTableInteractions {
    editingCell: string | null;
    editValue: string;
    setEditValue: React.Dispatch<React.SetStateAction<string>>;
    setEditingCell: React.Dispatch<React.SetStateAction<string | null>>;
    commitEdit: (options?: { nextDirection?: 1 | -1 }) => Promise<void>;
    emitSaveShortcut: () => void;
    handleRevertRow: (rowKey: RowKey) => void;
    tableMeta: DataTableMeta;
}

// Header mousedowns call preventDefault (to block text selection), which also stops the browser
// from moving focus into the grid. Without focus, Ctrl+C never reaches the panel's key handler.
function focusGridScroller(event: React.MouseEvent) {
    const scroller = (event.currentTarget as HTMLElement).closest<HTMLElement>(
        '.result-virtual-scroll',
    );
    scroller?.focus({ preventScroll: true });
}

function getSelectedRowKeysFromCells(selectedCells: SelectedCells): RowKey[] {
    return Array.from(
        new Set(Object.keys(selectedCells).map(cellKey => parseCellKey(cellKey).rowKey)),
    );
}

export function useDataTableInteractions({
    saveCommandId,
    isDone,
    columns,
    rows,
    columnOrder,
    dataColumnById,
    selectedCells,
    onSelectedCellsChange,
    selectedRowKeys,
    onSelectedRowKeysChange,
    editedCells,
    deletedRowKeys,
    draftRows,
    displayRows,
    displayRowsByKey,
    rowOrder,
    isEditable,
    focusCellRequest,
    onFocusCellRequestHandled,
    onRemoveDraftRows,
    onCellContextMenu,
    onRowHeaderContextMenu,
    onReadOnlyEditAttempt,
    blurredColumnIndexes,
    onBlurredEditAttempt,
    onCellEdit,
    onRevert,
    onDraftRowsChange,
    onEditedCellsChange,
    onDeletedRowKeysChange,
}: UseDataTableInteractionsArgs): DataTableInteractions {
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [editReadonlySuffix, setEditReadonlySuffix] = useState('');
    const [lastSelected, setLastSelected] = useState<string | null>(null);
    const [dragStart, setDragStart] = useState<{
        rowKey: string;
        colIdx: number;
        active: boolean;
        initialSelected: SelectedCells;
    } | null>(null);
    const [rowDragStart, setRowDragStart] = useState<{
        rowKey: string;
        active: boolean;
    } | null>(null);
    const [lastSelectedColumnIdx, setLastSelectedColumnIdx] = useState<number | null>(null);
    const [columnDragStart, setColumnDragStart] = useState<{
        anchorColIdx: number;
        active: boolean;
        baseSelection: SelectedCells;
    } | null>(null);

    const pendingSelectionRef = useRef<{ cellKey: string; rowKey: string; colIdx: number } | null>(
        null,
    );
    const editValueRef = useRef(editValue);
    const editReadonlySuffixRef = useRef(editReadonlySuffix);
    const editingCellRef = useRef(editingCell);
    const displayRowsRef = useRef(displayRows);

    useEffect(() => {
        editValueRef.current = editValue;
    }, [editValue]);
    useEffect(() => {
        editReadonlySuffixRef.current = editReadonlySuffix;
    }, [editReadonlySuffix]);
    useEffect(() => {
        editingCellRef.current = editingCell;
    }, [editingCell]);
    useEffect(() => {
        displayRowsRef.current = displayRows;
    }, [displayRows]);

    // Blur can be switched on while a cell is open in the editor; close it rather than leave
    // the plaintext editable.
    useEffect(() => {
        if (!editingCell || !blurredColumnIndexes) return;
        const colIdx = columns.indexOf(parseCellKey(editingCell).columnKey);
        if (blurredColumnIndexes[colIdx]) {
            setEditingCell(null);
            setEditReadonlySuffix('');
        }
    }, [blurredColumnIndexes, columns, editingCell]);

    useEffect(() => {
        if (!isDone) {
            setEditingCell(null);
            setEditReadonlySuffix('');
            setLastSelected(null);
            setDragStart(null);
            setLastSelectedColumnIdx(null);
            setColumnDragStart(null);
        }
    }, [isDone, rows]);

    useEffect(() => {
        const handleMouseUp = () => {
            setDragStart(null);
            setRowDragStart(null);
            setColumnDragStart(null);
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const getColumnAnchor = useCallback(
        (fallbackColIdx: number) => {
            if (lastSelectedColumnIdx !== null) return lastSelectedColumnIdx;
            if (!lastSelected) return fallbackColIdx;
            const { columnKey } = parseCellKey(lastSelected);
            const lastColumnIdx = columns.indexOf(columnKey);
            return lastColumnIdx >= 0 ? lastColumnIdx : fallbackColIdx;
        },
        [columns, lastSelected, lastSelectedColumnIdx],
    );

    const emitSaveShortcut = useCallback(() => {
        if (saveCommandId) emitCommand(DOM_EVENT.SAVE_TAB_ACTION, saveCommandId);
    }, [saveCommandId]);

    const setSelectedCellsObj = useCallback(
        (updater: SelectedCells | ((prev: SelectedCells) => SelectedCells)) => {
            const next = typeof updater === 'function' ? updater(selectedCells) : updater;
            onSelectedCellsChange(next);
        },
        [onSelectedCellsChange, selectedCells],
    );

    const setSelectedRowKeysObj = useCallback(
        (updater: SelectedRowKeys | ((prev: SelectedRowKeys) => SelectedRowKeys)) => {
            const next = typeof updater === 'function' ? updater(selectedRowKeys) : updater;
            onSelectedRowKeysChange(next);
        },
        [onSelectedRowKeysChange, selectedRowKeys],
    );

    const focusCell = useCallback(
        (rowKey: string, colIdx: number) => {
            const displayRow = displayRowsByKey.get(rowKey);
            if (!displayRow) return;

            const rawValue = displayRow.values[colIdx] ?? '';
            const { editableValue, suffix } = splitDatetimeEditableValue(rawValue);
            const col = columns[colIdx] ?? `col_${colIdx}`;
            const cellKey = makeCellKey(rowKey, col);

            pendingSelectionRef.current = null;
            onSelectedCellsChange({ [cellKey]: true });
            setLastSelected(cellKey);
            setLastSelectedColumnIdx(colIdx);
            // Jumping to a blurred cell (search hit, jump-to-row) selects it without editing.
            if (blurredColumnIndexes?.[colIdx]) {
                setEditingCell(null);
                setEditReadonlySuffix('');
                return;
            }
            setEditingCell(cellKey);
            setEditReadonlySuffix(suffix);
            setEditValue(editableValue);
        },
        [blurredColumnIndexes, columns, displayRowsByKey, onSelectedCellsChange],
    );

    useEffect(() => {
        if (!focusCellRequest) return;
        focusCell(focusCellRequest.rowKey, focusCellRequest.colIdx);
        onFocusCellRequestHandled?.();
    }, [focusCell, focusCellRequest, onFocusCellRequestHandled]);

    const handleCellMouseDown = useCallback(
        (event: React.MouseEvent, rowKey: string, colIdx: number) => {
            if (!isDone || event.button !== 0) return;
            const col = columns[colIdx] ?? `col_${colIdx}`;
            const cellKey = makeCellKey(rowKey, col);

            if (editingCellRef.current && editingCellRef.current !== cellKey) {
                pendingSelectionRef.current = { cellKey, rowKey, colIdx };
            } else {
                pendingSelectionRef.current = null;
            }

            if (event.shiftKey && lastSelected) {
                const { rowKey: lastRowKey, columnKey: lastColKey } = parseCellKey(lastSelected);
                const lastColIdx = columns.indexOf(lastColKey);
                const currentRowOrder = rowOrder.get(rowKey);
                const lastRowOrder = rowOrder.get(lastRowKey);
                if (
                    currentRowOrder !== undefined &&
                    lastRowOrder !== undefined &&
                    lastColIdx === colIdx
                ) {
                    setSelectedCellsObj(prev => {
                        const next = { ...prev };
                        const min = Math.min(currentRowOrder, lastRowOrder);
                        const max = Math.max(currentRowOrder, lastRowOrder);
                        for (let ri = min; ri <= max; ri++) {
                            next[makeCellKey(displayRows[ri].key, col)] = true;
                        }
                        return next;
                    });
                    return;
                }
            }

            if (event.ctrlKey || event.metaKey) {
                setSelectedCellsObj(prev => {
                    const next = { ...prev };
                    if (next[cellKey]) delete next[cellKey];
                    else next[cellKey] = true;
                    return next;
                });
            } else {
                onSelectedCellsChange({ [cellKey]: true });
                setDragStart({
                    rowKey,
                    colIdx,
                    active: true,
                    initialSelected: { [cellKey]: true },
                });
            }

            setLastSelected(cellKey);
            setLastSelectedColumnIdx(colIdx);
        },
        [
            columns,
            displayRows,
            isDone,
            lastSelected,
            onSelectedCellsChange,
            rowOrder,
            setSelectedCellsObj,
        ],
    );

    const handleCellMouseEnter = useCallback(
        (event: React.MouseEvent, rowKey: string, colIdx: number) => {
            if (!dragStart?.active) return;
            // The button-up that ends a drag can land outside the webview
            // (dragged past the window edge, released over OS chrome, focus
            // lost mid-drag) so the global `mouseup` listener below never
            // fires and `dragStart.active` is left stuck `true`. A plain
            // hover afterwards would otherwise re-run this as if still
            // dragging - guard with the live button state instead of only
            // trusting that stale flag.
            if (event.buttons !== 1) {
                setDragStart(null);
                return;
            }

            const startRowOrder = rowOrder.get(dragStart.rowKey);
            const currentRowOrder = rowOrder.get(rowKey);
            if (startRowOrder === undefined || currentRowOrder === undefined) return;

            const colRange = getVisualIndexRange(
                columnOrder,
                dataColumnById,
                dragStart.colIdx,
                colIdx,
            );

            setSelectedCellsObj(() => {
                const next: SelectedCells = { ...dragStart.initialSelected };
                const minRow = Math.min(startRowOrder, currentRowOrder);
                const maxRow = Math.max(startRowOrder, currentRowOrder);

                for (let ri = minRow; ri <= maxRow; ri++) {
                    colRange.forEach(ci => {
                        const col = columns[ci] ?? `col_${ci}`;
                        next[makeCellKey(displayRows[ri].key, col)] = true;
                    });
                }
                return next;
            });
            setLastSelected(makeCellKey(rowKey, columns[colIdx] ?? `col_${colIdx}`));
            setLastSelectedColumnIdx(colIdx);
        },
        [
            columnOrder,
            columns,
            dataColumnById,
            displayRows,
            dragStart,
            rowOrder,
            setSelectedCellsObj,
        ],
    );

    const handleCellContextMenu = useCallback(
        (event: React.MouseEvent, rowKey: string, colIdx: number) => {
            if (!isDone || !onCellContextMenu) return;
            event.preventDefault();
            event.stopPropagation();
            const col = columns[colIdx] ?? `col_${colIdx}`;
            const cellKey = makeCellKey(rowKey, col);
            if (!selectedCells[cellKey]) {
                onSelectedCellsChange({ [cellKey]: true });
                setLastSelected(cellKey);
                setLastSelectedColumnIdx(colIdx);
            }
            onCellContextMenu({
                x: event.clientX,
                y: event.clientY,
                rowKey,
                colIdx,
                cellKey,
                target: 'cell',
            });
        },
        [columns, isDone, onCellContextMenu, onSelectedCellsChange, selectedCells],
    );

    const handleCellNavigate = useCallback(
        (rowKey: string, colIdx: number) => {
            if (!isDone) return;
            const col = columns[colIdx] ?? `col_${colIdx}`;
            const cellKey = makeCellKey(rowKey, col);
            pendingSelectionRef.current = null;
            onSelectedRowKeysChange({});
            onSelectedCellsChange({ [cellKey]: true });
            setLastSelected(cellKey);
            setLastSelectedColumnIdx(colIdx);
        },
        [columns, isDone, onSelectedCellsChange, onSelectedRowKeysChange],
    );

    const handleColumnHeaderMouseDown = useCallback(
        (event: React.MouseEvent, colIdx: number) => {
            if (!isDone || event.button !== 0) return;

            event.preventDefault();
            event.stopPropagation();
            focusGridScroller(event);
            pendingSelectionRef.current = null;
            setEditingCell(null);
            setEditReadonlySuffix('');
            onSelectedRowKeysChange({});

            const isAdditiveSelection = event.ctrlKey || event.metaKey;
            const anchorColIdx = event.shiftKey ? getColumnAnchor(colIdx) : colIdx;
            const rangeIndexes = getVisualIndexRange(
                columnOrder,
                dataColumnById,
                anchorColIdx,
                colIdx,
            );

            if (event.shiftKey) {
                onSelectedCellsChange(
                    addColumnSelection(
                        isAdditiveSelection ? selectedCells : {},
                        displayRows,
                        columns,
                        rangeIndexes,
                    ),
                );
            } else if (isAdditiveSelection) {
                onSelectedCellsChange(
                    toggleColumnSelection(selectedCells, displayRows, columns, colIdx),
                );
            } else {
                onSelectedCellsChange(addColumnSelection({}, displayRows, columns, [colIdx]));
            }

            setLastSelectedColumnIdx(colIdx);
            setColumnDragStart({
                anchorColIdx,
                active: true,
                baseSelection: isAdditiveSelection ? selectedCells : {},
            });
        },
        [
            columnOrder,
            columns,
            dataColumnById,
            displayRows,
            getColumnAnchor,
            isDone,
            onSelectedCellsChange,
            onSelectedRowKeysChange,
            selectedCells,
        ],
    );

    const handleColumnHeaderMouseEnter = useCallback(
        (event: React.MouseEvent, colIdx: number) => {
            if (!columnDragStart?.active) return;
            // Same stale-drag guard as handleCellMouseEnter - a mouseup that
            // lands outside the webview never reaches the global listener.
            if (event.buttons !== 1) {
                setColumnDragStart(null);
                return;
            }
            const rangeIndexes = getVisualIndexRange(
                columnOrder,
                dataColumnById,
                columnDragStart.anchorColIdx,
                colIdx,
            );
            onSelectedCellsChange(
                addColumnSelection(
                    columnDragStart.baseSelection,
                    displayRows,
                    columns,
                    rangeIndexes,
                ),
            );
            setLastSelectedColumnIdx(colIdx);
        },
        [columnDragStart, columnOrder, columns, dataColumnById, displayRows, onSelectedCellsChange],
    );

    const commitEdit = useCallback(
        async (options?: { nextDirection?: 1 | -1 }) => {
            const currentEditingCell = editingCellRef.current;
            if (!currentEditingCell) return;

            const { rowKey, columnKey } = parseCellKey(currentEditingCell);
            const colIdx = columns.indexOf(columnKey);
            const displayRow = displayRowsRef.current.find(row => row.key === rowKey);
            if (!displayRow) return;

            const nextValue = mergeDatetimeEditableValue(
                editValueRef.current,
                editReadonlySuffixRef.current,
            );
            const originalValue: CellValue = displayRow.values[colIdx] ?? null;

            if (displayRow.kind === 'persisted') {
                const editKey = makeCellKey(rowKey, columnKey);
                if (nextValue === (originalValue ?? '')) {
                    if (editKey in editedCells) {
                        const next = { ...editedCells };
                        delete next[editKey];
                        onEditedCellsChange?.(next);
                    }
                } else {
                    onEditedCellsChange?.({ ...editedCells, [editKey]: nextValue });
                    onCellEdit?.({
                        rowKey,
                        columnKey,
                        colIndex: colIdx,
                        oldValue: originalValue,
                        newValue: nextValue,
                    });
                }
            } else if (displayRow.draft) {
                if (nextValue !== (originalValue ?? '')) {
                    const updated = applyDraftRowValueChanges(draftRows, [
                        { rowKey: displayRow.key, colIdx, value: nextValue },
                    ]);
                    onDraftRowsChange?.(updated);
                }
            }

            if (options?.nextDirection !== undefined) {
                let nextColIdx = colIdx + options.nextDirection;
                // Tab skips blurred columns: they can't be edited.
                while (
                    nextColIdx >= 0 &&
                    nextColIdx < columns.length &&
                    blurredColumnIndexes?.[nextColIdx]
                ) {
                    nextColIdx += options.nextDirection;
                }
                if (nextColIdx >= 0 && nextColIdx < columns.length) {
                    pendingSelectionRef.current = null;
                    const nextCol = columns[nextColIdx];
                    const nextCellKey = makeCellKey(rowKey, nextCol);
                    const nextEditKey = makeCellKey(rowKey, nextCol);
                    const nextCellValue =
                        displayRow.kind === 'persisted'
                            ? (editedCells[nextEditKey] ?? displayRow.values[nextColIdx] ?? '')
                            : (displayRow.values[nextColIdx] ?? '');
                    const nextParts = splitDatetimeEditableValue(nextCellValue);
                    setEditingCell(nextCellKey);
                    setEditReadonlySuffix(nextParts.suffix);
                    setEditValue(nextParts.editableValue);
                    onSelectedCellsChange({ [nextCellKey]: true });
                    setLastSelected(nextCellKey);
                    setLastSelectedColumnIdx(nextColIdx);
                    return;
                }
            }

            setEditingCell(null);
            setEditReadonlySuffix('');
            if (pendingSelectionRef.current) {
                const { cellKey, colIdx: pendingColIdx } = pendingSelectionRef.current;
                pendingSelectionRef.current = null;
                onSelectedCellsChange({ [cellKey]: true });
                setLastSelected(cellKey);
                setLastSelectedColumnIdx(pendingColIdx);
                return;
            }

            onSelectedCellsChange({ [makeCellKey(rowKey, columnKey)]: true });
            setLastSelected(currentEditingCell);
            setLastSelectedColumnIdx(colIdx);
        },
        [
            blurredColumnIndexes,
            columns,
            draftRows,
            editedCells,
            onCellEdit,
            onDraftRowsChange,
            onEditedCellsChange,
            onSelectedCellsChange,
        ],
    );

    const isRowDirty = useCallback(
        (rowKey: RowKey) => {
            const displayRow = displayRowsByKey.get(rowKey);
            if (!displayRow) return false;
            if (displayRow.kind === 'draft') return true;
            if (deletedRowKeys[rowKey]) return true;
            return Object.keys(editedCells).some(
                cellKey => parseCellKey(cellKey).rowKey === rowKey,
            );
        },
        [deletedRowKeys, displayRowsByKey, editedCells],
    );

    const getRevertTargetRowKeys = useCallback(
        (rowKey: RowKey) => {
            const headerSelectedRowKeys = Object.keys(selectedRowKeys);
            if (headerSelectedRowKeys.length > 1 && selectedRowKeys[rowKey]) {
                return headerSelectedRowKeys;
            }

            const cellSelectedRowKeys = getSelectedRowKeysFromCells(selectedCells);
            if (cellSelectedRowKeys.length > 1 && cellSelectedRowKeys.includes(rowKey)) {
                return cellSelectedRowKeys;
            }

            return [rowKey];
        },
        [selectedCells, selectedRowKeys],
    );

    const handleRevertRow = useCallback(
        (rowKey: string) => {
            const targetRowKeys = getRevertTargetRowKeys(rowKey).filter(isRowDirty);
            if (targetRowKeys.length === 0) return;

            const nextEdited = { ...editedCells };
            const nextDeleted = { ...deletedRowKeys };
            const draftIdsToRemove: string[] = [];

            targetRowKeys.forEach(targetRowKey => {
                const displayRow = displayRowsByKey.get(targetRowKey);
                if (!displayRow) return;

                if (displayRow.kind === 'draft') {
                    if (displayRow.draft?.id) draftIdsToRemove.push(displayRow.draft.id);
                    return;
                }

                onRevert?.({ rowKey: targetRowKey });
                Object.keys(nextEdited).forEach(cellKey => {
                    if (parseCellKey(cellKey).rowKey === targetRowKey) {
                        delete nextEdited[cellKey];
                    }
                });
                delete nextDeleted[targetRowKey];
            });

            if (draftIdsToRemove.length > 0) {
                onRemoveDraftRows?.(draftIdsToRemove);
            }

            onEditedCellsChange?.(nextEdited);
            onDeletedRowKeysChange?.(nextDeleted);
        },
        [
            deletedRowKeys,
            displayRowsByKey,
            editedCells,
            getRevertTargetRowKeys,
            isRowDirty,
            onDeletedRowKeysChange,
            onEditedCellsChange,
            onRemoveDraftRows,
            onRevert,
        ],
    );

    const handleCellDoubleClick = useCallback(
        (rowKey: string, colIdx: number, val: string) => {
            if (!isDone) return;
            const displayRow = displayRowsByKey.get(rowKey);
            if (!displayRow) return;
            if (isRowDirty(rowKey) && getRevertTargetRowKeys(rowKey).length > 1) {
                handleRevertRow(rowKey);
                return;
            }
            if (displayRow.kind === 'persisted' && !isEditable) {
                onReadOnlyEditAttempt?.();
                return;
            }
            if (blurredColumnIndexes?.[colIdx]) {
                onBlurredEditAttempt?.();
                return;
            }

            const col = columns[colIdx] ?? `col_${colIdx}`;
            const cellKey = makeCellKey(rowKey, col);
            const { editableValue, suffix } = splitDatetimeEditableValue(val);
            pendingSelectionRef.current = null;
            setEditingCell(cellKey);
            setEditReadonlySuffix(suffix);
            setEditValue(editableValue);
            onSelectedCellsChange({ [cellKey]: true });
            setLastSelected(cellKey);
            setLastSelectedColumnIdx(colIdx);
        },
        [
            blurredColumnIndexes,
            columns,
            displayRowsByKey,
            getRevertTargetRowKeys,
            handleRevertRow,
            isDone,
            isEditable,
            isRowDirty,
            onBlurredEditAttempt,
            onReadOnlyEditAttempt,
            onSelectedCellsChange,
        ],
    );

    const handleRowHeaderMouseDown = useCallback(
        (event: React.MouseEvent, rowKey: string) => {
            if (!isDone || event.button !== 0) return;
            event.preventDefault();
            focusGridScroller(event);
            onSelectedCellsChange({});
            setSelectedRowKeysObj(prev => {
                const next = { ...prev };
                if (event.ctrlKey || event.metaKey) {
                    if (next[rowKey]) delete next[rowKey];
                    else next[rowKey] = true;
                } else if (event.shiftKey) {
                    const keys = Object.keys(prev);
                    const lastKey = keys[keys.length - 1];
                    if (lastKey) {
                        const lastOrder = rowOrder.get(lastKey);
                        const currentOrder = rowOrder.get(rowKey);
                        if (lastOrder !== undefined && currentOrder !== undefined) {
                            const min = Math.min(lastOrder, currentOrder);
                            const max = Math.max(lastOrder, currentOrder);
                            for (let i = min; i <= max; i++) {
                                next[displayRows[i].key] = true;
                            }
                            return next;
                        }
                    }
                    next[rowKey] = true;
                } else {
                    return { [rowKey]: true };
                }
                return next;
            });
            setRowDragStart({ rowKey, active: true });
        },
        [displayRows, isDone, onSelectedCellsChange, rowOrder, setSelectedRowKeysObj],
    );

    const applyRowDragRange = useCallback(
        (dragStartRowKey: string, rowKey: string) => {
            const startOrder = rowOrder.get(dragStartRowKey);
            const currentOrder = rowOrder.get(rowKey);
            if (startOrder === undefined || currentOrder === undefined) return;
            const min = Math.min(startOrder, currentOrder);
            const max = Math.max(startOrder, currentOrder);
            const next: SelectedRowKeys = {};
            for (let i = min; i <= max; i++) {
                next[displayRows[i].key] = true;
            }
            onSelectedRowKeysChange(next);
        },
        [displayRows, onSelectedRowKeysChange, rowOrder],
    );

    const handleRowHeaderMouseEnter = useCallback(
        (event: React.MouseEvent, rowKey: string) => {
            if (!rowDragStart?.active) return;
            // Same stale-drag guard as handleCellMouseEnter - a mouseup that
            // lands outside the webview never reaches the global listener.
            if (event.buttons !== 1) {
                setRowDragStart(null);
                return;
            }
            applyRowDragRange(rowDragStart.rowKey, rowKey);
        },
        [applyRowDragRange, rowDragStart],
    );

    // Per-row `mouseenter` can be missed during a fast real drag (event
    // coalescing), which left the range stuck on just the row the drag
    // started on while the plain `:hover` tint kept sweeping under the
    // cursor - looking selected without being selected. Tracking the drag
    // via a global `mousemove` + `elementFromPoint` sidesteps that: it
    // doesn't depend on the pointer having crossed each row's own element.
    useEffect(() => {
        if (!rowDragStart?.active) return;
        const handleMouseMove = (event: MouseEvent) => {
            if (event.buttons !== 1) {
                setRowDragStart(null);
                return;
            }
            const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>('[data-rt-row]');
            const rowKey = target?.dataset.rowKey;
            if (!rowKey) return;
            applyRowDragRange(rowDragStart.rowKey, rowKey);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [applyRowDragRange, rowDragStart]);

    const handleRowHeaderClick = useCallback(
        (event: React.MouseEvent, rowKey: string) => {
            if (!isDone) return;
            event.preventDefault();
            event.stopPropagation();
            onSelectedCellsChange({});
            setSelectedRowKeysObj(prev => {
                const next = { ...prev };
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                    if (next[rowKey]) delete next[rowKey];
                    else next[rowKey] = true;
                } else {
                    const keys = Object.keys(next);
                    if (keys.length === 1 && next[rowKey]) return {};
                    return { [rowKey]: true };
                }
                return next;
            });
        },
        [isDone, onSelectedCellsChange, setSelectedRowKeysObj],
    );

    const handleRowHeaderContextMenu = useCallback(
        (event: React.MouseEvent, rowKey: string) => {
            if (!isDone || !onRowHeaderContextMenu) return;
            event.preventDefault();
            event.stopPropagation();
            setSelectedRowKeysObj(prev => (prev[rowKey] ? prev : { ...prev, [rowKey]: true }));
            onSelectedCellsChange({});
            onRowHeaderContextMenu({
                x: event.clientX,
                y: event.clientY,
                rowKey,
                colIdx: 0,
                target: 'row-header',
            });
        },
        [isDone, onRowHeaderContextMenu, onSelectedCellsChange, setSelectedRowKeysObj],
    );

    const tableMeta = useMemo<DataTableMeta>(
        () => ({
            selectedCells,
            lastSelected,
            selectedRowKeys,
            editedCells,
            editingCell,
            editValue,
            editReadonlySuffix,
            handleCellMouseDown,
            handleCellMouseEnter,
            handleCellDoubleClick,
            handleCellContextMenu,
            handleCellNavigate,
            handleColumnHeaderMouseDown,
            handleColumnHeaderMouseEnter,
            handleRowHeaderMouseDown,
            handleRowHeaderMouseEnter,
            handleRowHeaderClick,
            handleRowHeaderContextMenu,
            setEditValue,
            setEditingCell,
            handleRevertRow,
            deletedRowKeys,
        }),
        [
            selectedCells,
            lastSelected,
            selectedRowKeys,
            editedCells,
            editingCell,
            editValue,
            editReadonlySuffix,
            handleCellMouseDown,
            handleCellMouseEnter,
            handleCellDoubleClick,
            handleCellContextMenu,
            handleCellNavigate,
            handleColumnHeaderMouseDown,
            handleColumnHeaderMouseEnter,
            handleRowHeaderMouseDown,
            handleRowHeaderMouseEnter,
            handleRowHeaderClick,
            handleRowHeaderContextMenu,
            handleRevertRow,
            deletedRowKeys,
        ],
    );

    return {
        editingCell,
        editValue,
        setEditValue,
        setEditingCell,
        commitEdit,
        emitSaveShortcut,
        handleRevertRow,
        tableMeta,
    };
}
