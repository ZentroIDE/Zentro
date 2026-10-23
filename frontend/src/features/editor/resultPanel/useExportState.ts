// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { TabResult } from '../../../stores/resultStore';
import type { RunExportOptions } from '../../../features/editor/useResultExport';
import { getBlurredColumnNames } from '../../../lib/blurredColumns';

interface UseExportStateOptions {
    result?: TabResult;
    blurredColumnIndexes?: ReadonlySet<number>;
    runExport: (params: RunExportOptions) => void;
    toast: { error: (msg: string) => void; info: (msg: string) => void };
}

export function useExportState({
    result,
    blurredColumnIndexes,
    runExport,
    toast,
}: UseExportStateOptions) {
    const [showExportModal, setShowExportModal] = React.useState(false);
    const [exportScope, setExportScope] = React.useState<'all' | 'view'>('all');
    const [exportFormat, setExportFormat] = React.useState<'csv' | 'json' | 'sql'>('csv');
    const [selectedExportColumns, setSelectedExportColumns] = React.useState<string[]>([]);
    const [exportTableName, setExportTableName] = React.useState('');
    const [includeBlurredRequested, setIncludeBlurredColumns] = React.useState(false);

    const allExportColumns = result?.columns || [];

    const blurredExportColumns = React.useMemo(
        () => getBlurredColumnNames(result?.columns ?? [], blurredColumnIndexes),
        [blurredColumnIndexes, result?.columns],
    );
    const hasBlurredExportColumns = blurredExportColumns.size > 0;
    // Only honoured while something is actually blurred, so a stale opt-in can't outlive the blur.
    const includeBlurredColumns = includeBlurredRequested && hasBlurredExportColumns;

    const isColumnLocked = React.useCallback(
        (column: string) => !includeBlurredColumns && blurredExportColumns.has(column),
        [blurredExportColumns, includeBlurredColumns],
    );

    const exportableColumns = React.useMemo(
        () => allExportColumns.filter(column => !isColumnLocked(column)),
        [allExportColumns, isColumnLocked],
    );

    const handleOpenExportModal = React.useCallback(() => {
        if (!result?.columns?.length) {
            toast.error('No columns available to export.');
            return;
        }
        setExportScope('all');
        setExportFormat('csv');
        setSelectedExportColumns([...result.columns]);
        setExportTableName(result.tableName || '');
        setIncludeBlurredColumns(false);
        setShowExportModal(true);
    }, [result?.columns, result?.tableName, toast]);

    const selectedExportColumnSet = React.useMemo(
        () => new Set(selectedExportColumns),
        [selectedExportColumns],
    );

    // A blurred column never reaches the export unless the user opted in, even if it is still
    // ticked in `selectedExportColumns` from before the opt-in was switched off.
    const orderedSelectedExportColumns = React.useMemo(
        () =>
            (result?.columns || []).filter(
                col => selectedExportColumnSet.has(col) && !isColumnLocked(col),
            ),
        [isColumnLocked, result?.columns, selectedExportColumnSet],
    );

    const areAllExportColumnsSelected =
        exportableColumns.length > 0 &&
        orderedSelectedExportColumns.length === exportableColumns.length;

    const previewExportRows = React.useMemo(() => {
        if (!result?.rows?.length || orderedSelectedExportColumns.length === 0) return [];
        const indexByColumn = new Map(
            (result.columns || []).map((column, index) => [column, index]),
        );
        return result.rows.slice(0, 10).map(row =>
            orderedSelectedExportColumns.map(column => {
                const colIndex = indexByColumn.get(column);
                return colIndex === undefined ? '' : (row[colIndex] ?? '');
            }),
        );
    }, [orderedSelectedExportColumns, result?.columns, result?.rows]);

    const toggleExportColumn = React.useCallback(
        (column: string) => {
            if (isColumnLocked(column)) return;
            setSelectedExportColumns(prev =>
                prev.includes(column) ? prev.filter(name => name !== column) : [...prev, column],
            );
        },
        [isColumnLocked],
    );

    const toggleAllExportColumns = React.useCallback(() => {
        setSelectedExportColumns(areAllExportColumnsSelected ? [] : [...exportableColumns]);
    }, [areAllExportColumnsSelected, exportableColumns]);

    const handleConfirmExport = React.useCallback(() => {
        if (orderedSelectedExportColumns.length === 0) {
            toast.error('Select at least one column to export.');
            return;
        }
        if (hasBlurredExportColumns && !includeBlurredColumns) {
            const count = blurredExportColumns.size;
            toast.info(`${count} blurred column${count === 1 ? '' : 's'} excluded from export.`);
        }
        runExport({
            scope: exportScope,
            format: exportFormat,
            selectedColumns: orderedSelectedExportColumns,
            tableName: exportFormat === 'sql' ? exportTableName : undefined,
        });
        setShowExportModal(false);
    }, [
        blurredExportColumns,
        exportFormat,
        exportScope,
        exportTableName,
        hasBlurredExportColumns,
        includeBlurredColumns,
        orderedSelectedExportColumns,
        runExport,
        toast,
    ]);

    return {
        showExportModal,
        setShowExportModal,
        exportScope,
        setExportScope,
        exportFormat,
        setExportFormat,
        selectedExportColumns,
        exportTableName,
        setExportTableName,
        allExportColumns,
        orderedSelectedExportColumns,
        areAllExportColumnsSelected,
        previewExportRows,
        blurredExportColumns,
        hasBlurredExportColumns,
        includeBlurredColumns,
        setIncludeBlurredColumns,
        toggleExportColumn,
        toggleAllExportColumns,
        handleConfirmExport,
        handleOpenExportModal,
    };
}
