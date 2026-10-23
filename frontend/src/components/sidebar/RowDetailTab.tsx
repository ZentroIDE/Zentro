// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, FileJson, CheckSquare, Braces, RefreshCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useRowDetailStore } from '../../stores/rowDetailStore';
import { useToast } from '../layout/Toast';
import { JsonViewer } from '../viewers/JsonViewer';
import { BlobPreviewButton, BlobViewer, detectImageType, isBlobValue } from '../viewers/BlobViewer';
import { ImagePreviewHost } from '../viewers/ImagePreviewHost';
import { setClipboardText } from '../../services/clipboardService';
import { BLURRED_COPY_MESSAGE, BLURRED_PLACEHOLDER } from '../../lib/blurredColumns';
import { Button, Checkbox, Input, Label, Textarea } from '../ui';
import { useCellEditor } from '../../hooks/useCellEditor';
import {
    splitDatetimeEditableValue,
    mergeDatetimeEditableValue,
    DataTypeIcon,
    buildColumnHint,
    normalizeDataTypeLabel,
} from '../data-table';
import { useSidebarPanelState } from '../../stores/sidebarUiStore';
import { ROW_DETAIL_PANEL_STATE_DEFAULT } from './sidebarPanelStateDefaults';
import { interactiveBadge, interactiveIconAction, interactiveSelected } from '../ui/contract';

interface RowDetailFieldState {
    isNull: boolean;
    isVisualNull: boolean;
    displayValue: string;
}

const NULL_PLACEHOLDER = '[NULL]';

const getRowDetailFieldState = (rawValue: string | null | undefined): RowDetailFieldState => {
    const isNull = rawValue === null || rawValue === undefined;
    const isVisualNull = isNull || rawValue === '';
    const displayValue = isVisualNull ? NULL_PLACEHOLDER : String(rawValue);

    return {
        isNull,
        isVisualNull,
        displayValue,
    };
};

