// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    RadioGroup,
    RadioGroupItem,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui';

interface ResultPanelModalsProps {
    showExportModal: boolean;
    setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>;
    resultTableName?: string;
    exportScope: 'all' | 'view';
    setExportScope: React.Dispatch<React.SetStateAction<'all' | 'view'>>;
    exportFormat: 'csv' | 'json' | 'sql';
    setExportFormat: React.Dispatch<React.SetStateAction<'csv' | 'json' | 'sql'>>;
    exportTableName: string;
    setExportTableName: React.Dispatch<React.SetStateAction<string>>;
    allExportColumns: string[];
    orderedSelectedExportColumns: string[];
    toggleExportColumn: (column: string) => void;
    toggleAllExportColumns: () => void;
    areAllExportColumnsSelected: boolean;
    previewExportRows: string[][];
    blurredExportColumns: ReadonlySet<string>;
    hasBlurredExportColumns: boolean;
    includeBlurredColumns: boolean;
    setIncludeBlurredColumns: (include: boolean) => void;
    handleConfirmExport: () => void;
    writeSafetyModals?: React.ReactNode;
}

const ResultPanelModalsInner: React.FC<ResultPanelModalsProps> = ({
    showExportModal,
    setShowExportModal,
    resultTableName,
    exportScope,
    setExportScope,
    exportFormat,
    setExportFormat,
    exportTableName,
    setExportTableName,
    allExportColumns,
    orderedSelectedExportColumns,
    toggleExportColumn,
    toggleAllExportColumns,
    areAllExportColumnsSelected,
    previewExportRows,
    blurredExportColumns,
    hasBlurredExportColumns,
    includeBlurredColumns,
    setIncludeBlurredColumns,
    handleConfirmExport,
    writeSafetyModals,
}) => {
    const selectedExportColumnSet = React.useMemo(
        () => new Set(orderedSelectedExportColumns),
        [orderedSelectedExportColumns],
    );
    const isColumnLocked = (column: string) =>
        !includeBlurredColumns && blurredExportColumns.has(column);
    const selectableColumnCount = allExportColumns.filter(column => !isColumnLocked(column)).length;

    return (
        <>
            {writeSafetyModals}

            <Dialog open={showExportModal} onOpenChange={v => !v && setShowExportModal(false)}>
                <DialogContent className='p-0 max-w-4xl max-h-[90vh] overflow-hidden'>
                    <DialogHeader>
                        <DialogTitle>Export Options</DialogTitle>
                    </DialogHeader>
                    <div className='px-4 py-3 overflow-y-auto'>
                        <div className='grid grid-cols-12 gap-4'>
                            <section className='col-span-12 lg:col-span-5 space-y-4'>
                                <div>
                                    <p className='text-small font-semibold text-foreground mb-2'>
                                        Extraction
                                    </p>
                                    <RadioGroup
                                        value={exportScope}
                                        onValueChange={value =>
                                            setExportScope(value as 'all' | 'view')
                                        }
                                        className='gap-2'
                                    >
                                        <div className='flex items-center gap-2 text-small text-foreground'>
                                            <RadioGroupItem value='all' id='export_scope_all' />
                                            <Label
                                                htmlFor='export_scope_all'
                                                className='text-small font-normal text-foreground'
                                            >
                                                Query the database (no paging)
                                            </Label>
                                        </div>
                                        <div className='flex items-center gap-2 text-small text-foreground'>
                                            <RadioGroupItem value='view' id='export_scope_view' />
                                            <Label
                                                htmlFor='export_scope_view'
                                                className='text-small font-normal text-foreground'
                                            >
                                                Use fetched rows (current table view)
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                <div>
                                    <label className='block text-small font-semibold text-foreground mb-1.5'>
                                        Format
                                    </label>
                                    <Select
                                        value={exportFormat}
                                        onValueChange={value =>
                                            setExportFormat(value as 'csv' | 'json' | 'sql')
                                        }
                                    >
                                        <SelectTrigger className='w-full bg-background text-small'>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value='csv'>CSV</SelectItem>
                                            <SelectItem value='json'>JSON</SelectItem>
                                            <SelectItem value='sql'>SQL INSERT</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {exportFormat === 'sql' && (
                                    <div>
                                        <label className='block text-small font-semibold text-foreground mb-1.5'>
                                            Table Name
                                        </label>
                                        <Input
                                            type='text'
                                            size='md'
                                            className='w-full'
                                            placeholder={resultTableName || 'my_table'}
                                            value={exportTableName}
                                            onChange={event =>
                                                setExportTableName(event.target.value)
                                            }
                                        />
                                        <p className='text-label text-muted-foreground mt-1.5'>
                                            Leave empty to use "{resultTableName || 'my_table'}"
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <div className='flex items-center justify-between mb-1.5'>
                                        <label className='text-small font-semibold text-foreground'>
                                            Columns
                                        </label>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            className='h-auto px-1 py-0.5 text-label text-muted-foreground ui-interactive-surface'
                                            onClick={toggleAllExportColumns}
                                        >
                                            {areAllExportColumnsSelected
                                                ? 'Clear all'
                                                : 'Select all'}
                                        </Button>
                                    </div>
                                    <div className='max-h-44 overflow-auto rounded-md/50 bg-background p-2 space-y-1'>
                                        {allExportColumns.map(column => {
                                            const locked = isColumnLocked(column);
                                            return (
                                                <label
                                                    key={column}
                                                    className={`flex items-center gap-2 text-small ${
                                                        locked
                                                            ? 'text-muted-foreground'
                                                            : 'text-foreground'
                                                    }`}
                                                >
                                                    <Checkbox
                                                        checked={selectedExportColumnSet.has(
                                                            column,
                                                        )}
                                                        disabled={locked}
                                                        onCheckedChange={() =>
                                                            toggleExportColumn(column)
                                                        }
                                                    />
                                                    <span className='truncate' title={column}>
                                                        {column}
                                                    </span>
                                                    {locked && (
                                                        <span className='shrink-0 text-label italic'>
                                                            Blurred – excluded
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <p className='text-label text-muted-foreground mt-1.5'>
                                        {orderedSelectedExportColumns.length}/
                                        {selectableColumnCount} columns selected
                                    </p>
                                    {hasBlurredExportColumns && (
                                        <div className='mt-2'>
                                            <label className='flex items-center gap-2 text-small text-foreground'>
                                                <Checkbox
                                                    checked={includeBlurredColumns}
                                                    onCheckedChange={checked =>
                                                        setIncludeBlurredColumns(checked === true)
                                                    }
                                                />
                                                Include blurred columns
                                            </label>
                                            <p className='text-label text-muted-foreground mt-1'>
                                                Off by default: blurred columns stay out of the
                                                preview and the exported file.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className='col-span-12 lg:col-span-7'>
                                <div className='flex items-center justify-between mb-1.5'>
                                    <p className='text-small font-semibold text-foreground'>
                                        Preview (10 rows)
                                    </p>
                                    <p className='text-label text-muted-foreground'>
                                        Showing loaded rows preview only
                                    </p>
                                </div>
                                <div className='rounded-md/50 bg-background overflow-auto max-h-[360px]'>
                                    {orderedSelectedExportColumns.length === 0 ? (
                                        <div className='px-3 py-8 text-small text-muted-foreground text-center'>
                                            Select at least one column to preview.
                                        </div>
                                    ) : previewExportRows.length === 0 ? (
                                        <div className='px-3 py-8 text-small text-muted-foreground text-center'>
                                            No loaded rows to preview.
                                        </div>
                                    ) : (
                                        <table className='w-full text-label border-collapse'>
                                            <thead className='sticky top-0 bg-card'>
                                                <tr>
                                                    {orderedSelectedExportColumns.map(column => (
                                                        <th
                                                            key={column}
                                                            className='text-left px-2 py-1.5 border-b border-border/60 whitespace-nowrap'
                                                        >
                                                            {column}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewExportRows.map((row, rowIdx) => (
                                                    <tr
                                                        key={`preview_${rowIdx}`}
                                                        className='odd:bg-background even:bg-card/30'
                                                    >
                                                        {row.map((cell, cellIdx) => (
                                                            <td
                                                                key={`preview_${rowIdx}_${cellIdx}`}
                                                                className={`px-2 py-1.5 border-b border-border/20 whitespace-nowrap max-w-55 overflow-hidden text-ellipsis${
                                                                    blurredExportColumns.has(
                                                                        orderedSelectedExportColumns[
                                                                            cellIdx
                                                                        ],
                                                                    )
                                                                        ? ' rt-cell-blurred'
                                                                        : ''
                                                                }`}
                                                            >
                                                                {cell}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant='ghost' onClick={() => setShowExportModal(false)}>
                            Cancel
                        </Button>
                        <Button variant='default' onClick={handleConfirmExport} autoFocus>
                            Export
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export const ResultPanelModals = React.memo(ResultPanelModalsInner);
