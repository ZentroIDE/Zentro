// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Lock, Unlock } from 'lucide-react';

import { DisplayRow } from '../../../lib/dataEditing';

import { DataColumnMeta, DataTableMeta } from '../types';
import { makeCellKey } from '../cells/cellUtils';
import { DataTableFloatingEditor } from '../cells/DataTableFloatingEditor';
import { formatCellDisplayValue, isNullValue } from '../cells/cellDisplay';
import { normalizeDataTypeLabel } from '../utils';
import { pluginRegistry } from '../../../lib/plugin/pluginRegistry';
import { PluginErrorBoundary } from '../../../lib/plugin/PluginErrorBoundary';
import { DataTableCell } from '../cells/DataTableCell';

interface UseDataTableColumnsArgs {
    dataColumns: DataColumnMeta[];
    dataTypeByColumn: Map<string, string>;
    isEditable: boolean;
    readOnly: boolean;
    tableName?: string;
    rowNumberOffset?: number;
    onRemoveDraftRows?: (draftIds: string[]) => void;
    commitEdit: (options?: { nextDirection?: 1 | -1 }) => Promise<void>;
    emitSaveShortcut: () => void;
}

export function useDataTableColumns({
    dataColumns,
    dataTypeByColumn,
    isEditable,
    readOnly,
    tableName,
    rowNumberOffset = 0,
    onRemoveDraftRows,
    commitEdit,
    emitSaveShortcut,
}: UseDataTableColumnsArgs): ColumnDef<DisplayRow>[] {
    return useMemo<ColumnDef<DisplayRow>[]>(() => {
        const rowNumCol: ColumnDef<DisplayRow> = {
            id: '__rownum__',
            header: () => (
                <div
                    title={
                        isEditable
                            ? `Editable (${tableName})`
                            : readOnly
                              ? 'Read-only (View Mode)'
                              : 'Read-only (No Primary Key or missing PK in SELECT)'
                    }
                    className='flex items-center w-full justify-center gap-1 cursor-help opacity-70'
                >
                    {isEditable ? (
                        <Unlock size={10} className='text-success' />
                    ) : (
                        <Lock size={10} className='text-muted-foreground' />
                    )}
                </div>
            ),
            enableSorting: false,
            size: 52,
            minSize: 52,
            maxSize: 52,
            cell: ({ row, table }) => {
                const meta = table.options.meta as DataTableMeta | undefined;
                return (
                    <div
                        className='rt-cell-content rt-cell-content--compact row-num-col'
                        onDoubleClick={() => meta?.handleRevertRow?.(row.original.key)}
                        title={
                            row.original.kind === 'draft'
                                ? 'Double-click to remove this unsaved row'
                                : 'Double-click to revert changes to this row'
                        }
                    >
                        {rowNumberOffset + row.index + 1}
                    </div>
                );
            },
        };

        const dataCols: ColumnDef<DisplayRow>[] = dataColumns.map(
            ({ id, index: colIdx, columnKey }) => ({
                id,
                header: columnKey,
                accessorFn: row => row.values[colIdx] ?? null,
                sortingFn: 'alphanumeric',
                size: 140,
                minSize: 72,
                maxSize: 720,
                cell: info => {
                    const meta = info.table.options.meta as DataTableMeta | undefined;
                    const rowKey = info.row.original.key;
                    const cellKey = makeCellKey(rowKey, columnKey);
                    const isSelected = Boolean(meta?.selectedCells?.[cellKey]);
                    const isActive = meta?.lastSelected === cellKey;
                    const isEditing = meta?.editingCell === cellKey;
                    const isBlurred = meta?.blurredColumnIndexes?.[colIdx] === true;
                    const displayRow = info.row.original;
                    const editKey = makeCellKey(rowKey, columnKey);
                    const isDirty =
                        displayRow.kind === 'persisted'
                            ? Boolean(meta?.editedCells && editKey in meta.editedCells)
                            : false;
                    const isDeleted =
                        displayRow.kind === 'persisted'
                            ? Boolean(meta?.deletedRowKeys?.[rowKey])
                            : false;
                    const baseValue = info.getValue() as
                        | string
                        | number
                        | boolean
                        | null
                        | undefined;
                    const value =
                        displayRow.kind === 'persisted'
                            ? (meta?.editedCells?.[editKey] ?? baseValue)
                            : (displayRow.values[colIdx] ?? null);
                    const dataType = dataTypeByColumn.get(columnKey);
                    const normalizedDataType = normalizeDataTypeLabel(dataType);
                    const cellRendererExtension =
                        pluginRegistry.getCellRenderer(normalizedDataType);
                    const displayValue = formatCellDisplayValue(value, { dataType });
                    const isNull = isNullValue(value);

                    if (isEditing) {
                        return (
                            <DataTableFloatingEditor
                                className='rt-cell-input rt-floating-textarea-editor'
                                value={meta?.editValue ?? ''}
                                readonlySuffix={meta?.editReadonlySuffix}
                                onChange={nextValue => meta?.setEditValue?.(nextValue)}
                                onCommit={commitEdit}
                                onCancel={() => {
                                    if (displayRow.kind === 'draft') {
                                        onRemoveDraftRows?.([displayRow.draft!.id]);
                                        return;
                                    }
                                    meta?.setEditingCell?.(null);
                                }}
                                onSaveShortcut={emitSaveShortcut}
                                title='Enter to save | Shift+Enter newline | Tab to move | Esc to cancel'
                            />
                        );
                    }

                    const stringValue = value == null ? '' : String(value);
                    const extensionNode = cellRendererExtension ? (
                        <PluginErrorBoundary pluginId={cellRendererExtension.pluginId}>
                            <cellRendererExtension.component
                                value={value}
                                row={Object.fromEntries(
                                    dataColumns.map((column, index) => [
                                        column.columnKey,
                                        displayRow.values[index] ?? null,
                                    ]),
                                )}
                            />
                        </PluginErrorBoundary>
                    ) : null;

                    return (
                        <DataTableCell
                            stringValue={stringValue}
                            dataType={dataType}
                            displayValue={displayValue}
                            extensionNode={extensionNode}
                            columnKey={columnKey}
                            isSelected={isSelected}
                            isActive={isActive}
                            isDirty={isDirty}
                            isDeleted={isDeleted}
                            isBlurred={isBlurred}
                            isNull={isNull}
                            meta={meta}
                            rowKey={rowKey}
                            colIdx={colIdx}
                        />
                    );
                },
            }),
        );

        return [rowNumCol, ...dataCols];
    }, [
        commitEdit,
        dataColumns,
        dataTypeByColumn,
        emitSaveShortcut,
        isEditable,
        onRemoveDraftRows,
        readOnly,
        rowNumberOffset,
        tableName,
    ]);
}
