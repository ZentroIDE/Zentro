// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { models } from '../../../../wailsjs/go/models';
import { DraftRow } from '../../../lib/dataEditing';

export interface FocusCellRequest {
    rowKey: string;
    colIdx: number;
    nonce: number;
}

export interface ResultCellContextMenuPayload {
    x: number;
    y: number;
    rowKey: string;
    colIdx: number;
    cellId?: string;
    target: 'cell' | 'row-header';
}

export interface ResultTableProps {
    tabId: string;
    previewSessionId?: string;
    columns: string[];
    rows: string[][];
    isDone: boolean;
    editedCells: Map<string, string>;
    setEditedCells: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    selectedCells: Set<string>;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedRowKeys: Set<string>;
    setSelectedRowKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
    deletedRows?: Set<number>;
    setDeletedRows?: React.Dispatch<React.SetStateAction<Set<number>>>;
    draftRows: DraftRow[];
    setDraftRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
    columnDefs: models.ColumnDef[];
    focusCellRequest: FocusCellRequest | null;
    onFocusCellRequestHandled: () => void;
    onRemoveDraftRows: (draftIds: string[]) => void;
    readOnlyMode?: boolean;
    quickFilter?: string;
    onViewStatsChange?: (stats: { visibleRows: number; totalRows: number }) => void;
    onCellContextMenu?: (payload: ResultCellContextMenuPayload) => void;
    onRowHeaderContextMenu?: (payload: ResultCellContextMenuPayload) => void;
    columnVisibility?: Record<string, boolean>;
    onColumnVisibilityChange?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    blurredColumnIndexes?: Set<number>;
    /** Schema + connection-scope identity for the Data tab (table browsing) only —
     *  undefined for ad-hoc query tabs, which keeps the "mark as image column"
     *  feature inert there (no stable column identity to key persistence on). */
    dataSchema?: string;
    dataConnectionKey?: string;
    /** Table/Catalog tab's Pinned Environment (ADR-0001) — when set,
     *  "load more" pagination targets this connection via the pinned
     *  query path instead of the ambient Active Environment. Undefined
     *  for ad-hoc query tabs, which stay on the ambient path. */
    pinnedConnection?: { connectionID: string; dbName: string };
}

export interface TableMeta {
    selectedCells: Set<string>;
    selectedRowKeys: Set<string>;
    editedCells: Map<string, string>;
    editingCell: string | null;
    editValue: string;
    editReadonlySuffix?: string;
    handleCellMouseDown: (event: React.MouseEvent, rowKey: string, colIdx: number) => void;
    handleCellMouseEnter: (rowKey: string, colIdx: number) => void;
    handleCellDoubleClick: (rowKey: string, colIdx: number, val: string) => void;
    handleCellContextMenu: (event: React.MouseEvent, rowKey: string, colIdx: number) => void;
    handleRowHeaderMouseDown: (event: React.MouseEvent, rowKey: string) => void;
    handleRowHeaderMouseEnter: (rowKey: string) => void;
    handleRowHeaderClick: (event: React.MouseEvent, rowKey: string) => void;
    handleRowHeaderContextMenu: (event: React.MouseEvent, rowKey: string) => void;
    setEditValue: (value: string) => void;
    setEditingCell: (cellId: string | null) => void;
    handleRevertRow: (rowKey: string) => void;
    blurredColumnIndexes?: Set<number>;
}

export interface DataColumnMeta {
    id: string;
    index: number;
    name: string;
}
