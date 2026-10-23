// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    BlobPreviewButton,
    BlobViewer,
    detectImageType,
    isBlobValue,
} from '../../viewers/BlobViewer';
import { BLURRED_PLACEHOLDER } from '../../../lib/blurredColumns';
import { isTimezoneAwareType } from '../../../lib/sqlLiteral';
import { splitTemporalDisplay } from './cellDisplay';
import { useIsMarkedImageColumn } from './imageColumnMarks';
import { DataTableMeta, RowKey } from '../types';

interface DataTableCellProps {
    stringValue: string;
    dataType?: string;
    displayValue: string;
    /** Pre-rendered plugin cell renderer output, if any — always wins over the
     *  built-in image/blob/text branching, matching the prior inline priority. */
    extensionNode: React.ReactNode | null;
    columnKey: string;
    isSelected: boolean;
    /** Whether this is the single most-recently-selected cell in the current
     *  selection — the only cell that keeps a visible border (rt-cell-active).
     *  The rest of the selected range only gets the tinted background. */
    isActive: boolean;
    isDirty: boolean;
    isDeleted: boolean;
    isBlurred: boolean;
    isNull: boolean;
    /** Interaction handlers are built here (not passed in as props) so their
     *  identity stays stable across renders — `meta` is the only thing that
     *  actually varies, and it's already a referentially-stable object. Taking
     *  4 fresh closures as props instead would defeat this component's memo on
     *  every single render. */
    meta: DataTableMeta | undefined;
    rowKey: RowKey;
    colIdx: number;
}

/** Renders a single data-grid cell. Split out of useDataTableColumns' `cell`
 *  closure (a plain TanStack callback, not a React component) specifically so
 *  the "marked as image column" override can react to changes — a store change
 *  elsewhere can't re-run a bare closure, only a mounted component re-renders.
 *  The marks arrive through context, which the grid subscribes to once for the
 *  whole table rather than once per cell. */
export const DataTableCell: React.FC<DataTableCellProps> = React.memo(
    ({
        stringValue,
        dataType,
        displayValue,
        extensionNode,
        columnKey,
        isSelected,
        isActive,
        isDirty,
        isDeleted,
        isBlurred,
        isNull,
        meta,
        rowKey,
        colIdx,
    }) => {
        const markedAsImage = useIsMarkedImageColumn(columnKey);
        const isImageCell = markedAsImage || detectImageType(stringValue, dataType);

        const onMouseDown = React.useCallback(
            (event: React.MouseEvent<HTMLDivElement>) =>
                meta?.handleCellMouseDown?.(event, rowKey, colIdx),
            [meta, rowKey, colIdx],
        );
        const onMouseEnter = React.useCallback(
            (event: React.MouseEvent<HTMLDivElement>) =>
                meta?.handleCellMouseEnter?.(event, rowKey, colIdx),
            [meta, rowKey, colIdx],
        );
        const onDoubleClick = React.useCallback(
            () => meta?.handleCellDoubleClick?.(rowKey, colIdx, displayValue),
            [meta, rowKey, colIdx, displayValue],
        );
        const onContextMenu = React.useCallback(
            (event: React.MouseEvent<HTMLDivElement>) =>
                meta?.handleCellContextMenu?.(event, rowKey, colIdx),
            [meta, rowKey, colIdx],
        );

        let cellContent: React.ReactNode;
        if (extensionNode) {
            cellContent = extensionNode;
        } else if (isImageCell) {
            cellContent = (
                <>
                    <span className='truncate flex-1 min-w-0'>{displayValue}</span>
                    <BlobPreviewButton
                        value={stringValue}
                        columnType={dataType}
                        markedAsImage={markedAsImage}
                    />
                </>
            );
        } else if (isBlobValue(stringValue, dataType, true)) {
            cellContent = <BlobViewer value={stringValue} columnType={dataType} />;
        } else if (isTimezoneAwareType(dataType)) {
            const { main, tz } = splitTemporalDisplay(displayValue);
            cellContent = tz ? (
                <>
                    {main}
                    <span className='rt-cell-tz'> {tz}</span>
                </>
            ) : (
                displayValue
            );
        } else {
            cellContent = displayValue;
        }

        return (
            <div
                className={[
                    'rt-cell-content rt-cell-content--compact',
                    isImageCell ? 'group' : '',
                    isSelected ? 'rt-cell-selected-range' : '',
                    isActive ? 'rt-cell-active' : '',
                    isDirty ? 'rt-cell-dirty' : '',
                    isDeleted ? 'rt-cell-deleted' : '',
                    isBlurred ? 'rt-cell-blurred' : '',
                    isNull ? 'rt-cell-null' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                onMouseDown={onMouseDown}
                onMouseEnter={onMouseEnter}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
                title={isBlurred ? BLURRED_PLACEHOLDER : displayValue}
            >
                {cellContent}
            </div>
        );
    },
);

DataTableCell.displayName = 'DataTableCell';
