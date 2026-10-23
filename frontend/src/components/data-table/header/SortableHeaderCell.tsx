// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Header } from '@tanstack/react-table';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { DisplayRow } from '../../../lib/dataEditing';

interface SortableHeaderCellProps {
    header: Header<DisplayRow, unknown>;
    className: string;
    title?: string;
    onSortToggle?: React.MouseEventHandler<HTMLTableHeaderCellElement>;
    onAutoFit?: () => void;
    onMouseDown?: React.MouseEventHandler<HTMLTableHeaderCellElement>;
    onMouseEnter?: React.MouseEventHandler<HTMLTableHeaderCellElement>;
    children:
        | React.ReactNode
        | ((dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode);
}

export const SortableHeaderCell: React.FC<SortableHeaderCellProps> = React.memo(
    ({
        header,
        className,
        title,
        onSortToggle,
        onAutoFit,
        onMouseDown,
        onMouseEnter,
        children,
    }) => {
        const sortable = useSortable({ id: header.column.id });
        const style: React.CSSProperties = {
            width: header.getSize(),
            minWidth: header.getSize(),
            maxWidth: header.getSize(),
            transform: CSS.Transform.toString(sortable.transform),
            transition: sortable.transition,
            zIndex: sortable.isDragging ? 30 : 20,
        };

        const rawDragHandleProps = {
            ...sortable.attributes,
            ...sortable.listeners,
        } as React.HTMLAttributes<HTMLElement>;
        const dragHandleProps = {
            ...rawDragHandleProps,
            onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                rawDragHandleProps.onMouseDown?.(event);
            },
            onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                rawDragHandleProps.onPointerDown?.(event);
            },
        } as React.HTMLAttributes<HTMLElement>;

        return (
            <th
                ref={sortable.setNodeRef}
                style={style}
                className={className}
                onClick={onSortToggle}
                onMouseDown={onMouseDown}
                onMouseEnter={onMouseEnter}
                title={title}
            >
                {typeof children === 'function' ? children(dragHandleProps) : children}
                <div
                    className='rt-col-resizer'
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => {
                        event.stopPropagation();
                        event.preventDefault();
                        onAutoFit?.();
                    }}
                />
            </th>
        );
    },
);
