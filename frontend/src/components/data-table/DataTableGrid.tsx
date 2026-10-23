// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { type Table } from '@tanstack/react-table';
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';

import { DisplayRow } from '../../lib/dataEditing';
import { useImageColumnStore } from '../../stores/imageColumnStore';
import { ImagePreviewHost } from '../viewers/ImagePreviewHost';

import {
    DataColumnMeta,
    DataTableMeta,
    DeletedRowKeys,
    SelectedCells,
    SelectedRowKeys,
} from './types';
import { parseCellKey } from './cells/cellUtils';
import { EMPTY_IMAGE_COLUMN_MARKS, MarkedImageColumnsContext } from './cells/imageColumnMarks';
import { Spinner } from '../ui';
import {
    getArrowNavigationTarget,
    getSelectedColumnIndexesFromCells,
    type ArrowNavigationKey,
} from './selectionUtils';
import { DataTableHeader } from './DataTableHeader';
import { DataTableRow } from './DataTableRow';

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTextEntryTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement)
    );
}

interface DataTableGridProps {
    parentRef: React.RefObject<HTMLDivElement>;
    onScroll: () => void;
    table: Table<DisplayRow>;
    columnsLength: number;
    isDone: boolean;
    isDeferredSorting: boolean;
    isDeferredFiltering: boolean;
    isFetchingMore: boolean;
    columnOrder: string[];
    virtualItems: Array<{ index: number; start: number; end: number }>;
    renderedColumnIndexes: number[];
    columnPaddingLeft: number;
    columnPaddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    /** Height the row virtualizer is actually positioning with. */
    rowHeight: number;
    /** Virtual slots standing in for rows evicted above the loaded window.
     *  Subtract from a virtual index to reach the loaded row. */
    leadingPlaceholderRows: number;
    dataColumnById: Map<string, DataColumnMeta>;
    dataTypeByColumn: Map<string, string>;
    columnHintByColumn?: Map<string, string>;
    /** Memo invalidation only — this component reads column widths off
     *  `table.getState().columnSizing` at render time, but `table`'s own
     *  identity is stable across state updates and the derived virtualization
     *  props (renderedColumnIndexes, padding) don't always change for a small
     *  resize/auto-fit delta. Without a prop that actually changes, React.memo
     *  bails and the grid keeps painting the old width until some unrelated
     *  prop (e.g. a click changing selectedCells) forces the next re-render. */
    columnSizing: Record<string, number>;
    handleAutoFitColumn: (columnId: string) => void;
    handleHeaderDragEnd: (event: DragEndEvent) => void;
    selectedCells: SelectedCells;
    selectedRowKeys: SelectedRowKeys;
    deletedRowKeys?: DeletedRowKeys;
    /** Memo invalidation only — cells read the live value off `table.options.meta`,
     *  but that object's identity doesn't change on the `table` prop, so a
     *  keystroke needs its own tracked prop or the row skips re-rendering. */
    editingCell: string | null;
    editValue: string;
    /** Memo invalidation only, same reason as above: blur is read off `table.options.meta`, so
     *  toggling it changes no other prop and the grid would keep showing the old state until the
     *  next click changed the selection. */
    blurredColumnIndexes?: DataTableMeta['blurredColumnIndexes'];
    windowStartOffset: number;
    /** Data-tab-only identity for the "Mark as Image Column" header menu —
     *  undefined for ad-hoc query tabs, which keeps the menu off entirely. */
    dataSchema?: string;
    dataConnectionKey?: string;
    dataTableName?: string;
    /** Keyboard entry point for the "resultGrid" focus zone (Ctrl+Shift+G) and
     *  for Enter/F2 cell-edit entry + Escape round-trip, wired by ResultTable. */
    onGridKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export const DataTableGrid: React.FC<DataTableGridProps> = React.memo(
    ({
        parentRef,
        onScroll,
        table,
        columnsLength,
        isDone,
        isDeferredSorting,
        isDeferredFiltering,
        isFetchingMore,
        columnOrder,
        virtualItems,
        renderedColumnIndexes,
        columnPaddingLeft,
        columnPaddingRight,
        paddingTop,
        paddingBottom,
        rowHeight,
        leadingPlaceholderRows,
        dataColumnById,
        dataTypeByColumn,
        columnHintByColumn,
        handleAutoFitColumn,
        handleHeaderDragEnd,
        selectedCells,
        selectedRowKeys,
        deletedRowKeys,
        editingCell,
        editValue,
        windowStartOffset,
        dataSchema,
        dataConnectionKey,
        dataTableName,
        onGridKeyDown,
    }) => {
        const dndSensors = useSensors(
            useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        );
        const imageColumnTableKey =
            dataSchema && dataTableName ? `${dataSchema}.${dataTableName}` : undefined;

        // One store subscription for the whole grid; cells read the result from
        // context instead of subscribing individually.
        const markedImageColumns = useImageColumnStore(state =>
            dataConnectionKey && imageColumnTableKey && state.activeScopeKey === dataConnectionKey
                ? state.byTable[imageColumnTableKey]
                : undefined,
        );

        const tableRows = table.getRowModel().rows;
        const tableState = table.getState();
        const meta = table.options.meta as DataTableMeta | undefined;

        const dataColumns = React.useMemo(
            () =>
                Array.from(dataColumnById.values()).sort((left, right) => left.index - right.index),
            [dataColumnById],
        );
        const selectedColumnIndexes = React.useMemo(
            () =>
                getSelectedColumnIndexesFromCells(
                    selectedCells,
                    dataColumns.map(column => column.columnKey),
                ),
            [dataColumns, selectedCells],
        );
        const selectedColumnIndexSet = React.useMemo(
            () => new Set(selectedColumnIndexes),
            [selectedColumnIndexes],
        );
        // Derived once instead of scanning every selected cell key per row —
        // that scan was quadratic in the size of the selection, on every frame.
        const rowKeysWithSelectedCell = React.useMemo(() => {
            const keys = new Set<string>();
            Object.keys(selectedCells).forEach(cellKey => {
                keys.add(parseCellKey(cellKey).rowKey);
            });
            return keys;
        }, [selectedCells]);

        // Zebra striping follows a row's absolute position in the result, not its
        // virtual index, so the stripes stay put as the loaded window slides.
        const toAbsoluteRowIndex = (virtualIndex: number) =>
            windowStartOffset + virtualIndex - leadingPlaceholderRows;

        // The spacers stand in for rows outside the rendered window, so their
        // skeleton has to start on the zebra phase those rows would have had.
        const lastVirtualIndex =
            virtualItems.length > 0 ? (virtualItems[virtualItems.length - 1]?.index ?? 0) : 0;
        const topSpacerStartsTinted = Math.abs(toAbsoluteRowIndex(0)) % 2 === 1;
        const bottomSpacerStartsTinted =
            Math.abs(toAbsoluteRowIndex(lastVirtualIndex + 1)) % 2 === 1;

        const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (!ARROW_KEYS.has(event.key)) return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            // An open cell editor (or any input) owns the arrows; they move its caret.
            if (!isDone || !meta?.handleCellNavigate || editingCell) return;
            if (isTextEntryTarget(event.target)) return;

            const visibleDataColumns = table
                .getVisibleLeafColumns()
                .map(column => dataColumnById.get(column.id))
                .filter((column): column is DataColumnMeta => column !== undefined);
            const target = getArrowNavigationTarget({
                key: event.key as ArrowNavigationKey,
                rowKeys: tableRows.map(row => row.original.key),
                columns: visibleDataColumns,
                current: meta.lastSelected ? parseCellKey(meta.lastSelected) : null,
            });
            if (!target) return;

            event.preventDefault();
            meta.handleCellNavigate(target.rowKey, target.colIdx);
        };

        // Keep the active cell in view after keyboard navigation. Plain `scrollIntoView`
        // would slide the cell under the sticky header and index column, so bound the
        // visible area by those instead.
        const activeCellKey = meta?.lastSelected ?? null;
        React.useEffect(() => {
            const scrollEl = parentRef.current;
            if (!scrollEl || !activeCellKey) return;
            const cellEl = scrollEl.querySelector('.rt-cell-active')?.closest('td');
            if (!cellEl) return;

            const viewport = scrollEl.getBoundingClientRect();
            const rect = cellEl.getBoundingClientRect();
            const headerHeight =
                scrollEl.querySelector('thead')?.getBoundingClientRect().height ?? 0;
            const indexWidth =
                scrollEl.querySelector<HTMLElement>('td.rt-index-sticky')?.offsetWidth ?? 0;
            const minTop = viewport.top + headerHeight;
            const maxBottom = viewport.top + scrollEl.clientHeight;
            const minLeft = viewport.left + indexWidth;
            const maxRight = viewport.left + scrollEl.clientWidth;

            if (rect.top < minTop) scrollEl.scrollTop -= minTop - rect.top;
            else if (rect.bottom > maxBottom) scrollEl.scrollTop += rect.bottom - maxBottom;
            if (rect.left < minLeft) scrollEl.scrollLeft -= minLeft - rect.left;
            else if (rect.right > maxRight) scrollEl.scrollLeft += rect.right - maxRight;
        }, [activeCellKey, parentRef]);

        return (
            <div
                ref={parentRef}
                className='result-virtual-scroll'
                style={{ outline: 'none' }}
                tabIndex={0}
                data-zone='resultGrid'
                onScroll={onScroll}
                onKeyDown={event => {
                    handleKeyDown(event);
                    onGridKeyDown?.(event);
                }}
            >
                {(isDeferredSorting || isDeferredFiltering) && (
                    <div className='px-3 py-1 text-label text-muted-foreground border-b border-border bg-card/50'>
                        {isDeferredFiltering
                            ? 'Applying incremental filter for loaded rows...'
                            : 'Applying incremental sort for large result set...'}
                    </div>
                )}
                <MarkedImageColumnsContext.Provider
                    value={markedImageColumns ?? EMPTY_IMAGE_COLUMN_MARKS}
                >
                    {/* One preview dialog for the whole grid. Per-cell dialogs
                        meant a dialog tree mounted per rendered row, on every
                        scroll, for a modal only one cell can ever open. */}
                    <ImagePreviewHost>
                        <DndContext
                            sensors={dndSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleHeaderDragEnd}
                        >
                            <table className='result-table-tanstack'>
                                <DataTableHeader
                                    table={table}
                                    columnOrder={columnOrder}
                                    renderedColumnIndexes={renderedColumnIndexes}
                                    columnPaddingLeft={columnPaddingLeft}
                                    columnPaddingRight={columnPaddingRight}
                                    dataColumnById={dataColumnById}
                                    dataTypeByColumn={dataTypeByColumn}
                                    columnHintByColumn={columnHintByColumn}
                                    selectedColumnIndexSet={selectedColumnIndexSet}
                                    handleAutoFitColumn={handleAutoFitColumn}
                                    isDone={isDone}
                                    meta={meta}
                                    imageColumnTableKey={imageColumnTableKey}
                                    dataConnectionKey={dataConnectionKey}
                                    sorting={tableState.sorting}
                                    columnSizing={tableState.columnSizing}
                                    columnVisibility={tableState.columnVisibility}
                                />
                                <tbody>
                                    {paddingTop > 0 && (
                                        <tr aria-hidden>
                                            <td
                                                colSpan={columnsLength + 1}
                                                className='rt-scroll-spacer'
                                                style={{
                                                    height: paddingTop,
                                                    backgroundPositionY: topSpacerStartsTinted
                                                        ? `-${rowHeight}px`
                                                        : undefined,
                                                }}
                                            />
                                        </tr>
                                    )}
                                    {virtualItems.map(virtualRow => {
                                        const arrayIdx = virtualRow.index - leadingPlaceholderRows;
                                        const row = tableRows[arrayIdx];

                                        if (!row) {
                                            const isEvictedSlot =
                                                virtualRow.index < leadingPlaceholderRows;
                                            return (
                                                <tr
                                                    key={virtualRow.index}
                                                    style={{ height: rowHeight }}
                                                >
                                                    <td
                                                        colSpan={columnsLength + 2}
                                                        className='rt-placeholder-cell'
                                                    >
                                                        {isEvictedSlot ? (
                                                            <span className='rt-loading-row'>
                                                                Earlier rows released from memory
                                                            </span>
                                                        ) : isFetchingMore ? (
                                                            <span className='rt-loading-row'>
                                                                <Spinner size={11} tone='primary' />
                                                                <span>Loading more rows...</span>
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        const displayRow = row.original;
                                        const isDeleted =
                                            displayRow.kind === 'persisted' &&
                                            Boolean(deletedRowKeys?.[displayRow.key]);
                                        const hasStickyIndexSelection =
                                            rowKeysWithSelectedCell.has(displayRow.key) ||
                                            Boolean(selectedRowKeys[displayRow.key]);

                                        return (
                                            <DataTableRow
                                                key={displayRow.key}
                                                row={row}
                                                virtualIndex={toAbsoluteRowIndex(virtualRow.index)}
                                                renderedColumnIndexes={renderedColumnIndexes}
                                                columnPaddingLeft={columnPaddingLeft}
                                                columnPaddingRight={columnPaddingRight}
                                                meta={meta}
                                                editingCell={editingCell}
                                                editValue={editValue}
                                                isDeleted={isDeleted}
                                                isDraft={displayRow.kind === 'draft'}
                                                hasStickyIndexSelection={hasStickyIndexSelection}
                                                columnSizing={tableState.columnSizing}
                                                columnVisibility={tableState.columnVisibility}
                                                columnOrder={tableState.columnOrder}
                                            />
                                        );
                                    })}
                                    {paddingBottom > 0 && (
                                        <tr aria-hidden>
                                            <td
                                                colSpan={columnsLength + 1}
                                                className='rt-scroll-spacer'
                                                style={{
                                                    height: paddingBottom,
                                                    // Keep the skeleton's zebra in phase with the real
                                                    // rows: shift a row when the first row the spacer
                                                    // stands in for is an odd (tinted) one.
                                                    backgroundPositionY: bottomSpacerStartsTinted
                                                        ? `-${rowHeight}px`
                                                        : undefined,
                                                }}
                                            />
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </DndContext>
                    </ImagePreviewHost>
                </MarkedImageColumnsContext.Provider>
            </div>
        );
    },
);

DataTableGrid.displayName = 'DataTableGrid';
