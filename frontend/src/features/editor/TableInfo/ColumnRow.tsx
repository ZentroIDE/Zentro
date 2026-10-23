// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { models } from '../../../../wailsjs/go/models';
import { DataTypeCell } from './DataTypeCell';
import { RowState } from './types';
import { Switch, TableCell, TableRow, Textarea } from '../../../components/ui';
import { buildColumnHint } from '../../../components/data-table';

interface ColumnRowProps {
    row: RowState;
    rowIdx: number;
    displayIdx: number;
    types: string[];
    editCell: { rowIdx: number; field: 'Name' | 'DefaultValue' } | null;
    setEditCell: React.Dispatch<
        React.SetStateAction<{
            rowIdx: number;
            field: 'Name' | 'DefaultValue';
        } | null>
    >;
    onUpdate: (rowIdx: number, patch: Partial<models.ColumnDef>) => void;
    onDiscard: (rowIdx: number) => void;
    rowError: string | undefined;
    isSelected: boolean;
    onRowMouseDown: (e: React.MouseEvent, idx: number) => void;
    onRowMouseEnter: (idx: number) => void;
    readOnlyMode?: boolean;
}

interface InlineTextareaCellProps {
    value: string;
    className?: string;
    onCommit: (value: string) => void;
    onClose: () => void;
}

const INLINE_TEXTAREA_MIN_HEIGHT = 88;
const INLINE_TEXTAREA_MAX_HEIGHT = 240;
const INLINE_TEXTAREA_MIN_WIDTH = 320;
const INLINE_TEXTAREA_CELL_OFFSET = 6;

