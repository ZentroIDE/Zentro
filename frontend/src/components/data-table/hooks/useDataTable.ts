// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';

import { DataTableMeta } from '../types';

import { DataTableColumnState, useDataTableColumnState } from './useDataTableColumnState';
import { useDataTableColumns } from './useDataTableColumns';
import { DataTableDataModel, useDataTableDataModel } from './useDataTableDataModel';
import { DataTableInteractions, useDataTableInteractions } from './useDataTableInteractions';
import { useDataTableVirtualization } from './useDataTableVirtualization';
import { useDataTableViewStats } from './useDataTableViewStats';

interface UseDataTableBuilderArgs {
    dataModelArgs: Parameters<typeof useDataTableDataModel>[0];
    buildColumnStateArgs: (
        dataModel: DataTableDataModel,
    ) => Parameters<typeof useDataTableColumnState>[0];
    buildInteractionsArgs: (
        dataModel: DataTableDataModel,
    ) => Omit<Parameters<typeof useDataTableInteractions>[0], 'columnOrder' | 'dataColumnById'>;
    buildTableColumnsArgs: (
        dataModel: DataTableDataModel,
        interactions: DataTableInteractions,
    ) => Parameters<typeof useDataTableColumns>[0];
    virtualizationArgs: Omit<Parameters<typeof useDataTableVirtualization>[0], 'tableRowsLength'>;
    blurredColumnIndexes?: DataTableMeta['blurredColumnIndexes'];
    columnVisibility?: DataTableColumnState['columnVisibility'];
    setColumnVisibility?: DataTableColumnState['setColumnVisibility'];
}

interface UseDataTableCompositeArgs {
    dataModelArgs: Parameters<typeof useDataTableDataModel>[0];
    interactionsArgs: Omit<
        Parameters<typeof useDataTableInteractions>[0],
        'displayRows' | 'displayRowsByKey' | 'rowOrder' | 'columnOrder' | 'dataColumnById'
    >;
    virtualizationArgs: Omit<Parameters<typeof useDataTableVirtualization>[0], 'tableRowsLength'>;
    tableColumnsArgs: Omit<
        Parameters<typeof useDataTableColumns>[0],
        'dataColumns' | 'commitEdit' | 'emitSaveShortcut'
    >;
    columnStateArgs: Omit<
        Parameters<typeof useDataTableColumnState>[0],
        'dataColumnIds' | 'dataColumnById' | 'tableData'
    >;
    blurredColumnIndexes?: DataTableMeta['blurredColumnIndexes'];
    columnVisibility?: DataTableColumnState['columnVisibility'];
    setColumnVisibility?: DataTableColumnState['setColumnVisibility'];
    onViewStatsChange?: Parameters<typeof useDataTableViewStats>[2];
}

type UseDataTableArgs = UseDataTableBuilderArgs | UseDataTableCompositeArgs;

function isBuilderArgs(args: UseDataTableArgs): args is UseDataTableBuilderArgs {
    return 'buildColumnStateArgs' in args;
}

export function useDataTable(args: UseDataTableArgs) {
    const {
        dataModelArgs,
        virtualizationArgs,
        blurredColumnIndexes,
        columnVisibility: externalColumnVisibility,
        setColumnVisibility: externalSetColumnVisibility,
    } = args;
    const dataModel = useDataTableDataModel(dataModelArgs);
    const columnState = useDataTableColumnState(
        isBuilderArgs(args)
            ? args.buildColumnStateArgs(dataModel)
            : {
                  dataColumnIds: dataModel.dataColumnIds,
                  dataColumnById: dataModel.dataColumnById,
                  tableData: dataModel.tableData,
                  dataTypeByColumn: args.columnStateArgs.dataTypeByColumn,
              },
    );
    const interactions = useDataTableInteractions({
        ...(isBuilderArgs(args)
            ? args.buildInteractionsArgs(dataModel)
            : {
                  ...args.interactionsArgs,
                  displayRows: dataModel.displayRows,
                  displayRowsByKey: dataModel.displayRowsByKey,
                  rowOrder: dataModel.rowOrder,
              }),
        blurredColumnIndexes,
        columnOrder: columnState.columnOrder,
        dataColumnById: dataModel.dataColumnById,
    });
    const tableColumns = useDataTableColumns(
        isBuilderArgs(args)
            ? args.buildTableColumnsArgs(dataModel, interactions)
            : {
                  ...args.tableColumnsArgs,
                  dataColumns: dataModel.dataColumns,
                  commitEdit: interactions.commitEdit,
                  emitSaveShortcut: interactions.emitSaveShortcut,
              },
    );

    const columnVisibility = externalColumnVisibility ?? columnState.columnVisibility;
    const setColumnVisibility = externalSetColumnVisibility ?? columnState.setColumnVisibility;

    // Stable identity matters: the grid memoizes header and body rows on this
    // object, so a fresh one every render would re-render every visible cell on
    // every scroll frame.
    const tableMeta = React.useMemo<DataTableMeta>(
        () => ({
            ...interactions.tableMeta,
            blurredColumnIndexes,
        }),
        [interactions.tableMeta, blurredColumnIndexes],
    );

    const table = useReactTable({
        data: dataModel.tableData,
        columns: tableColumns,
        state: {
            sorting: dataModel.sorting,
            columnOrder: columnState.tableColumnOrder,
            columnSizing: columnState.columnSizing,
            columnVisibility,
        },
        meta: tableMeta,
        onSortingChange: dataModel.canSortClientSide ? dataModel.setSorting : undefined,
        onColumnSizingChange: columnState.setColumnSizing,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: dataModel.shouldUseDeferredSort ? undefined : getSortedRowModel(),
        enableSorting: dataModel.canSortClientSide,
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

    // Real widths for the column virtualizer. Sizes only move when the table's
    // own column state moves, so this stays stable across scroll frames.
    const columnWidths = React.useMemo(
        () =>
            table
                .getVisibleLeafColumns()
                .slice(1)
                .map(column => column.getSize()),
        [
            table,
            tableColumns,
            columnVisibility,
            columnState.columnSizing,
            columnState.tableColumnOrder,
        ],
    );

    const virtualization = useDataTableVirtualization({
        ...virtualizationArgs,
        tableRowsLength: table.getRowModel().rows.length,
        columnWidths,
    });

    useDataTableViewStats(
        dataModel.tableData.length,
        dataModel.displayRows.length,
        isBuilderArgs(args) ? undefined : args.onViewStatsChange,
    );

    return {
        dataModel,
        columnState,
        interactions,
        table,
        virtualization,
    };
}
