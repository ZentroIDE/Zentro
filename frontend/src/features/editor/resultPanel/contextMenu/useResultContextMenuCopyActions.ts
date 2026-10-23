// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { getClipboardText, setClipboardText } from '../../../../services/clipboardService';
import { buildFilterQuery } from '../../../../lib/queryBuilder';
import {
    matrixToTsv,
    selectionSpanTouchesBlurredColumn,
    selectionTouchesBlurredColumn,
} from '../../resultSelectionActions';
import { BLURRED_COPY_MESSAGE, blurredEditSkippedMessage } from '../../../../lib/blurredColumns';
import type {
    ResultContextCopyAsAction,
    ResultContextMenuDeps,
    ResultContextMenuPayload,
    ResultContextPasteAction,
    ResultContextWhereAction,
} from '../types';
import {
    buildCopyCsvWithHeaders,
    buildCopyInsertSql,
    buildCopyJson,
    buildCopyMatrix,
    buildCopyUpdateSql,
    buildCopyWithHeadersTsv,
} from '../contextMenuActions/copyActions';
import { makeCellId } from '../../resultPanelUtils';
import { buildPasteResult } from '../contextMenuActions/cellActions';
import { buildWhereQueryFromSelection } from '../contextMenuActions/whereActions';
import { toSqlLiteralColumnMap } from '../../resultSelectionActions';

interface UseResultContextMenuCopyActionsArgs {
    deps: ResultContextMenuDeps;
    contextMenu: ResultContextMenuPayload | null;
    canCopy: boolean;
    canPaste: boolean;
    canMutateCells: boolean;
    getEffectiveSelection: () => Set<string>;
    getSingleSelectedColumnIndex: () => number | null;
    getSelectionColumnRange: (
        selectedCells: Set<string>,
    ) => { minCol: number; maxCol: number } | null;
    pkColumns: string[];
    closeContextMenu: () => void;
    captureSnapshot: () => {
        editedCells: Map<string, string>;
        draftRows: import('../../../../lib/dataEditing').DraftRow[];
        deletedRows: Set<number>;
        selectedCells: Set<string>;
    };
    registerUndoAction: (
        label: string,
        snapshot: {
            editedCells: Map<string, string>;
            draftRows: import('../../../../lib/dataEditing').DraftRow[];
            deletedRows: Set<number>;
            selectedCells: Set<string>;
        },
    ) => void;
    toast: {
        info: (message: string) => void;
        success: (message: string) => void;
        error: (message: string) => void;
    };
}

