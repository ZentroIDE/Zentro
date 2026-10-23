// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useMemo } from 'react';
import { useResultStore, type TabResult } from '../../stores/resultStore';
import { useToast } from '../../components/layout/Toast';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { useFocusZone } from '../../lib/focusZoneRegistry';
import { emitCommand } from '../../lib/commandBus';
import { DOM_EVENT } from '../../lib/constants';

import {
    DataTableGrid,
    useDataTable,
    normalizeDataTypeLabel,
    buildColumnHint,
    parseCellKey,
} from '../../components/data-table';
import {
    DeletedRowKeys,
    EditedCells,
    SelectedCells,
    SelectedRowKeys,
} from '../../components/data-table';

import {
    blurredColumnIndexesToTableState,
    legacyDeletedRowsToTableState,
    legacyEditedCellsToTableState,
    legacySelectedCellsToTableState,
    legacySelectedRowKeysToTableState,
    tableDeletedRowsToLegacyState,
    tableEditedCellsToLegacyState,
    tableSelectedCellsToLegacyState,
    tableSelectedRowKeysToLegacyState,
} from '../../lib/resultFormatMigration';
import { loadMoreResultTableRows } from './resultTable/loadMoreRows';
import type { ResultTableProps } from './resultTable/types';

export type { FocusCellRequest, ResultCellContextMenuPayload } from './resultTable/types';

// ─── Format bridges ────────────────────────────────────────────────────────────
// Old format: Map<"rowIndex:colIndex", value>
// New format: Record<"p:rowIndex::colName", value>

// Old format: Set<number> (persisted row indices)
// New format: Record<"p:n", true>

// Old format: Set<"rowKey|colIdx"> (using | separator)
// New format: Record<"rowKey::colName", true>

// Old row key format: Set<"p:0"> (used for row header selection)
// New format: Record<"p:0", true>

// ─── Component ─────────────────────────────────────────────────────────────────