export const RowDetailTab: React.FC = () => {
    const { detail } = useRowDetailStore();
    const { toast } = useToast();

    const [rowDetailPanelState, setRowDetailPanelState] = useSidebarPanelState(
        'secondary',
        'detail',
        ROW_DETAIL_PANEL_STATE_DEFAULT,
    );
    const viewMode = rowDetailPanelState.viewMode;
    const isSelectMode = rowDetailPanelState.isSelectMode;
    const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
    const [fieldFilter, setFieldFilter] = useState('');
    // Snapshot of the row values when the row was first selected.
    // Updated synchronously during render (ref pattern) so there's no intermediate frame
    // where originalRow is stale and causes false-positive dirty indicators on row switch.
    const prevRowKeyRef = useRef<string | null | undefined>(undefined);
    const originalRowRef = useRef<Array<string | null> | null>(null);

    const updateRowDetailPanelState = useCallback(
        (next: Partial<typeof rowDetailPanelState>) => {
            setRowDetailPanelState(current => ({
                ...current,
                ...next,
            }));
        },
        [setRowDetailPanelState],
    );

    // Stable identity: only changes when PK values or column structure change, not when a cell is saved.
    const rowIdentityKey = useMemo(() => {
        if (!detail) return null;
        const pkCols = detail.primaryKeys;
        const colKey = detail.columns.join(',');
        if (!pkCols || pkCols.length === 0) {
            return `${colKey}::${detail.row.join('|')}`;
        }
        const pkValues = pkCols
            .map(pk => {
                const idx = detail.columns.indexOf(pk);
                return `${pk}=${String(detail.row[idx] ?? '')}`;
            })
            .join(',');
        return `${colKey}::${pkValues}`;
    }, [detail?.columns, detail?.primaryKeys, detail?.row]);

    // Synchronously snapshot baseline during render so isModified is correct in the same frame.
    if (prevRowKeyRef.current !== rowIdentityKey) {
        prevRowKeyRef.current = rowIdentityKey;
        originalRowRef.current = detail ? detail.row.map(value => value ?? null) : null;
    }

    // Reset selection when a different row is selected.
    React.useEffect(() => {
        setSelectedFields(new Set());
    }, [rowIdentityKey]);

    const blurredColumnIndexes = detail?.blurredColumnIndexes;

    // Feeds the JSON view, so blurred columns are masked here rather than blurred by CSS.
    const getJsonData = useCallback(() => {
        if (!detail) return {};
        const obj: Record<string, unknown> = {};
        const hasSelection = isSelectMode && selectedFields.size > 0;

        detail.columns.forEach((col, idx) => {
            if (!hasSelection || selectedFields.has(col)) {
                if (blurredColumnIndexes?.has(idx)) {
                    obj[col] = BLURRED_PLACEHOLDER;
                    return;
                }
                let val = detail.row[idx];
                if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                    try {
                        val = JSON.parse(val);
                    } catch {
                        // ignore parse error
                    }
                }
                obj[col] = val ?? null;
            }
        });
        return obj;
    }, [blurredColumnIndexes, detail, isSelectMode, selectedFields]);

    const handleCopyJson = useCallback(() => {
        if (!detail) return;
        const hasSelection = isSelectMode && selectedFields.size > 0;
        const copiesBlurredField = detail.columns.some(
            (col, idx) =>
                blurredColumnIndexes?.has(idx) && (!hasSelection || selectedFields.has(col)),
        );
        if (copiesBlurredField) {
            toast.info(BLURRED_COPY_MESSAGE);
            return;
        }
        const data = getJsonData();
        void setClipboardText(JSON.stringify(data, null, 2))
            .then(() => {
                const msg =
                    isSelectMode && selectedFields.size > 0
                        ? `Copied ${selectedFields.size} fields as JSON`
                        : 'Copied full row as JSON';
                toast.success(msg);
            })
            .catch(() => toast.error('Failed to copy JSON'));
    }, [blurredColumnIndexes, detail, getJsonData, toast, isSelectMode, selectedFields]);

    const toggleFieldSelection = (col: string) => {
        setSelectedFields(prev => {
            const next = new Set(prev);
            if (next.has(col)) next.delete(col);
            else next.add(col);
            return next;
        });
    };

    const toggleSelectMode = () => {
        const nextValue = !isSelectMode;
        if (!nextValue) setSelectedFields(new Set());
        updateRowDetailPanelState({ isSelectMode: nextValue });
    };

    const invertSelection = useCallback(() => {
        if (!detail) return;
        setSelectedFields(prev => {
            const next = new Set<string>();
            detail.columns.forEach(col => {
                if (!prev.has(col)) next.add(col);
            });
            return next;
        });
    }, [detail]);

    const actionBtnClass = interactiveIconAction;
    const actionBtnActiveClass = interactiveSelected;

    if (!detail) {
        return (
            <div className='flex h-full flex-1 items-center justify-center text-small text-muted-foreground'>
                <p>No row selected</p>
            </div>
        );
    }

    const copyValue = (val: string | null | undefined) => {
        if (val === null || val === undefined) return;
        void setClipboardText(val)
            .then(() => toast.success('Copied to clipboard'))
            .catch(() => toast.error('Failed to copy value'));
    };

    return (
        // One preview dialog for every field row, instead of one per image field.
        <ImagePreviewHost>
            <div className='flex h-full flex-col overflow-hidden'>
                <div className='mb-1 flex items-center justify-end gap-1'>
                    <div className='relative flex-1 min-w-0'>
                        <Input
                            size='sm'
                            variant='ghost'
                            value={fieldFilter}
                            onChange={e => setFieldFilter(e.target.value)}
                            placeholder='Filter fields...'
                            className='pr-6'
                            onKeyDown={e => {
                                if (e.key === 'Escape') setFieldFilter('');
                            }}
                        />
                        {fieldFilter && (
                            <Button
                                type='button'
                                variant='ghost'
                                size='micro'
                                onClick={() => setFieldFilter('')}
                                className={cn(
                                    'absolute right-0.5 top-1/2 -translate-y-1/2',
                                    interactiveIconAction,
                                )}
                            >
                                <svg
                                    width='10'
                                    height='10'
                                    viewBox='0 0 10 10'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='1.8'
                                    strokeLinecap='round'
                                >
                                    <line x1='2' y1='2' x2='8' y2='8' />
                                    <line x1='8' y1='2' x2='2' y2='8' />
                                </svg>
                            </Button>
                        )}
                    </div>
                    {viewMode === 'form' && isSelectMode && (
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className={actionBtnClass}
                            title='Invert selection'
                            onClick={invertSelection}
                        >
                            <RefreshCcw size={13} />
                        </Button>
                    )}
                    {viewMode === 'form' && (
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className={cn(actionBtnClass, isSelectMode && actionBtnActiveClass)}
                            title='Toggle selection mode for custom JSON copy'
                            onClick={toggleSelectMode}
                        >
                            <CheckSquare size={13} />
                        </Button>
                    )}
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className={cn(actionBtnClass, viewMode === 'json' && actionBtnActiveClass)}
                        title='Toggle JSON view'
                        onClick={() =>
                            updateRowDetailPanelState({
                                viewMode: viewMode === 'form' ? 'json' : 'form',
                            })
                        }
                    >
                        <Braces size={13} />
                    </Button>
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className={actionBtnClass}
                        title={
                            isSelectMode && selectedFields.size > 0
                                ? 'Copy selected fields as JSON'
                                : 'Copy row as JSON'
                        }
                        onClick={handleCopyJson}
                    >
                        <FileJson size={13} />
                    </Button>
                </div>

                <div className='flex-1 min-w-0 overflow-auto'>
                    {viewMode === 'json' ? (
                        <JsonViewer
                            value={JSON.stringify(getJsonData(), null, 2)}
                            showCopy={false}
                        />
                    ) : (
                        detail.columns.map((col, idx) => {
                            if (
                                fieldFilter &&
                                !col.toLowerCase().includes(fieldFilter.toLowerCase())
                            )
                                return null;
                            const val = detail.row[idx];
                            const columnDef = detail.columnDefs?.[idx];
                            const dataTypeLabel = normalizeDataTypeLabel(detail.columnTypes?.[idx]);
                            const dataTypeHint = buildColumnHint({
                                fullDataType: columnDef?.FullDataType,
                                dataType: columnDef?.DataType || detail.columnTypes?.[idx],
                                isNullable: columnDef?.IsNullable,
                                description: columnDef?.Description,
                            });
                            const fieldState = getRowDetailFieldState(val);
                            const isPK = detail.primaryKeys?.includes(col) ?? false;

                            return (
                                <RowDetailField
                                    key={`${col}-${idx}`}
                                    col={col}
                                    dataTypeLabel={dataTypeLabel}
                                    dataTypeHint={dataTypeHint}
                                    val={fieldState.displayValue}
                                    isNull={fieldState.isNull}
                                    isVisualNull={fieldState.isVisualNull}
                                    isPK={isPK}
                                    isBlurred={blurredColumnIndexes?.has(idx) === true}
                                    colIdx={idx}
                                    onCopy={() => copyValue(val)}
                                    onSave={detail.onSave}
                                    isModified={
                                        originalRowRef.current !== null &&
                                        originalRowRef.current[idx] !== (detail.row[idx] ?? null)
                                    }
                                    isSelectMode={isSelectMode}
                                    isSelected={selectedFields.has(col)}
                                    onToggleSelect={() => toggleFieldSelection(col)}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        </ImagePreviewHost>
    );
};

interface RowDetailFieldProps {
    col: string;
    dataTypeLabel?: string;
    dataTypeHint?: string;
    val: string;
    isNull: boolean;
    isVisualNull: boolean;
    isPK: boolean;
    /** The column is blurred in the result grid: blur the value and disable copy. */
    isBlurred: boolean;
    colIdx: number;
    onCopy: () => void;
    onSave?: (colIdx: number, newVal: string) => void;
    isModified?: boolean;
    isSelectMode: boolean;
    isSelected: boolean;
    onToggleSelect: () => void;
}

interface RowDetailEditorProps {
    value: string;
    onChange: (val: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    readonlySuffix?: string;
}

const RowDetailEditor: React.FC<RowDetailEditorProps> = ({
    value,
    onChange,
    onCommit,
    onCancel,
    readonlySuffix,
}) => {
    const { textareaRef, handleKeyDown, handleBlur } = useCellEditor({
        value,
        onCommit,
        onCancel,
    });
    return (
        <>
            <Textarea
                ref={textareaRef}
                className='rt-cell-input rt-row-detail-editor'
                value={value}
                rows={1}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={e => e.stopPropagation()}
                title='Enter to save | Shift+Enter for newline | Esc to cancel'
            />
            {readonlySuffix && (
                <div className='px-1 pt-0.5 text-label italic text-muted-foreground'>
                    {readonlySuffix}
                </div>
            )}
        </>
    );
};

const RowDetailField: React.FC<RowDetailFieldProps> = ({
    col,
    dataTypeLabel,
    dataTypeHint,
    val,
    isNull,
    isVisualNull,
    isPK,
    isBlurred,
    colIdx,
    onCopy,
    onSave,
    isModified,
    isSelectMode,
    isSelected,
    onToggleSelect,
}) => {
    const { editableValue, suffix } = splitDatetimeEditableValue(isVisualNull ? '' : val);
    const [editVal, setEditVal] = useState(editableValue);
    const [isDirty, setIsDirty] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const checkboxId = `row-cb-${colIdx}`;
    const isImageField = !isVisualNull && detectImageType(val, dataTypeLabel);

    const displayCellClassName = cn(
        'rt-cell-content rt-cell-content--compact rt-data-font',
        'rounded-md bg-background border! border-border! py-1!',
        isVisualNull && 'italic text-muted-foreground',
        isBlurred && 'rt-cell-blurred',
        (isDirty || isModified) && 'rt-cell-dirty',
        (!onSave || isPK) && 'opacity-70',
        onSave && !isPK && !isBlurred && !isSelectMode && 'cursor-text',
        isSelectMode && 'cursor-pointer',
        isImageField && 'group',
    );

    useEffect(() => {
        const { editableValue: ev } = splitDatetimeEditableValue(isVisualNull ? '' : val);
        setEditVal(ev);
        setIsDirty(false);
        setIsEditing(false);
    }, [col, isVisualNull, val]);

    const commit = useCallback(() => {
        if (!isDirty || !onSave || isPK) {
            setIsEditing(false);
            return;
        }
        onSave(colIdx, mergeDatetimeEditableValue(editVal, suffix));
        setIsEditing(false);
        // isDirty stays true until the parent propagates the new val back (useEffect resets it)
    }, [colIdx, editVal, isDirty, isPK, onSave, suffix]);

    const cancel = useCallback(() => {
        setEditVal(isVisualNull ? '' : val);
        setIsDirty(false);
        setIsEditing(false);
    }, [isVisualNull, val]);

    const openEditor = () => {
        if (!onSave || isPK || isSelectMode || isBlurred) return;
        setIsEditing(true);
    };

    // Blur can be switched on while this field is open in the editor; close it rather than leave
    // the plaintext editable.
    useEffect(() => {
        if (isBlurred) setIsEditing(false);
    }, [isBlurred]);

    const valueOuterRef = useRef<HTMLDivElement | null>(null);
    const valueInnerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const outer = valueOuterRef.current;
        const inner = valueInnerRef.current;
        if (!outer || !inner) return;
        const observer = new ResizeObserver(([entry]) => {
            outer.style.height = `${entry.contentRect.height}px`;
        });
        observer.observe(inner);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            className={cn(
                'flex flex-col gap-0.5 p-0.5 transition-colors duration-150',
                isSelected && interactiveSelected,
            )}
        >
            <div className='group flex items-center justify-between gap-1 text-label font-semibold text-muted-foreground'>
                <div className='flex items-center gap-1.5 overflow-hidden'>
                    {isSelectMode && (
                        <Checkbox
                            id={checkboxId}
                            checked={isSelected}
                            onCheckedChange={() => onToggleSelect()}
                            className='h-3.5 w-3.5 shrink-0'
                        />
                    )}
                    <Label
                        htmlFor={isSelectMode ? checkboxId : undefined}
                        className={cn(
                            'm-0 flex items-center gap-1 text-label text-muted-foreground',
                            isSelectMode ? 'cursor-pointer' : 'cursor-default',
                            isPK && 'text-primary',
                        )}
                    >
                        {dataTypeLabel && (
                            <span className='rt-th-type' title={dataTypeHint || dataTypeLabel}>
                                <DataTypeIcon
                                    type={dataTypeLabel}
                                    hint={dataTypeHint || dataTypeLabel}
                                />
                            </span>
                        )}
                        {col}
                        {isPK && (
                            <span
                                className={cn(
                                    'rounded-md px-1 py-[1px] text-label tracking-[0.04em]',
                                    interactiveBadge,
                                )}
                            >
                                PK
                            </span>
                        )}
                    </Label>
                </div>
                <Button
                    type='button'
                    variant='ghost'
                    size='micro'
                    className={cn(
                        'shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 disabled:cursor-default disabled:opacity-0',
                        interactiveIconAction,
                    )}
                    onClick={onCopy}
                    title={isBlurred ? 'Unblur the column to copy' : 'Copy value'}
                    disabled={isNull || isBlurred}
                >
                    <Copy size={11} />
                </Button>
            </div>
            <div
                ref={valueOuterRef}
                className='overflow-hidden transition-[height] duration-200 ease-out'
            >
                <div ref={valueInnerRef}>
                    {!isEditing ? (
                        <div
                            className={displayCellClassName}
                            title={
                                isSelectMode
                                    ? 'Click to select field'
                                    : isPK
                                      ? 'Primary key (read-only)'
                                      : onSave && isBlurred
                                        ? 'Blurred: unblur the column to edit'
                                        : onSave
                                          ? 'Click to edit'
                                          : 'Read-only (no primary key)'
                            }
                            onClick={isSelectMode ? onToggleSelect : openEditor}
                        >
                            {isVisualNull ? (
                                NULL_PLACEHOLDER
                            ) : suffix ? (
                                <span className='inline-flex items-baseline gap-1'>
                                    <span>{editableValue}</span>
                                    <span className='italic text-muted-foreground'>{suffix}</span>
                                </span>
                            ) : isImageField ? (
                                <>
                                    <span className='truncate flex-1 min-w-0'>{val}</span>
                                    <BlobPreviewButton value={val} columnType={dataTypeLabel} />
                                </>
                            ) : isBlobValue(val, dataTypeLabel) ? (
                                <BlobViewer
                                    value={val}
                                    columnType={dataTypeLabel}
                                    className='rt-row-detail-blob'
                                />
                            ) : (
                                val
                            )}
                        </div>
                    ) : (
                        <RowDetailEditor
                            value={editVal}
                            onChange={newVal => {
                                setEditVal(newVal);
                                setIsDirty(true);
                            }}
                            onCommit={commit}
                            onCancel={cancel}
                            readonlySuffix={suffix || undefined}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
