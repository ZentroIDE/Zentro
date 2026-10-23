// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlertCircle, FilePlus, Trash2 } from 'lucide-react';
import type { models } from '../../../wailsjs/go/models';
import { Button, Input } from '../../components/ui';
import { cn } from '../../lib/cn';
import { ROW_H } from './templatePopoverPosition';

type Template = models.Template;
export type EditableField = 'name' | 'trigger' | 'content';
export type EditingCell = { id: string; field: EditableField } | null;

interface TemplatesTableProps {
    rows: Template[];
    selectedIds: Set<string>;
    editingCell: EditingCell;
    canAppendToEditor: boolean;
    onToggleSelect: (id: string, multi: boolean) => void;
    onBeginEdit: (id: string, field: EditableField) => void;
    onDraftUpdate: (id: string, field: EditableField, value: string) => void;
    onInlineBlur: (id: string, field: EditableField, value: string) => void;
    onInlineKeyDown: (
        event: React.KeyboardEvent<HTMLInputElement>,
        id: string,
        field: EditableField,
    ) => void;
    onAppend: (template: Template) => void;
    onRequestDelete: (ids: string[]) => void;
}

function stopActionEvent(
    event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>,
) {
    event.preventDefault();
    event.stopPropagation();
}

interface EditableCellProps {
    row: Template;
    field: EditableField;
    editingCell: EditingCell;
    cellStyle?: React.CSSProperties;
    onBeginEdit: TemplatesTableProps['onBeginEdit'];
    onDraftUpdate: TemplatesTableProps['onDraftUpdate'];
    onInlineBlur: TemplatesTableProps['onInlineBlur'];
    onInlineKeyDown: TemplatesTableProps['onInlineKeyDown'];
}

const EditableCell: React.FC<EditableCellProps> = ({
    row,
    field,
    editingCell,
    cellStyle,
    onBeginEdit,
    onDraftUpdate,
    onInlineBlur,
    onInlineKeyDown,
}) => {
    const value = String(row[field] || '');
    const isEditing = editingCell?.id === row.id && editingCell.field === field;

    if (isEditing) {
        return (
            <Input
                data-name-id={field === 'name' ? row.id : undefined}
                type='text'
                value={value}
                autoFocus
                className='rounded-none border-ring bg-background px-1.5 py-0 text-[11px] leading-none focus-visible:border-primary'
                style={{ height: '100%', ...cellStyle }}
                onChange={event => onDraftUpdate(row.id, field, event.target.value)}
                onBlur={event => {
                    onInlineBlur(row.id, field, event.target.value);
                }}
                onKeyDown={event => onInlineKeyDown(event, row.id, field)}
                onClick={event => event.stopPropagation()}
            />
        );
    }

    return (
        <div
            className='rt-cell-content rt-cell-content--compact'
            title={value || undefined}
            style={cellStyle}
            onDoubleClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onBeginEdit(row.id, field);
            }}
        >
            {value || ' '}
        </div>
    );
};

export const TemplatesTable: React.FC<TemplatesTableProps> = ({
    rows,
    selectedIds,
    editingCell,
    canAppendToEditor,
    onToggleSelect,
    onBeginEdit,
    onDraftUpdate,
    onInlineBlur,
    onInlineKeyDown,
    onAppend,
    onRequestDelete,
}) => {
    if (rows.length === 0) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-2 text-muted-foreground'>
                <AlertCircle size={28} strokeWidth={1.4} className='opacity-60' />
                <span className='text-small'>No templates found.</span>
            </div>
        );
    }

    return (
        <table className='result-table-tanstack' style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead>
                <tr>
                    <th className='rt-th rt-index-sticky' style={{ width: 40 }}>
                        <span className='rt-th-label' style={{ justifyContent: 'center' }}>
                            #
                        </span>
                    </th>
                    <th className='rt-th' style={{ width: '26%' }}>
                        <span className='rt-th-label'>Name</span>
                    </th>
                    <th className='rt-th' style={{ width: '18%' }}>
                        <span className='rt-th-label'>Shortcut</span>
                    </th>
                    <th className='rt-th'>
                        <span className='rt-th-label'>SQL Content</span>
                    </th>
                    <th className='rt-th' style={{ width: 84, borderRight: 'none' }}>
                        <span className='sr-only'>Actions</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr
                        key={row.id}
                        className={cn(
                            'cursor-pointer',
                            index % 2 !== 0 && 'rt-row-alt',
                            selectedIds.has(row.id) && 'rt-row-selected',
                        )}
                        onClick={event => {
                            const target = event.target as HTMLElement;
                            if (target.closest('input, button')) return;
                            onToggleSelect(
                                row.id,
                                Boolean(event.ctrlKey || event.metaKey || event.shiftKey),
                            );
                        }}
                    >
                        <td
                            className={cn(
                                'rt-index-sticky',
                                selectedIds.has(row.id) && 'rt-index-sticky-row-selected',
                            )}
                            style={{ width: 40, height: ROW_H }}
                        >
                            <div className='rt-cell-content rt-cell-content--compact row-num-col'>
                                {index + 1}
                            </div>
                        </td>
                        <td style={{ height: ROW_H }}>
                            <EditableCell
                                row={row}
                                field='name'
                                editingCell={editingCell}
                                onBeginEdit={onBeginEdit}
                                onDraftUpdate={onDraftUpdate}
                                onInlineBlur={onInlineBlur}
                                onInlineKeyDown={onInlineKeyDown}
                            />
                        </td>
                        <td style={{ height: ROW_H }}>
                            <EditableCell
                                row={row}
                                field='trigger'
                                editingCell={editingCell}
                                cellStyle={{ color: 'var(--status-warning)' }}
                                onBeginEdit={onBeginEdit}
                                onDraftUpdate={onDraftUpdate}
                                onInlineBlur={onInlineBlur}
                                onInlineKeyDown={onInlineKeyDown}
                            />
                        </td>
                        <td style={{ height: ROW_H }}>
                            <EditableCell
                                row={row}
                                field='content'
                                editingCell={editingCell}
                                onBeginEdit={onBeginEdit}
                                onDraftUpdate={onDraftUpdate}
                                onInlineBlur={onInlineBlur}
                                onInlineKeyDown={onInlineKeyDown}
                            />
                        </td>
                        <td
                            style={{
                                height: ROW_H,
                                borderRight: 'none',
                                paddingRight: 4,
                            }}
                        >
                            <div className='flex items-center justify-end gap-1'>
                                <Button
                                    variant='ghost'
                                    size='icon'
                                    title='Append to current editor'
                                    disabled={!canAppendToEditor || !row.content?.trim()}
                                    onMouseDown={stopActionEvent}
                                    onPointerDown={stopActionEvent}
                                    onClick={event => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onAppend(row);
                                    }}
                                >
                                    <FilePlus size={14} />
                                </Button>
                                <Button
                                    variant='ghost'
                                    size='icon'
                                    title='Delete template'
                                    style={{
                                        color: 'color-mix(in srgb, var(--status-destructive) 80%, transparent)',
                                    }}
                                    className='ui-interactive-ghost-destructive'
                                    onMouseDown={stopActionEvent}
                                    onPointerDown={stopActionEvent}
                                    onClick={event => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onRequestDelete([row.id]);
                                    }}
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
