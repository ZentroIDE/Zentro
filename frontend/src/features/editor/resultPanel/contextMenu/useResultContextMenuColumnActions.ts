// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type {
    ResultContextColumnVisibilityAction,
    ResultContextMenuDeps,
    ResultContextMenuPayload,
} from '../types';
import {
    getResultColumnId,
    resetResultColumnVisibility,
    setResultColumnVisible,
} from '../useResultColumnVisibilityAction';

interface UseResultContextMenuColumnActionsArgs {
    deps: ResultContextMenuDeps;
    contextMenu: ResultContextMenuPayload | null;
    selectedColumnIndexes: number[];
    closeContextMenu: () => void;
}

export function useResultContextMenuColumnActions({
    deps,
    contextMenu,
    selectedColumnIndexes,
    closeContextMenu,
}: UseResultContextMenuColumnActionsArgs) {
    return React.useMemo<ResultContextColumnVisibilityAction[]>(() => {
        if (contextMenu?.target !== 'cell') return [];
        if (!deps.result?.columns?.length) return [];

        const validSelectedIndexes = selectedColumnIndexes.filter(
            columnIndex => columnIndex >= 0 && columnIndex < deps.result!.columns.length,
        );
        if (validSelectedIndexes.length === 0) {
            return [];
        }

        const selectedColumns = validSelectedIndexes.map(columnIndex => ({
            columnIndex,
            columnName: deps.result!.columns[columnIndex],
        }));
        const isMultiColumn = selectedColumns.length > 1;
        const targetColumnName = selectedColumns[0]?.columnName || '';
        const hiddenCount = deps.result.columns.filter((columnName, index) => {
            const columnId = getResultColumnId(columnName, index);
            return deps.columnVisibility[columnId] === false;
        }).length;

        return [
            {
                id: 'hide-column',
                label: isMultiColumn
                    ? `Hide ${selectedColumns.length} Selected Columns`
                    : `Hide "${targetColumnName}"`,
                onSelect: () => {
                    selectedColumns.forEach(({ columnName, columnIndex }) => {
                        setResultColumnVisible(
                            deps.setColumnVisibility,
                            columnName,
                            columnIndex,
                            false,
                        );
                    });
                    closeContextMenu();
                },
                title: isMultiColumn
                    ? 'Hide every selected column from the result grid'
                    : `Hide the "${targetColumnName}" column from the result grid`,
            },
            {
                id: 'show-all-columns',
                label: 'Show All Columns',
                onSelect: () => {
                    resetResultColumnVisibility(deps.setColumnVisibility);
                    closeContextMenu();
                },
                disabled: hiddenCount === 0,
                title:
                    hiddenCount > 0
                        ? 'Restore every hidden column in the result grid'
                        : 'No hidden columns to restore.',
            },
        ];
    }, [
        closeContextMenu,
        contextMenu,
        deps.columnVisibility,
        deps.result?.columns,
        deps.setColumnVisibility,
        selectedColumnIndexes,
    ]);
}
