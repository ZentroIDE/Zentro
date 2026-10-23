// SPDX-License-Identifier: GPL-3.0-only

export { DataTableGrid } from './DataTableGrid';
export { DataTableHeader } from './DataTableHeader';
export { DataTableRow } from './DataTableRow';
export { RT_ROW_HEIGHT, RT_DEFAULT_COLUMN_WIDTH } from './gridMetrics';
export { DataTypeIcon } from './dataTypeIcon';
export { DataTableFloatingEditor } from './cells/DataTableFloatingEditor';
export { SortableHeaderCell } from './header/SortableHeaderCell';

export { useDataTable } from './hooks/useDataTable';
export { useDataTableColumnState } from './hooks/useDataTableColumnState';
export type { DataTableColumnState } from './hooks/useDataTableColumnState';
export { useDataTableColumns } from './hooks/useDataTableColumns';
export { useDataTableDataModel } from './hooks/useDataTableDataModel';
export type { DataTableDataModel } from './hooks/useDataTableDataModel';
export { useDataTableInteractions } from './hooks/useDataTableInteractions';
export type { DataTableInteractions } from './hooks/useDataTableInteractions';
export { useDataTableVirtualization } from './hooks/useDataTableVirtualization';
export type { DataTableVirtualization } from './hooks/useDataTableVirtualization';
export { useDataTableViewStats } from './hooks/useDataTableViewStats';

export type {
    DataTableColumnSpec,
    EditedCells,
    DeletedRowKeys,
    SelectedCells,
    SelectedRowKeys,
    DataTableEditState,
    DataTableRowState,
    CellEditPayload,
    RowInsertPayload,
    RowDeletePayload,
    RevertPayload,
    CellContextMenuPayload,
    FocusCellRequest,
    DataTableMeta,
    DataColumnMeta,
    DataTableProps,
    RowKey,
    RawRow,
    CellValue,
} from './types';

export {
    getCellValue,
    makeCellKey,
    parseCellKey,
    makeDataColumnId,
    isDatetimeLike,
    toDatetimeLocalValue,
    fromDatetimeLocalValue,
    splitDatetimeEditableValue,
    mergeDatetimeEditableValue,
    getDragIds,
} from './cells/cellUtils';
export { formatCellDisplayValue } from './cells/cellDisplay';
export type { DisplayableCellValue } from './cells/cellDisplay';
export { applyDraftRowValueChanges } from './cells/draftRowUpdates';

export {
    getColumnCellKeys,
    addColumnSelection,
    toggleColumnSelection,
    getSelectedColumnIndexesFromCells,
} from './selectionUtils';

export {
    normalizeDataTypeLabel,
    buildColumnHint,
    reorderDataColumnIds,
    buildHeaderColumnFilterExpr,
    computeAutoFitWidth,
} from './utils';
