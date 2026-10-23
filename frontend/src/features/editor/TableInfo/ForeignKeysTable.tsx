// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui';
import { ColumnPickerCell } from './ColumnPickerCell';
import { FKSelectCell } from './FKSelectCell';
import {
    type FKRowState,
    type FKDraft,
    type EditField,
    FK_RULE_OPTIONS,
    isFKDirty,
    toRefCacheKey,
    normalizeIdent,
    normalizeFKRule,
} from './fkUtils';

interface ForeignKeysTableProps {
    rows: FKRowState[];
    editCell: { rowId: string; field: EditField } | null;
    setEditCell: (cell: { rowId: string; field: EditField } | null) => void;
    selectedRows: Set<string>;
    handleRowMouseDown: (e: React.MouseEvent, rowId: string) => void;
    handleRowMouseEnter: (rowId: string) => void;
    updateRow: (rowId: string, patch: Partial<FKDraft>) => void;
    discardRow: (id: string) => void;
    loadRefColumns: (refSchema: string, refTable: string) => Promise<void>;
    tablesBySchema: Map<string, string[]>;
    refColumnCache: Record<string, string[]>;
    schemaOptions: string[];
    tableColumns: string[];
    readOnlyMode: boolean;
    saving: boolean;
}

export const ForeignKeysTable: React.FC<ForeignKeysTableProps> = ({
    rows,
    editCell,
    setEditCell,
    selectedRows,
    handleRowMouseDown,
    handleRowMouseEnter,
    updateRow,
    discardRow,
    loadRefColumns,
    tablesBySchema,
    refColumnCache,
    schemaOptions,
    tableColumns,
    readOnlyMode,
    saving,
}) => (
    <div className='flex-1 overflow-auto scrollbar-thin'>
        <Table
            className='result-table-tanstack border-collapse table-fixed select-none'
            style={{ width: '100%', minWidth: '840px' }}
        >
            <TableHeader className='[&_tr]:border-b-0'>
                <TableRow className='border-b-2 border-border hover:bg-transparent'>
                    <TableHead className='rt-th w-10  text-label text-muted-foreground'>
                        <div className='rt-th-label justify-center'>#</div>
                    </TableHead>
                    <TableHead className='rt-th' style={{ width: '180px' }}>
                        <div className='rt-th-label'>Name</div>
                    </TableHead>
                    <TableHead className='rt-th' style={{ width: '160px' }}>
                        <div className='rt-th-label'>Source Columns</div>
                    </TableHead>
                    <TableHead className='rt-th' style={{ width: '260px' }}>
                        <div className='rt-th-label'>References</div>
                    </TableHead>
                    <TableHead className='rt-th' style={{ width: '120px' }}>
                        <div className='rt-th-label'>On Delete</div>
                    </TableHead>
                    <TableHead className='rt-th' style={{ width: '120px' }}>
                        <div className='rt-th-label'>On Update</div>
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody className='divide-y divide-border/20 [&_tr:last-child]:border-b'>
                {rows.map((row, displayIdx) => {
                    const isDeleted = row.deleted;
                    const isNew = row.isNew;
                    const isDirty = isFKDirty(row);
                    const isSelected = selectedRows.has(row.id);

                    const isEditingName = editCell?.rowId === row.id && editCell.field === 'name';
                    const isEditingCols =
                        editCell?.rowId === row.id && editCell.field === 'columns';
                    const isEditingRefSchema =
                        editCell?.rowId === row.id && editCell.field === 'refSchema';
                    const isEditingRefTable =
                        editCell?.rowId === row.id && editCell.field === 'refTable';
                    const isEditingRefCols =
                        editCell?.rowId === row.id && editCell.field === 'refColumns';
                    const isEditingOnDelete =
                        editCell?.rowId === row.id && editCell.field === 'onDelete';
                    const isEditingOnUpdate =
                        editCell?.rowId === row.id && editCell.field === 'onUpdate';

                    const isEditingRef =
                        isEditingRefSchema || isEditingRefTable || isEditingRefCols;

                    const refTableOptions =
                        tablesBySchema.get(normalizeIdent(row.current.refSchema || '')) ?? [];
                    const refColumnOptions =
                        row.current.refSchema && row.current.refTable
                            ? (refColumnCache[
                                  toRefCacheKey(row.current.refSchema, row.current.refTable)
                              ] ?? [])
                            : [];

                    const rowCls = `
                        group relative transition-all duration-150
                        ${displayIdx % 2 !== 0 ? 'rt-row-alt' : ''}
                        ${isNew ? 'rt-row-draft' : ''}
                        ${isSelected ? 'rt-row-selected' : ''}
                        ${isDeleted ? 'rt-row-deleted' : ''}
                    `;

                    const hasRef = row.current.refSchema || row.current.refTable;

                    return (
                        <TableRow
                            key={row.id}
                            className={`${rowCls} border-b-0 hover:bg-transparent`}
                            onMouseDown={e => handleRowMouseDown(e, row.id)}
                            onMouseEnter={() => handleRowMouseEnter(row.id)}
                        >
                            {/* # */}
                            <TableCell className='w-10 text-center border-b border-border'>
                                <div
                                    className='rt-cell-content rt-cell-content--compact row-num-col'
                                    onDoubleClick={() =>
                                        (isDirty || isDeleted) && !isNew && discardRow(row.id)
                                    }
                                    title={
                                        (isDirty || isDeleted) && !isNew
                                            ? 'Double-click to discard changes'
                                            : undefined
                                    }
                                >
                                    {displayIdx + 1}
                                </div>
                            </TableCell>

                            {/* Name */}
                            <TableCell
                                className='p-0 border-b border-border'
                                style={{ width: '180px' }}
                            >
                                {isEditingName ? (
                                    <Input
                                        autoFocus
                                        onFocus={e => e.target.select()}
                                        placeholder='fk_constraint_name'
                                        className='rt-cell-input font-mono'
                                        value={row.current.name}
                                        onChange={e => updateRow(row.id, { name: e.target.value })}
                                        onBlur={() => setEditCell(null)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter')
                                                (e.target as HTMLInputElement).blur();
                                            if (e.key === 'Escape') setEditCell(null);
                                        }}
                                        disabled={saving}
                                    />
                                ) : (
                                    <div
                                        className={`rt-cell-content rt-cell-content--compact font-medium
                                            ${isDeleted ? 'opacity-40' : ''}
                                            ${!readOnlyMode && !isDeleted ? 'cursor-pointer' : ''}
                                        `}
                                        title={row.current.name || '(unnamed)'}
                                        onDoubleClick={() =>
                                            !readOnlyMode &&
                                            !isDeleted &&
                                            setEditCell({ rowId: row.id, field: 'name' })
                                        }
                                    >
                                        <span className='truncate  text-label'>
                                            {row.current.name || (
                                                <span className='italic text-muted-foreground/50'>
                                                    untitled
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}
                            </TableCell>

                            {/* Source Columns */}
                            <TableCell
                                className='p-0 border-b border-border'
                                style={{ width: '160px' }}
                            >
                                {isEditingCols ? (
                                    <div
                                        className='px-1.5 py-0.75'
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <ColumnPickerCell
                                            columns={tableColumns}
                                            selected={row.current.columns}
                                            onChange={cols => updateRow(row.id, { columns: cols })}
                                            onClose={() => setEditCell(null)}
                                            autoOpen
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={`rt-cell-content rt-cell-content--compact  text-label text-muted-foreground
                                            ${isDeleted ? 'opacity-40' : ''}
                                            ${!readOnlyMode && !isDeleted ? 'cursor-pointer' : ''}
                                        `}
                                        title={row.current.columns.join(', ')}
                                        onDoubleClick={() =>
                                            !readOnlyMode &&
                                            !isDeleted &&
                                            setEditCell({ rowId: row.id, field: 'columns' })
                                        }
                                    >
                                        {row.current.columns.length > 0 ? (
                                            row.current.columns.join(', ')
                                        ) : (
                                            <span className='italic text-muted-foreground/40'>
                                                select cols
                                            </span>
                                        )}
                                    </div>
                                )}
                            </TableCell>

                            {/* References (Ref Schema + Ref Table + Ref Columns merged) */}
                            <TableCell
                                className='p-0 border-b border-border'
                                style={{ width: '260px' }}
                            >
                                {isEditingRefSchema ? (
                                    <div
                                        className='px-1 py-0.5'
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <FKSelectCell
                                            value={row.current.refSchema || undefined}
                                            options={schemaOptions}
                                            placeholder='schema'
                                            disabled={saving}
                                            onValueChange={value => {
                                                updateRow(row.id, {
                                                    refSchema: value,
                                                    refTable: '',
                                                });
                                                setEditCell({ rowId: row.id, field: 'refTable' });
                                            }}
                                            onClose={() => setEditCell(null)}
                                        />
                                    </div>
                                ) : isEditingRefTable ? (
                                    <div
                                        className='px-1 py-0.5'
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <FKSelectCell
                                            value={row.current.refTable || undefined}
                                            options={refTableOptions}
                                            placeholder='table'
                                            disabled={saving}
                                            onValueChange={value => {
                                                updateRow(row.id, { refTable: value });
                                                void loadRefColumns(row.current.refSchema, value);
                                                setEditCell({ rowId: row.id, field: 'refColumns' });
                                            }}
                                            onClose={() => setEditCell(null)}
                                        />
                                    </div>
                                ) : isEditingRefCols ? (
                                    <div
                                        className='px-1.5 py-0.75'
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <ColumnPickerCell
                                            columns={refColumnOptions}
                                            selected={row.current.refColumns}
                                            onChange={cols =>
                                                updateRow(row.id, { refColumns: cols })
                                            }
                                            onClose={() => setEditCell(null)}
                                            autoOpen
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={`rt-cell-content rt-cell-content--compact  text-label
                                            ${isDeleted ? 'opacity-40' : ''}
                                            ${!readOnlyMode && !isDeleted && !isEditingRef ? 'cursor-pointer' : ''}
                                        `}
                                        onDoubleClick={() => {
                                            if (readOnlyMode || isDeleted) return;
                                            setEditCell({ rowId: row.id, field: 'refSchema' });
                                        }}
                                    >
                                        {hasRef ? (
                                            <>
                                                <span className='text-foreground'>
                                                    {row.current.refSchema}
                                                    {row.current.refSchema && row.current.refTable
                                                        ? '.'
                                                        : ''}
                                                    {row.current.refTable || (
                                                        <span className='italic text-muted-foreground/40'>
                                                            table
                                                        </span>
                                                    )}
                                                </span>
                                                {row.current.refColumns.length > 0 && (
                                                    <span className='text-muted-foreground'>
                                                        {' '}
                                                        ({row.current.refColumns.join(', ')})
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className='italic text-muted-foreground/40'>
                                                select target…
                                            </span>
                                        )}
                                    </div>
                                )}
                            </TableCell>

                            {/* On Delete */}
                            <TableCell
                                className='p-0 border-b border-border'
                                style={{ width: '120px' }}
                            >
                                {isEditingOnDelete ? (
                                    <div
                                        className='px-1 py-0.5'
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <FKSelectCell
                                            value={row.current.onDelete}
                                            options={FK_RULE_OPTIONS}
                                            disabled={saving}
                                            onValueChange={value => {
                                                updateRow(row.id, {
                                                    onDelete: normalizeFKRule(value),
                                                });
                                                setEditCell({ rowId: row.id, field: 'onUpdate' });
                                            }}
                                            onClose={() => setEditCell(null)}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={`rt-cell-content rt-cell-content--compact  text-label
                                            ${isDeleted ? 'opacity-40' : ''}
                                            ${!readOnlyMode && !isDeleted ? 'cursor-pointer' : ''}
                                        `}
                                        onDoubleClick={() => {
                                            if (readOnlyMode || isDeleted) return;
                                            setEditCell({ rowId: row.id, field: 'onDelete' });
                                        }}
                                    >
                                        <span
                                            className={
                                                row.current.onDelete !== 'NO ACTION'
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground/60'
                                            }
                                        >
                                            {row.current.onDelete}
                                        </span>
                                    </div>
                                )}
                            </TableCell>

                            {/* On Update */}
                            <TableCell
                                className='p-0 border-b border-border'
                                style={{ width: '120px' }}
                            >
                                {isEditingOnUpdate ? (
                                    <div
                                        className='px-1 py-0.5'
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <FKSelectCell
                                            value={row.current.onUpdate}
                                            options={FK_RULE_OPTIONS}
                                            disabled={saving}
                                            onValueChange={value =>
                                                updateRow(row.id, {
                                                    onUpdate: normalizeFKRule(value),
                                                })
                                            }
                                            onClose={() => setEditCell(null)}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={`rt-cell-content rt-cell-content--compact  text-label
                                            ${isDeleted ? 'opacity-40' : ''}
                                            ${!readOnlyMode && !isDeleted ? 'cursor-pointer' : ''}
                                        `}
                                        onDoubleClick={() => {
                                            if (readOnlyMode || isDeleted) return;
                                            setEditCell({ rowId: row.id, field: 'onUpdate' });
                                        }}
                                    >
                                        <span
                                            className={
                                                row.current.onUpdate !== 'NO ACTION'
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground/60'
                                            }
                                        >
                                            {row.current.onUpdate}
                                        </span>
                                    </div>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })}

                {rows.length === 0 && (
                    <TableRow className='hover:bg-transparent'>
                        <TableCell
                            colSpan={6}
                            className='py-24 text-center text-muted-foreground italic bg-background/50 text-body'
                        >
                            {readOnlyMode
                                ? 'No foreign keys defined for this table.'
                                : 'No foreign keys yet. Click "Add FK" to create one.'}
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    </div>
);
