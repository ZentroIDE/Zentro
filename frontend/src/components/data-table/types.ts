// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { DraftRow } from '../../lib/dataEditing';
import { DataTableRowLifecycle, RowInsertKind } from '../../lib/enums';

export { DataTableRowLifecycle, RowInsertKind };

// ─── Row identity ─────────────────────────────────────────────────────────────
// pk:<values>  → editable persisted row keyed by primary key
// tmp:<uuid>   → draft/inserted row not yet committed
// rs:<offset>  → read-only result-set row when no PK
export type RowKey = string;

// ─── Raw row data ─────────────────────────────────────────────────────────────
// string[][] for phase 1. All internal access goes through getCellValue so that
// swapping to Record<string, unknown> later only touches this file + cellUtils.
export type RawRow = string[];
export type CellValue = string | null;

// ─── Column spec ──────────────────────────────────────────────────────────────
export interface DataTableColumnSpec {
    key: string;
    name: string;
    defaultWidth?: number;
    meta?: {
        database?: {
            dataType: string;
            fullDataType?: string;
            isPrimaryKey: boolean;
            isNullable: boolean;
            description?: string;
        };
    };
}

// ─── Edit state ───────────────────────────────────────────────────────────────
// Plain objects (not Map/Set) so React memo and Zustand equality checks work correctly.
// cellKey MUST be built with makeCellKey / parsed with parseCellKey — never manual concat.
export type EditedCells = Record<string, string>; // makeCellKey(rowKey, colKey) → value
export type DeletedRowKeys = Record<string, true>; // rowKey → true
export type SelectedCells = Record<string, true>; // cellKey → true
export type SelectedRowKeys = Record<string, true>; // rowKey → true

export interface DataTableEditState {
    editedCells: EditedCells;
    deletedRowKeys: DeletedRowKeys;
    draftRows: DraftRow[];
}

// ─── Row state machine ────────────────────────────────────────────────────────
// Phase 1 renders UI for: dirty, saving, error, conflict, readonly
// saved and locked are typed but have no visual treatment yet

export interface DataTableRowState {
    lifecycle: DataTableRowLifecycle;
    errorMessage?: string;
}

// ─── CRUD callbacks ───────────────────────────────────────────────────────────
export interface CellEditPayload {
    rowKey: RowKey;
    columnKey: string;
    colIndex: number;
    oldValue: CellValue;
    newValue: CellValue;
}

export interface RowInsertPayload {
    afterRowKey: RowKey | null;
    kind: RowInsertKind;
    sourceRowKey?: RowKey;
    defaultValues?: Record<string, CellValue>;
}

export interface RowDeletePayload {
    rowKey: RowKey;
}

export interface RevertPayload {
    rowKey: RowKey;
    columnKey?: string;
}

// ─── Context menu ─────────────────────────────────────────────────────────────
export interface CellContextMenuPayload {
    x: number;
    y: number;
    rowKey: RowKey;
    colIdx: number;
    cellKey?: string;
    target: 'cell' | 'row-header';
}

// ─── Focus request ────────────────────────────────────────────────────────────
export interface FocusCellRequest {
    rowKey: RowKey;
    colIdx: number;
    nonce: number;
}

// ─── Internal TanStack meta ───────────────────────────────────────────────────
export interface DataTableMeta {
    selectedCells: SelectedCells;
    /** cellKey of the most recently selected/dragged-to cell — the one cell in
     *  the selection that should keep a visible border (see rt-cell-active). */
    lastSelected: string | null;
    selectedRowKeys: SelectedRowKeys;
    editedCells: EditedCells;
    editingCell: string | null;
    editValue: string;
    editReadonlySuffix?: string;
    handleColumnHeaderMouseDown: (event: React.MouseEvent, colIdx: number) => void;
    handleColumnHeaderMouseEnter: (event: React.MouseEvent, colIdx: number) => void;
    handleCellMouseDown: (event: React.MouseEvent, rowKey: RowKey, colIdx: number) => void;
    handleCellMouseEnter: (event: React.MouseEvent, rowKey: RowKey, colIdx: number) => void;
    handleCellDoubleClick: (rowKey: RowKey, colIdx: number, val: string) => void;
    handleCellContextMenu: (event: React.MouseEvent, rowKey: RowKey, colIdx: number) => void;
    /** Keyboard navigation: select exactly this cell (no editor), clearing row selection. */
    handleCellNavigate: (rowKey: RowKey, colIdx: number) => void;
    handleRowHeaderMouseDown: (event: React.MouseEvent, rowKey: RowKey) => void;
    handleRowHeaderMouseEnter: (event: React.MouseEvent, rowKey: RowKey) => void;
    handleRowHeaderClick: (event: React.MouseEvent, rowKey: RowKey) => void;
    handleRowHeaderContextMenu: (event: React.MouseEvent, rowKey: RowKey) => void;
    setEditValue: (value: string) => void;
    setEditingCell: (cellKey: string | null) => void;
    handleRevertRow: (rowKey: RowKey) => void;
    blurredColumnIndexes?: Record<number, true>;
    deletedRowKeys?: DeletedRowKeys;
    rowStates?: Record<RowKey, DataTableRowState>;
}

// ─── Column meta (internal) ───────────────────────────────────────────────────
export interface DataColumnMeta {
    id: string;
    index: number;
    name: string;
    columnKey: string;
}

// ─── Main component props ─────────────────────────────────────────────────────
export interface DataTableProps {
    // Required
    columns: DataTableColumnSpec[];
    rows: RawRow[];
    getRowKey: (row: RawRow, index: number) => RowKey;

    // CRUD
    editState?: DataTableEditState;
    rowStates?: Record<RowKey, DataTableRowState>;
    isEditable?: boolean;
    readOnly?: boolean;
    onCellEdit?: (payload: CellEditPayload) => void;
    onRowInsert?: (payload: RowInsertPayload) => void;
    onRowDelete?: (payload: RowDeletePayload) => void;
    onRevert?: (payload: RevertPayload) => void;

    // Virtualization boundary — table emits signal only, caller handles fetch logic
    onNearBottom?: (payload: { visibleEndIndex: number; totalLoadedRows: number }) => void;
    onViewportChange?: (range: { start: number; end: number }) => void;

    // Loading state (caller controls)
    isDone?: boolean;
    isFetchingMore?: boolean;
    totalCount?: number;
    windowStartOffset?: number;
    hasMore?: boolean;

    // Sort / Filter
    quickFilter?: string;
    disableClientSort?: boolean;

    // Selection (controlled)
    selectedCells?: SelectedCells;
    onSelectedCellsChange?: (cells: SelectedCells) => void;
    selectedRowKeys?: SelectedRowKeys;
    onSelectedRowKeysChange?: (keys: SelectedRowKeys) => void;

    // Focus
    focusCellRequest?: FocusCellRequest | null;
    onFocusCellRequestHandled?: () => void;

    // Context menu
    onCellContextMenu?: (payload: CellContextMenuPayload) => void;
    onRowHeaderContextMenu?: (payload: CellContextMenuPayload) => void;

    // Display
    columnVisibility?: Record<string, boolean>;
    onColumnVisibilityChange?: (v: Record<string, boolean>) => void;
    blurredColumnIndexes?: Record<number, true>;
    tableName?: string;

    // Callbacks
    onViewStatsChange?: (stats: { visibleRows: number; totalRows: number }) => void;
    onRemoveDraftRows?: (draftIds: string[]) => void;
    onReadOnlyEditAttempt?: () => void;
}