const InlineTextareaCell: React.FC<InlineTextareaCellProps> = ({
    value,
    className,
    onCommit,
    onClose,
}) => {
    const [draft, setDraft] = React.useState(value);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const cancelRef = React.useRef(false);
    const [overlayHeight, setOverlayHeight] = React.useState(INLINE_TEXTAREA_MIN_HEIGHT);

    const syncOverlayLayout = React.useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = '0px';
        const nextHeight = Math.min(
            INLINE_TEXTAREA_MAX_HEIGHT,
            Math.max(INLINE_TEXTAREA_MIN_HEIGHT, textarea.scrollHeight),
        );
        textarea.style.height = `${nextHeight}px`;
        setOverlayHeight(nextHeight);
    }, []);

    React.useEffect(() => {
        setDraft(value);
        cancelRef.current = false;
    }, [value]);

    React.useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.select();
        syncOverlayLayout();
    }, [syncOverlayLayout]);

    React.useLayoutEffect(() => {
        syncOverlayLayout();
    }, [draft, syncOverlayLayout]);

    const handleBlur = React.useCallback(() => {
        if (cancelRef.current) {
            cancelRef.current = false;
            return;
        }
        onCommit(draft);
        onClose();
    }, [draft, onClose, onCommit]);

    const handleKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Escape') {
                cancelRef.current = true;
                setDraft(value);
                onClose();
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
            }
        },
        [onClose, value],
    );

    return (
        <div className='relative overflow-visible'>
            <div className='rt-cell-content rt-cell-content--compact opacity-0 pointer-events-none'>
                {value || ' '}
            </div>
            <Textarea
                ref={textareaRef}
                value={draft}
                style={{
                    position: 'absolute',
                    top: -INLINE_TEXTAREA_CELL_OFFSET,
                    left: 0,
                    width: `max(100%, ${INLINE_TEXTAREA_MIN_WIDTH}px)`,
                    minHeight: INLINE_TEXTAREA_MIN_HEIGHT,
                    height: overlayHeight,
                    zIndex: 40,
                }}
                className={`${className} border-primary bg-background/98 backdrop-blur-sm`}
                onChange={e => setDraft(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                rows={1}
            />
        </div>
    );
};

export const ColumnRow: React.FC<ColumnRowProps> = ({
    row,
    rowIdx,
    displayIdx,
    types,
    editCell,
    setEditCell,
    onUpdate,
    onDiscard,
    rowError,
    isSelected,
    onRowMouseDown,
    onRowMouseEnter,
    readOnlyMode = false,
}) => {
    const col = row.current;
    const isDeleted = row.deleted;
    const isNew = row.isNew;
    const isDirty =
        !isDeleted && !isNew && JSON.stringify(row.original) !== JSON.stringify(row.current);

    const rowClassName = `
        group relative transition-all duration-150
        ${displayIdx % 2 !== 0 ? 'rt-row-alt' : ''}
        ${isSelected ? 'rt-row-selected' : ''}
        ${isDeleted ? 'rt-row-deleted' : ''}
    `;

    return (
        <React.Fragment>
            <TableRow
                onMouseDown={e => onRowMouseDown(e, rowIdx)}
                onMouseEnter={() => onRowMouseEnter(rowIdx)}
                className={`${rowClassName} border-b-0 hover:bg-transparent`}
            >
                {/* Index / Selector */}
                <TableCell className='w-10 text-center border-b border-border'>
                    <div
                        className='rt-cell-content rt-cell-content--compact row-num-col'
                        onDoubleClick={() => (isDirty || isDeleted) && onDiscard(rowIdx)}
                        title={isDirty || isDeleted ? 'Double-click to discard changes' : undefined}
                    >
                        {displayIdx + 1}
                    </div>
                </TableCell>

                {/* Name */}
                <TableCell className='relative overflow-visible p-0 border-b border-border'>
                    {editCell?.rowIdx === rowIdx && editCell.field === 'Name' ? (
                        <InlineTextareaCell
                            value={col.Name}
                            className='rt-cell-input resize-none overflow-y-auto rounded-md px-3 py-2 leading-[1.45] font-mono shadow-lg'
                            onCommit={nextValue => onUpdate(rowIdx, { Name: nextValue })}
                            onClose={() => setEditCell(null)}
                        />
                    ) : (
                        <div
                            className={`rt-cell-content rt-cell-content--compact  ${isDirty && col.Name !== row.original.Name ? 'rt-cell-dirty' : ''}`}
                            onDoubleClick={() =>
                                !isDeleted &&
                                !readOnlyMode &&
                                setEditCell({ rowIdx, field: 'Name' })
                            }
                            title={col.Name}
                        >
                            {col.Name}
                        </div>
                    )}
                </TableCell>

                {/* DataType */}
                <TableCell className='relative overflow-visible p-0 border-b border-border'>
                    <DataTypeCell
                        value={col.DataType}
                        hint={buildColumnHint({
                            fullDataType: col.FullDataType,
                            dataType: col.DataType,
                            isNullable: col.IsNullable,
                            description: col.Description,
                        })}
                        types={types}
                        isDirty={col.DataType !== row.original.DataType}
                        disabled={isDeleted || readOnlyMode}
                        onCommit={v => onUpdate(rowIdx, { DataType: v })}
                    />
                </TableCell>

                {/* PK */}
                <TableCell className='w-12 text-center border-b border-border'>
                    <div className='rt-cell-content rt-cell-content--compact justify-center'>
                        <Switch
                            checked={col.IsPrimaryKey}
                            disabled={isDeleted || readOnlyMode}
                            onCheckedChange={checked => onUpdate(rowIdx, { IsPrimaryKey: checked })}
                            className='scale-75 origin-center'
                        />
                    </div>
                </TableCell>

                {/* Nullable */}
                <TableCell className='w-16 text-center border-b border-border'>
                    <div className='rt-cell-content rt-cell-content--compact justify-center'>
                        <Switch
                            checked={col.IsNullable}
                            disabled={isDeleted || readOnlyMode}
                            onCheckedChange={checked => onUpdate(rowIdx, { IsNullable: checked })}
                            className='scale-75 origin-center'
                        />
                    </div>
                </TableCell>

                {/* Default */}
                <TableCell className='p-0 border-b border-border'>
                    {isDeleted ? (
                        <div className='rt-cell-content rt-cell-content--compact  opacity-40 italic'>
                            {col.DefaultValue || 'NULL'}
                        </div>
                    ) : editCell?.rowIdx === rowIdx && editCell.field === 'DefaultValue' ? (
                        <InlineTextareaCell
                            value={col.DefaultValue}
                            className='rt-cell-input resize-none overflow-y-auto rounded-md px-3 py-2 leading-[1.45] text-label shadow-lg'
                            onCommit={nextValue => onUpdate(rowIdx, { DefaultValue: nextValue })}
                            onClose={() => setEditCell(null)}
                        />
                    ) : (
                        <div
                            className={`rt-cell-content rt-cell-content--compact  ${isDirty && col.DefaultValue !== row.original.DefaultValue ? 'rt-cell-dirty' : ''} ${col.DefaultValue ? 'text-muted-foreground' : 'text-muted-foreground'}`}
                            onDoubleClick={() =>
                                !readOnlyMode && setEditCell({ rowIdx, field: 'DefaultValue' })
                            }
                            title={col.DefaultValue || 'None'}
                        >
                            {col.DefaultValue || 'NULL'}
                        </div>
                    )}
                </TableCell>
            </TableRow>
            {rowError && (
                <TableRow className='hover:bg-transparent'>
                    <TableCell
                        colSpan={6}
                        className='px-10 py-1 bg-destructive/10 text-destructive text-label border-b border-border/20'
                    >
                        <span className=' mr-2 uppercase tracking-wider'>Error</span>
                        {rowError}
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    );
};