export function useResultContextMenuCopyActions({
    deps,
    contextMenu,
    canCopy,
    canPaste,
    canMutateCells,
    getEffectiveSelection,
    getSingleSelectedColumnIndex,
    getSelectionColumnRange,
    pkColumns,
    closeContextMenu,
    captureSnapshot,
    registerUndoAction,
    toast,
}: UseResultContextMenuCopyActionsArgs) {
    const columnTypes = React.useMemo(
        () => toSqlLiteralColumnMap(deps.columnDefsByName),
        [deps.columnDefsByName],
    );

    const buildQueryFromGeneratedWhere = React.useCallback(
        (clause: string): string => {
            const whereExpr = clause.trim();
            if (!whereExpr) return '';
            const baseQuery = deps.result?.lastExecutedQuery?.trim() || '';
            if (!baseQuery) return `WHERE ${whereExpr}`;
            return buildFilterQuery(baseQuery, whereExpr);
        },
        [deps.result?.lastExecutedQuery],
    );

    const hasBlurredColumns = (deps.blurredColumnIndexes?.size ?? 0) > 0;

    // Rows picked through the index column leave selectedCells empty; like Excel, copying them
    // means every column of those rows.
    const getCopySelection = React.useCallback((): Set<string> => {
        if (deps.selectedCells.size > 0 || deps.selectedRowKeysFromHeader.length === 0) {
            return getEffectiveSelection();
        }
        const columnCount = deps.result?.columns.length ?? 0;
        const cells = new Set<string>();
        deps.selectedRowKeysFromHeader.forEach(rowKey => {
            for (let colIdx = 0; colIdx < columnCount; colIdx += 1) {
                cells.add(makeCellId(rowKey, colIdx));
            }
        });
        return cells;
    }, [
        deps.result?.columns.length,
        deps.selectedCells,
        deps.selectedRowKeysFromHeader,
        getEffectiveSelection,
    ]);

    // Copying a blurred column would put its plaintext on the clipboard, and from there into
    // whatever is on screen (query editor, chat), so every copy path refuses instead.
    const blockIfBlurred = React.useCallback(
        (blocked: boolean): boolean => {
            if (!blocked) return false;
            toast.info(BLURRED_COPY_MESSAGE);
            closeContextMenu();
            return true;
        },
        [closeContextMenu, toast],
    );

    const handleContextCopy = React.useCallback(() => {
        const effectiveSelection = getCopySelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to copy.');
            closeContextMenu();
            return;
        }
        if (
            blockIfBlurred(
                selectionTouchesBlurredColumn(effectiveSelection, deps.blurredColumnIndexes),
            )
        ) {
            return;
        }

        const matrix = buildCopyMatrix({
            selectedCells: effectiveSelection,
            displayRows: deps.displayRows,
            rowOrder: deps.rowOrder,
            editedCells: deps.editedCells,
        });
        if (matrix.length === 0) {
            toast.info('No copyable cells in current selection.');
            closeContextMenu();
            return;
        }

        void setClipboardText(matrixToTsv(matrix)).catch(() =>
            toast.error('Failed to write to clipboard'),
        );
        closeContextMenu();
    }, [
        blockIfBlurred,
        closeContextMenu,
        deps.blurredColumnIndexes,
        deps.displayRows,
        deps.editedCells,
        deps.rowOrder,
        getCopySelection,
        toast,
    ]);

    const handleContextCopyWithHeaders = React.useCallback(() => {
        const effectiveSelection = getCopySelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to copy.');
            closeContextMenu();
            return;
        }
        if (
            blockIfBlurred(
                selectionTouchesBlurredColumn(effectiveSelection, deps.blurredColumnIndexes),
            )
        ) {
            return;
        }
        const matrix = buildCopyMatrix({
            selectedCells: effectiveSelection,
            displayRows: deps.displayRows,
            rowOrder: deps.rowOrder,
            editedCells: deps.editedCells,
        });
        if (matrix.length === 0) {
            toast.info('No copyable cells in current selection.');
            closeContextMenu();
            return;
        }
        const colRange = getSelectionColumnRange(effectiveSelection);
        const columns = deps.result?.columns ?? [];
        const headers = colRange ? columns.slice(colRange.minCol, colRange.maxCol + 1) : [];
        void setClipboardText(buildCopyWithHeadersTsv({ headers, matrix })).catch(() =>
            toast.error('Failed to write to clipboard'),
        );
        closeContextMenu();
    }, [
        blockIfBlurred,
        closeContextMenu,
        deps.blurredColumnIndexes,
        deps.displayRows,
        deps.editedCells,
        deps.result?.columns,
        deps.rowOrder,
        getCopySelection,
        getSelectionColumnRange,
        toast,
    ]);

    const handleContextCopyAsJson = React.useCallback(() => {
        const effectiveSelection = getCopySelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to copy.');
            closeContextMenu();
            return;
        }
        if (
            blockIfBlurred(
                selectionTouchesBlurredColumn(effectiveSelection, deps.blurredColumnIndexes),
            )
        ) {
            return;
        }
        const matrix = buildCopyMatrix({
            selectedCells: effectiveSelection,
            displayRows: deps.displayRows,
            rowOrder: deps.rowOrder,
            editedCells: deps.editedCells,
        });
        if (matrix.length === 0) {
            toast.info('No copyable cells in current selection.');
            closeContextMenu();
            return;
        }
        const colRange = getSelectionColumnRange(effectiveSelection);
        const columns = deps.result?.columns ?? [];
        const headers = colRange ? columns.slice(colRange.minCol, colRange.maxCol + 1) : [];
        void setClipboardText(buildCopyJson({ headers, matrix })).catch(() =>
            toast.error('Failed to write to clipboard'),
        );
        closeContextMenu();
    }, [
        blockIfBlurred,
        closeContextMenu,
        deps.blurredColumnIndexes,
        deps.displayRows,
        deps.editedCells,
        deps.result?.columns,
        deps.rowOrder,
        getCopySelection,
        getSelectionColumnRange,
        toast,
    ]);

    const handleContextCopyAsCsvWithHeaders = React.useCallback(() => {
        const effectiveSelection = getCopySelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to copy.');
            closeContextMenu();
            return;
        }
        if (
            blockIfBlurred(
                selectionTouchesBlurredColumn(effectiveSelection, deps.blurredColumnIndexes),
            )
        ) {
            return;
        }
        const matrix = buildCopyMatrix({
            selectedCells: effectiveSelection,
            displayRows: deps.displayRows,
            rowOrder: deps.rowOrder,
            editedCells: deps.editedCells,
        });
        if (matrix.length === 0) {
            toast.info('No copyable cells in current selection.');
            closeContextMenu();
            return;
        }
        const colRange = getSelectionColumnRange(effectiveSelection);
        const columns = deps.result?.columns ?? [];
        const headers = colRange ? columns.slice(colRange.minCol, colRange.maxCol + 1) : [];
        const csv = buildCopyCsvWithHeaders({ headers, matrix });
        void setClipboardText(csv).catch(() => toast.error('Failed to write to clipboard'));
        closeContextMenu();
    }, [
        blockIfBlurred,
        closeContextMenu,
        deps.blurredColumnIndexes,
        deps.displayRows,
        deps.editedCells,
        deps.result?.columns,
        deps.rowOrder,
        getCopySelection,
        getSelectionColumnRange,
        toast,
    ]);

    const handleContextCopyAsInsert = React.useCallback(() => {
        const effectiveSelection = getCopySelection();
        const hasRowSelection = deps.selectedRowKeysFromHeader.length > 0;
        if (!hasRowSelection && effectiveSelection.size === 0) {
            toast.info('Select at least one cell or row to copy.');
            closeContextMenu();
            return;
        }
        // Row-header selection emits every column; cell selection emits the whole column span.
        if (
            blockIfBlurred(
                hasRowSelection
                    ? hasBlurredColumns
                    : selectionSpanTouchesBlurredColumn(
                          effectiveSelection,
                          deps.rowOrder,
                          deps.blurredColumnIndexes,
                      ),
            )
        ) {
            return;
        }
        const columns = deps.result?.columns ?? [];
        const tableName = deps.result?.tableName ?? 'table_name';
        const sql = buildCopyInsertSql({
            selectedCells: effectiveSelection,
            selectedRowKeys: deps.selectedRowKeysFromHeader,
            displayRows: deps.displayRows,
            rowOrder: deps.rowOrder,
            editedCells: deps.editedCells,
            columns,
            tableName,
            driver: deps.driver || '',
            columnTypes,
        });
        if (!sql) {
            toast.info('No copyable cells in current selection.');
            closeContextMenu();
            return;
        }
        void setClipboardText(sql).catch(() => toast.error('Failed to write to clipboard'));
        closeContextMenu();
    }, [
        blockIfBlurred,
        closeContextMenu,
        columnTypes,
        deps.blurredColumnIndexes,
        deps.displayRows,
        deps.driver,
        deps.editedCells,
        deps.result?.columns,
        deps.result?.tableName,
        deps.rowOrder,
        deps.selectedRowKeysFromHeader,
        getCopySelection,
        hasBlurredColumns,
        toast,
    ]);

    const handleContextCopyAsUpdate = React.useCallback(() => {
        const effectiveSelection = getCopySelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to copy.');
            closeContextMenu();
            return;
        }
        // UPDATE sets every column of the row, not just the selected ones.
        if (blockIfBlurred(hasBlurredColumns)) return;
        const columns = deps.result?.columns ?? [];
        const tableName = deps.result?.tableName ?? 'table_name';
        const sql = buildCopyUpdateSql({
            selectedCells: effectiveSelection,
            displayRows: deps.displayRows,
            rowOrder: deps.rowOrder,
            editedCells: deps.editedCells,
            columns,
            pkColumns,
            tableName,
            driver: deps.driver || '',
            columnTypes,
        });
        if (!sql) {
            toast.info('No copyable cells in current selection.');
            closeContextMenu();
            return;
        }
        void setClipboardText(sql).catch(() => toast.error('Failed to write to clipboard'));
        closeContextMenu();
    }, [
        blockIfBlurred,
        closeContextMenu,
        columnTypes,
        deps.displayRows,
        deps.driver,
        deps.editedCells,
        deps.result?.columns,
        deps.result?.tableName,
        deps.rowOrder,
        getCopySelection,
        hasBlurredColumns,
        pkColumns,
        toast,
    ]);

    const handleGenerateWhereByIn = React.useCallback(() => {
        const effectiveSelection = getEffectiveSelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one cell to generate WHERE clause.');
            closeContextMenu();
            return;
        }
        if (
            blockIfBlurred(
                selectionTouchesBlurredColumn(effectiveSelection, deps.blurredColumnIndexes),
            )
        ) {
            return;
        }
        const columns = deps.result?.columns ?? [];
        const queryText = buildWhereQueryFromSelection({
            selectedCells: effectiveSelection,
            displayRowsByKey: deps.displayRowsByKey,
            editedCells: deps.editedCells,
            columns,
            driver: deps.driver || '',
            columnTypes,
            buildQueryFromGeneratedWhere,
        });
        if (!queryText) {
            toast.info('Select cells from a single column to generate WHERE IN clause.');
            closeContextMenu();
            return;
        }
        void setClipboardText(queryText)
            .then(() => {
                toast.success('Query copied to clipboard');
            })
            .catch(() => toast.error('Failed to write to clipboard'));
        closeContextMenu();
    }, [
        blockIfBlurred,
        buildQueryFromGeneratedWhere,
        closeContextMenu,
        columnTypes,
        deps.blurredColumnIndexes,
        deps.displayRowsByKey,
        deps.driver,
        deps.editedCells,
        deps.result?.columns,
        getEffectiveSelection,
        toast,
    ]);

    const handleContextPaste = React.useCallback(() => {
        if (!canMutateCells) {
            toast.error('Result is read-only. Paste is unavailable.');
            closeContextMenu();
            return;
        }

        const effectiveSelection = getEffectiveSelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one target cell to paste.');
            closeContextMenu();
            return;
        }

        void getClipboardText()
            .then(text => {
                const snapshot = captureSnapshot();
                const pasteResult = buildPasteResult({
                    text,
                    selectedCells: effectiveSelection,
                    displayRows: deps.displayRows,
                    rowOrder: deps.rowOrder,
                    editedCells: deps.editedCells,
                    draftRows: deps.draftRows,
                    deletedRows: deps.deletedRows,
                    columnCount: deps.result?.columns.length || 0,
                    mode: 'fill-selected',
                    blurredColumnIndexes: deps.blurredColumnIndexes,
                });
                if (!pasteResult) {
                    toast.info('Clipboard data is empty or cannot be pasted here.');
                    return;
                }
                if (pasteResult.blurredSkippedCount > 0) {
                    toast.info(blurredEditSkippedMessage(pasteResult.blurredSkippedCount));
                    if (pasteResult.pastedCells.size === 0) return;
                }
                registerUndoAction('paste', snapshot);
                deps.setEditedCells(pasteResult.nextEdited);
                deps.setDraftRows(pasteResult.nextDraftRows);
                if (pasteResult.pastedCells.size > 0) {
                    deps.setSelectedCells(pasteResult.pastedCells);
                }
            })
            .catch(() => toast.error('Failed to read from clipboard'));
        closeContextMenu();
    }, [
        canMutateCells,
        captureSnapshot,
        closeContextMenu,
        deps,
        getEffectiveSelection,
        registerUndoAction,
        toast,
    ]);

    const handleContextPasteAnchor = React.useCallback(() => {
        if (!canMutateCells) {
            toast.error('Result is read-only. Paste is unavailable.');
            closeContextMenu();
            return;
        }

        const effectiveSelection = getEffectiveSelection();
        if (effectiveSelection.size === 0) {
            toast.info('Select at least one target cell to paste.');
            closeContextMenu();
            return;
        }

        void getClipboardText()
            .then(text => {
                const snapshot = captureSnapshot();
                const pasteResult = buildPasteResult({
                    text,
                    selectedCells: effectiveSelection,
                    displayRows: deps.displayRows,
                    rowOrder: deps.rowOrder,
                    editedCells: deps.editedCells,
                    draftRows: deps.draftRows,
                    deletedRows: deps.deletedRows,
                    columnCount: deps.result?.columns.length || 0,
                    mode: 'anchor',
                    blurredColumnIndexes: deps.blurredColumnIndexes,
                });
                if (!pasteResult) {
                    toast.info('Clipboard data is empty or cannot be pasted here.');
                    return;
                }
                if (pasteResult.blurredSkippedCount > 0) {
                    toast.info(blurredEditSkippedMessage(pasteResult.blurredSkippedCount));
                    if (pasteResult.pastedCells.size === 0) return;
                }
                registerUndoAction('paste', snapshot);
                deps.setEditedCells(pasteResult.nextEdited);
                deps.setDraftRows(pasteResult.nextDraftRows);
                if (pasteResult.pastedCells.size > 0) {
                    deps.setSelectedCells(pasteResult.pastedCells);
                }
            })
            .catch(() => toast.error('Failed to read from clipboard'));
        closeContextMenu();
    }, [
        canMutateCells,
        captureSnapshot,
        closeContextMenu,
        deps,
        getEffectiveSelection,
        registerUndoAction,
        toast,
    ]);

    const copyDisabledTitle = canCopy
        ? 'Copy selected cells (TSV)'
        : 'Select at least one cell to copy.';
    const pasteDisabledTitle = canPaste
        ? 'Paste into selected cells (Ctrl+V)'
        : !canMutateCells
          ? 'Result is read-only. Paste is unavailable.'
          : 'Select at least one target cell to paste.';

    const pasteActions = React.useMemo<ResultContextPasteAction[]>(
        () => [
            {
                id: 'paste-fill-selected',
                label: 'Fill Selected Cells',
                onSelect: handleContextPaste,
                disabled: !canPaste,
                title: canPaste
                    ? 'Apply clipboard values directly to the current selected cells'
                    : pasteDisabledTitle,
            },
            {
                id: 'paste-excel-anchor',
                label: 'Paste From Top-Left',
                onSelect: handleContextPasteAnchor,
                disabled: !canPaste,
                title: canPaste
                    ? 'Paste like Excel starting from the top-left selected cell'
                    : pasteDisabledTitle,
            },
        ],
        [canPaste, handleContextPaste, handleContextPasteAnchor, pasteDisabledTitle],
    );

    const effectiveSelection = getEffectiveSelection();
    const canGenerateWhereByIn =
        effectiveSelection.size > 0 && getSingleSelectedColumnIndex() !== null;

    const copyAsActions = React.useMemo<ResultContextCopyAsAction[]>(() => {
        const actions: ResultContextCopyAsAction[] = [
            {
                id: 'copy-with-headers',
                label: 'TSV (with headers)',
                onSelect: handleContextCopyWithHeaders,
                disabled: !canCopy,
                title: canCopy
                    ? 'Copy selected cells with column headers'
                    : 'Select at least one cell to copy.',
            },
            {
                id: 'copy-csv-with-headers',
                label: 'CSV (with headers)',
                onSelect: handleContextCopyAsCsvWithHeaders,
                disabled: !canCopy,
                title: canCopy
                    ? 'Copy selected cells as CSV with headers'
                    : 'Select at least one cell to copy.',
            },
            {
                id: 'copy-json',
                label: 'JSON',
                onSelect: handleContextCopyAsJson,
                disabled: !canCopy,
                title: canCopy
                    ? 'Copy selected cells as JSON'
                    : 'Select at least one cell to copy.',
            },
        ];
        if (deps.result?.tableName) {
            actions.push(
                {
                    id: 'copy-insert',
                    label: 'INSERT',
                    onSelect: handleContextCopyAsInsert,
                    disabled: !canCopy,
                    title: canCopy
                        ? 'Copy selected cells as INSERT statements'
                        : 'Select at least one cell to copy.',
                },
                {
                    id: 'copy-update',
                    label: 'UPDATE',
                    onSelect: handleContextCopyAsUpdate,
                    disabled: !canCopy,
                    title: canCopy
                        ? 'Copy selected cells as UPDATE statement'
                        : 'Select at least one cell to copy.',
                },
            );
        }
        return actions;
    }, [
        canCopy,
        deps.result?.tableName,
        handleContextCopyAsCsvWithHeaders,
        handleContextCopyAsInsert,
        handleContextCopyAsJson,
        handleContextCopyAsUpdate,
        handleContextCopyWithHeaders,
    ]);

    const whereActions = React.useMemo<ResultContextWhereAction[]>(
        () => [
            {
                id: 'where-by-in',
                label: 'By Selected Values (IN)',
                onSelect: handleGenerateWhereByIn,
                disabled: !canGenerateWhereByIn,
                title: canGenerateWhereByIn
                    ? 'Generate WHERE IN from selected values in one column'
                    : effectiveSelection.size === 0
                      ? 'Select at least one column cell first.'
                      : 'WHERE IN quick fix only works with a single selected column.',
            },
        ],
        [canGenerateWhereByIn, effectiveSelection.size, handleGenerateWhereByIn],
    );

    return {
        copyDisabledTitle,
        pasteDisabledTitle,
        pasteActions,
        copyAsActions,
        whereActions,
        handleContextCopy,
        handleContextPaste,
    };
}