export const ResultTable: React.FC<ResultTableProps> = ({
    tabId,
    previewSessionId,
    columns,
    rows,
    isDone,
    editedCells,
    setEditedCells,
    selectedCells,
    setSelectedCells,
    selectedRowKeys,
    setSelectedRowKeys,
    deletedRows,
    setDeletedRows,
    draftRows,
    setDraftRows,
    columnDefs,
    focusCellRequest,
    onFocusCellRequestHandled,
    onRemoveDraftRows,
    readOnlyMode = false,
    quickFilter = '',
    onViewStatsChange,
    onCellContextMenu,
    onRowHeaderContextMenu,
    columnVisibility: externalColumnVisibility,
    onColumnVisibilityChange: externalSetColumnVisibility,
    blurredColumnIndexes,
    dataSchema,
    dataConnectionKey,
    pinnedConnection,
}) => {
    const {
        results,
        setOffset,
        clearFetchingMore,
        appendRows,
        setDone,
        setTotalCount,
        touchProgress,
        markFirstRow,
    } = useResultStore();
    const { toast } = useToast();
    const resultState = results[tabId] as TabResult | undefined;
    const hasMore = Boolean(resultState?.hasMore);
    const hasServerOrder = Boolean((resultState?.orderByExpr || '').trim());
    const windowStartOffset = resultState?.windowStartOffset ?? 0;

    const isEditable = useMemo(() => {
        if (readOnlyMode) return false;
        if (!resultState?.tableName || !resultState?.primaryKeys?.length) return false;
        if (!columns.length) return false;
        return resultState.primaryKeys.every(pk => columns.includes(pk));
    }, [columns, readOnlyMode, resultState?.primaryKeys, resultState?.tableName]);

    const dataTypeByColumn = useMemo(() => {
        const map = new Map<string, string>();
        columnDefs.forEach(def => {
            map.set(def.Name, normalizeDataTypeLabel(def.DataType));
        });
        return map;
    }, [columnDefs]);

    const columnHintByColumn = useMemo(() => {
        const map = new Map<string, string>();
        columnDefs.forEach(def => {
            const hint = buildColumnHint({
                fullDataType: def.FullDataType,
                dataType: def.DataType,
                isNullable: def.IsNullable,
                description: def.Description,
            });
            if (hint) map.set(def.Name, hint);
        });
        return map;
    }, [columnDefs]);

    // ─── Format conversions (old ↔ new) ─────────────────────────────────────
    const newEditedCells = useMemo(
        () => legacyEditedCellsToTableState(editedCells, columns),
        [editedCells, columns],
    );
    const newDeletedRowKeys = useMemo(
        () => legacyDeletedRowsToTableState(deletedRows),
        [deletedRows],
    );
    const newSelectedCells = useMemo(
        () => legacySelectedCellsToTableState(selectedCells, columns),
        [selectedCells, columns],
    );
    const newSelectedRowKeys = useMemo(
        () => legacySelectedRowKeysToTableState(selectedRowKeys),
        [selectedRowKeys],
    );
    const newBlurredIndexes = useMemo(
        () => blurredColumnIndexesToTableState(blurredColumnIndexes),
        [blurredColumnIndexes],
    );

    // ─── Callbacks (new → old) ──────────────────────────────────────────────
    const handleSelectedCellsChange = useCallback(
        (next: SelectedCells) => setSelectedCells(tableSelectedCellsToLegacyState(next, columns)),
        [columns, setSelectedCells],
    );
    const handleSelectedRowKeysChange = useCallback(
        (next: SelectedRowKeys) => setSelectedRowKeys(tableSelectedRowKeysToLegacyState(next)),
        [setSelectedRowKeys],
    );
    const handleEditedCellsChange = useCallback(
        (next: EditedCells) => setEditedCells(tableEditedCellsToLegacyState(next, columns)),
        [columns, setEditedCells],
    );
    const handleDeletedRowKeysChange = useCallback(
        (next: DeletedRowKeys) => setDeletedRows?.(tableDeletedRowsToLegacyState(next)),
        [setDeletedRows],
    );
    const handleDraftRowsChange = useCallback(
        (next: typeof draftRows) => setDraftRows(next),
        [setDraftRows],
    );

    // ─── Data model ─────────────────────────────────────────────────────────
    const { dataModel, columnState, interactions, table, virtualization } = useDataTable({
        dataModelArgs: {
            columns,
            rows,
            draftRows,
            quickFilter,
            isDone,
            hasMore,
            disableClientSort: hasServerOrder,
            windowStartOffset,
        },
        interactionsArgs: {
            saveCommandId: tabId,
            isDone,
            columns,
            rows,
            selectedCells: newSelectedCells,
            onSelectedCellsChange: handleSelectedCellsChange,
            selectedRowKeys: newSelectedRowKeys,
            onSelectedRowKeysChange: handleSelectedRowKeysChange,
            editedCells: newEditedCells,
            deletedRowKeys: newDeletedRowKeys,
            draftRows,
            isEditable,
            focusCellRequest,
            onFocusCellRequestHandled,
            onRemoveDraftRows,
            onCellContextMenu,
            onRowHeaderContextMenu,
            onReadOnlyEditAttempt: () => {
                toast.error(
                    'Result is read-only. Make sure the query includes the primary key(s).',
                );
            },
            onBlurredEditAttempt: () => {
                toast.info('This column is blurred. Unblur it to edit.');
            },
            onDraftRowsChange: handleDraftRowsChange,
            onEditedCellsChange: handleEditedCellsChange,
            onDeletedRowKeysChange: handleDeletedRowKeysChange,
        },
        columnStateArgs: {
            dataTypeByColumn,
        },
        tableColumnsArgs: {
            dataTypeByColumn,
            isEditable,
            readOnly: readOnlyMode,
            tableName: resultState?.tableName,
            rowNumberOffset: windowStartOffset,
            onRemoveDraftRows,
        },
        virtualizationArgs: {
            scrollKey: resultState?.progress?.startedAt
                ? `${tabId}:${resultState.progress.startedAt}`
                : undefined,
            isDone,
            hasMore,
            isFetchingMore: Boolean(resultState?.isFetchingMore),
            columnsLength: columns.length,
            loadedRowsLength: rows.length,
            windowStartOffset,
            onNearBottom: () => {
                // A manual fetch-N / fetch-all run owns paging; a scroll-triggered batch at the
                // same offset would duplicate its rows.
                if (resultState?.unboundedWindow) return;
                void loadMoreResultTableRows({
                    tabId,
                    previewSessionId,
                    windowStartOffset,
                    loadedRowsLength: rows.length,
                    clearFetchingMore,
                    setOffset,
                    appendRows,
                    touchProgress,
                    markFirstRow,
                    setTotalCount,
                    setDone,
                    ...(pinnedConnection
                        ? {
                              fetchMoreRows: (id: string, offset: number) =>
                                  getApiGateway().query.fetchPinnedMoreRows(
                                      id,
                                      offset,
                                      pinnedConnection.connectionID,
                                      pinnedConnection.dbName,
                                  ),
                          }
                        : {}),
                });
            },
        },
        blurredColumnIndexes: newBlurredIndexes,
        columnVisibility: externalColumnVisibility,
        setColumnVisibility: externalSetColumnVisibility,
        onViewStatsChange,
    });

    useFocusZone('resultGrid', virtualization.parentRef);

    // Enter/F2 to enter cell-edit mode (same entry path as double-click),
    // and Escape to clear the selection and hand focus back to the editor
    // toolbar zone — the "jump in / escape out" round trip. Both are no-ops
    // while already editing a cell: DataTableFloatingEditor owns its own
    // Enter/Escape handling in that state.
    const handleGridKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (interactions.editingCell) return;

            if (event.key === 'Enter' || event.key === 'F2') {
                const selectedKeys = Object.keys(newSelectedCells);
                if (selectedKeys.length !== 1) return;
                const { rowKey, columnKey } = parseCellKey(selectedKeys[0]);
                const colIdx = columns.indexOf(columnKey);
                if (colIdx === -1) return;
                const displayRow = dataModel.displayRowsByKey.get(rowKey);
                if (!displayRow) return;
                event.preventDefault();
                interactions.tableMeta.handleCellDoubleClick(
                    rowKey,
                    colIdx,
                    displayRow.values[colIdx] ?? '',
                );
                return;
            }

            if (event.key === 'Escape') {
                if (Object.keys(newSelectedCells).length === 0) return;
                event.preventDefault();
                setSelectedCells(new Set());
                emitCommand(DOM_EVENT.FOCUS_ZONE, { zoneId: 'editorToolbar' });
            }
        },
        [columns, dataModel.displayRowsByKey, interactions, newSelectedCells, setSelectedCells],
    );

    return (
        <DataTableGrid
            parentRef={virtualization.parentRef}
            onScroll={virtualization.handleScroll}
            table={table}
            columnsLength={columns.length}
            isDone={isDone}
            isDeferredSorting={dataModel.isDeferredSorting}
            isDeferredFiltering={dataModel.isDeferredFiltering}
            isFetchingMore={Boolean(resultState?.isFetchingMore)}
            columnOrder={columnState.columnOrder}
            virtualItems={virtualization.virtualItems}
            renderedColumnIndexes={virtualization.renderedColumnIndexes}
            columnPaddingLeft={virtualization.columnPaddingLeft}
            columnPaddingRight={virtualization.columnPaddingRight}
            paddingTop={virtualization.paddingTop}
            paddingBottom={virtualization.paddingBottom}
            rowHeight={virtualization.rowHeight}
            leadingPlaceholderRows={virtualization.leadingPlaceholderRows}
            dataColumnById={dataModel.dataColumnById}
            dataTypeByColumn={dataTypeByColumn}
            columnHintByColumn={columnHintByColumn}
            columnSizing={columnState.columnSizing}
            handleAutoFitColumn={columnState.handleAutoFitColumn}
            handleHeaderDragEnd={columnState.handleHeaderDragEnd}
            selectedCells={newSelectedCells}
            selectedRowKeys={newSelectedRowKeys}
            deletedRowKeys={newDeletedRowKeys}
            editingCell={interactions.editingCell}
            editValue={interactions.editValue}
            blurredColumnIndexes={newBlurredIndexes}
            windowStartOffset={windowStartOffset}
            dataSchema={dataSchema}
            dataConnectionKey={dataConnectionKey}
            dataTableName={resultState?.tableName}
            onGridKeyDown={handleGridKeyDown}
        />
    );
};
