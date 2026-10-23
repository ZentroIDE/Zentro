// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { flexRender, type Row } from '@tanstack/react-table';

import { DisplayRow } from '../../lib/dataEditing';

import { DataTableMeta } from './types';

interface DataTableRowProps {
    row: Row<DisplayRow>;
    /** Virtual index, used for zebra striping so the stripe follows the
     *  absolute row position rather than the position within the window. */
    virtualIndex: number;
    renderedColumnIndexes: number[];
    columnPaddingLeft: number;
    columnPaddingRight: number;
    meta?: DataTableMeta;
    /** Memo invalidation only — cells read the live value off `meta` itself,
     *  but `meta` isn't a prop; without these the row misses keystrokes typed
     *  into a cell it owns and only catches up on the next tracked-prop change
     *  (e.g. blur updating selection/edited cells). */
    editingCell: string | null;
    editValue: string;
    isDeleted: boolean;
    isDraft: boolean;
    hasStickyIndexSelection: boolean;
    /** Memo invalidation only — cells read sizes, order and visibility off the
     *  table instance, so a change there has to invalidate the row. */
    columnSizing: unknown;
    columnVisibility: unknown;
    columnOrder: unknown;
}

/**
 * One body row.
 *
 * Memoized, and that memo is what makes scrolling cheap: the virtualizer swaps
 * a couple of rows in and out per frame, but every other visible row keeps
 * identical props and skips rendering entirely. Everything a cell reads through
 * `table.options.meta` is therefore also declared as a prop — otherwise a
 * selection or edit could change without the row noticing.
 */
export const DataTableRow: React.FC<DataTableRowProps> = React.memo(
    ({
        row,
        virtualIndex,
        renderedColumnIndexes,
        columnPaddingLeft,
        columnPaddingRight,
        meta,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- memo invalidation only, see prop doc
        editingCell,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- memo invalidation only, see prop doc
        editValue,
        isDeleted,
        isDraft,
        hasStickyIndexSelection,
    }) => {
        const visibleCells = row.getVisibleCells();
        const fixedCell = visibleCells[0];
        const dynamicCells = visibleCells.slice(1);
        const displayRow = row.original;
        const altClass = virtualIndex % 2 === 0 ? '' : 'rt-row-alt';

        return (
            <tr
                data-rt-row
                data-row-key={displayRow.key}
                className={`${altClass} ${isDraft ? 'rt-row-draft' : ''} ${isDeleted ? 'rt-row-deleted' : ''} ${hasStickyIndexSelection ? 'rt-row-selected' : ''}`}
            >
                {fixedCell && (
                    <td
                        key={fixedCell.id}
                        style={{
                            width: fixedCell.column.getSize(),
                            minWidth: fixedCell.column.getSize(),
                            maxWidth: fixedCell.column.getSize(),
                        }}
                        className={`rt-index-sticky ${hasStickyIndexSelection ? 'rt-index-sticky-row-selected' : ''} cursor-pointer select-none`}
                        onMouseDown={e => meta?.handleRowHeaderMouseDown?.(e, displayRow.key)}
                        onMouseEnter={e => meta?.handleRowHeaderMouseEnter?.(e, displayRow.key)}
                        onContextMenu={e => meta?.handleRowHeaderContextMenu?.(e, displayRow.key)}
                    >
                        {flexRender(fixedCell.column.columnDef.cell, fixedCell.getContext())}
                    </td>
                )}
                {columnPaddingLeft > 0 && (
                    <td
                        aria-hidden
                        style={{
                            width: columnPaddingLeft,
                            minWidth: columnPaddingLeft,
                            maxWidth: columnPaddingLeft,
                        }}
                    />
                )}
                {renderedColumnIndexes.map(columnIndex => {
                    const cell = dynamicCells[columnIndex];
                    if (!cell) return null;
                    return (
                        <td
                            key={cell.id}
                            style={{
                                width: cell.column.getSize(),
                                minWidth: cell.column.getSize(),
                                maxWidth: cell.column.getSize(),
                            }}
                        >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                    );
                })}
                {columnPaddingRight > 0 && (
                    <td
                        aria-hidden
                        style={{
                            width: columnPaddingRight,
                            minWidth: columnPaddingRight,
                            maxWidth: columnPaddingRight,
                        }}
                    />
                )}
            </tr>
        );
    },
);

DataTableRow.displayName = 'DataTableRow';
