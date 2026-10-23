// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { flexRender, type Table } from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';

import { DisplayRow } from '../../lib/dataEditing';

import { DataTypeIcon } from './dataTypeIcon';
import { DataColumnMeta, DataTableMeta } from './types';
import { SortableHeaderCell } from './header/SortableHeaderCell';
import { ImageColumnHeaderMenu } from './header/ImageColumnHeaderMenu';

interface DataTableHeaderProps {
    table: Table<DisplayRow>;
    columnOrder: string[];
    renderedColumnIndexes: number[];
    columnPaddingLeft: number;
    columnPaddingRight: number;
    dataColumnById: Map<string, DataColumnMeta>;
    dataTypeByColumn: Map<string, string>;
    columnHintByColumn?: Map<string, string>;
    selectedColumnIndexSet: ReadonlySet<number>;
    handleAutoFitColumn: (columnId: string) => void;
    isDone: boolean;
    meta?: DataTableMeta;
    imageColumnTableKey?: string;
    dataConnectionKey?: string;
    /** Memo invalidation only — `getIsSorted()` and `getSize()` read these off
     *  the table instance, so the header has to re-render when they change. */
    sorting: unknown;
    columnSizing: unknown;
    columnVisibility: unknown;
}

/**
 * The whole `<thead>`. Memoized as a unit: every header cell runs `useSortable`,
 * which is far too expensive to re-run on each scroll frame. All of its props
 * are stable while scrolling, so vertical scrolling skips this subtree entirely.
 */
export const DataTableHeader: React.FC<DataTableHeaderProps> = React.memo(
    ({
        table,
        columnOrder,
        renderedColumnIndexes,
        columnPaddingLeft,
        columnPaddingRight,
        dataColumnById,
        dataTypeByColumn,
        columnHintByColumn,
        selectedColumnIndexSet,
        handleAutoFitColumn,
        isDone,
        meta,
        imageColumnTableKey,
        dataConnectionKey,
    }) => {
        return (
            <thead>
                {table.getHeaderGroups().map(headerGroup => {
                    const fixedHeader = headerGroup.headers[0];
                    const dynamicHeaders = headerGroup.headers.slice(1);
                    return (
                        <tr key={headerGroup.id}>
                            {fixedHeader &&
                                (() => {
                                    const sorted = fixedHeader.column.getIsSorted();
                                    const canSort = fixedHeader.column.getCanSort();
                                    return (
                                        <th
                                            key={fixedHeader.id}
                                            style={{
                                                width: fixedHeader.getSize(),
                                                minWidth: fixedHeader.getSize(),
                                                maxWidth: fixedHeader.getSize(),
                                                zIndex: 21,
                                            }}
                                            className={`rt-th rt-index-sticky ${canSort ? 'rt-th-sortable' : ''} ${sorted ? 'rt-th-sorted' : ''}`}
                                            onClick={
                                                canSort
                                                    ? fixedHeader.column.getToggleSortingHandler()
                                                    : undefined
                                            }
                                            title={
                                                canSort && !isDone
                                                    ? 'Sort available after query completes'
                                                    : undefined
                                            }
                                        >
                                            <span className='rt-th-label justify-center'>
                                                {flexRender(
                                                    fixedHeader.column.columnDef.header,
                                                    fixedHeader.getContext(),
                                                )}
                                                {sorted === 'asc' && (
                                                    <ArrowUp size={11} className='rt-sort-icon' />
                                                )}
                                                {sorted === 'desc' && (
                                                    <ArrowDown size={11} className='rt-sort-icon' />
                                                )}
                                            </span>
                                        </th>
                                    );
                                })()}
                            {columnPaddingLeft > 0 && (
                                <th
                                    aria-hidden
                                    className='rt-th'
                                    style={{
                                        width: columnPaddingLeft,
                                        minWidth: columnPaddingLeft,
                                        maxWidth: columnPaddingLeft,
                                    }}
                                />
                            )}
                            <SortableContext
                                items={columnOrder}
                                strategy={horizontalListSortingStrategy}
                            >
                                {renderedColumnIndexes.map(columnIndex => {
                                    const header = dynamicHeaders[columnIndex];
                                    if (!header) return null;
                                    const sorted = header.column.getIsSorted();
                                    const columnId = String(header.column.id);
                                    const columnMeta = dataColumnById.get(columnId);
                                    const columnName = columnMeta?.name || columnId;
                                    const dataTypeLabel =
                                        dataTypeByColumn.get(columnName) || 'unknown';
                                    const columnHint = columnHintByColumn?.get(columnName);
                                    const isColumnSelected = selectedColumnIndexSet.has(
                                        columnMeta?.index ?? -1,
                                    );
                                    return (
                                        <SortableHeaderCell
                                            key={header.id}
                                            header={header}
                                            className={`rt-th ${sorted ? 'rt-th-sorted' : ''} ${isColumnSelected ? 'rt-th-column-selected' : ''}`}
                                            onAutoFit={() => handleAutoFitColumn(columnId)}
                                            onMouseDown={event =>
                                                meta?.handleColumnHeaderMouseDown?.(
                                                    event,
                                                    columnMeta?.index ?? columnIndex,
                                                )
                                            }
                                            onMouseEnter={event =>
                                                meta?.handleColumnHeaderMouseEnter?.(
                                                    event,
                                                    columnMeta?.index ?? columnIndex,
                                                )
                                            }
                                            title={undefined}
                                        >
                                            {dragHandleProps => (
                                                <ImageColumnHeaderMenu
                                                    columnName={columnName}
                                                    connectionKey={dataConnectionKey}
                                                    tableKey={imageColumnTableKey}
                                                >
                                                    <div className='rt-th-content'>
                                                        <span
                                                            className='rt-th-label rt-th-drag-target'
                                                            {...dragHandleProps}
                                                        >
                                                            <DataTypeIcon
                                                                type={dataTypeLabel}
                                                                hint={columnHint}
                                                                className='rt-th-type'
                                                            />
                                                            <span className='rt-th-name'>
                                                                {flexRender(
                                                                    header.column.columnDef.header,
                                                                    header.getContext(),
                                                                )}
                                                            </span>
                                                            {sorted === 'asc' && (
                                                                <ArrowUp
                                                                    size={11}
                                                                    className='rt-sort-icon'
                                                                />
                                                            )}
                                                            {sorted === 'desc' && (
                                                                <ArrowDown
                                                                    size={11}
                                                                    className='rt-sort-icon'
                                                                />
                                                            )}
                                                        </span>
                                                    </div>
                                                </ImageColumnHeaderMenu>
                                            )}
                                        </SortableHeaderCell>
                                    );
                                })}
                            </SortableContext>
                            {columnPaddingRight > 0 && (
                                <th
                                    aria-hidden
                                    className='rt-th'
                                    style={{
                                        width: columnPaddingRight,
                                        minWidth: columnPaddingRight,
                                        maxWidth: columnPaddingRight,
                                    }}
                                />
                            )}
                        </tr>
                    );
                })}
            </thead>
        );
    },
);

DataTableHeader.displayName = 'DataTableHeader';
