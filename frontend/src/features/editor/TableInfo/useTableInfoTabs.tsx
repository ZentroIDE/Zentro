// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Database,
    FileCode2,
    KeyRound,
    Network,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Table2,
    Trash2,
} from 'lucide-react';

import type { TableInfoTab, TabAction } from './types';

const TABLE_TAB_ICON_SIZE = 13;

interface UseTableInfoTabsArgs {
    activeTab: TableInfoTab;
    reloading: boolean;
    viewMode: boolean;
    saving: boolean;
    isCreateMode: boolean;
    hasChanges: boolean;
    selectedRowsSize: number;
    dataTabActions: TabAction[];
    ddlTabActions: TabAction[];
    columnsDirtyCount: number;
    dataDirtyCount: number;
    keysDirtyCount: number;
    addColumn: () => void;
    toggleDeleteRows: () => void;
    discardAll: () => void;
    saveColumns: () => Promise<unknown>;
    tabReload: Record<TableInfoTab, () => void>;
}

export function useTableInfoTabs({
    activeTab,
    reloading,
    viewMode,
    saving,
    isCreateMode,
    hasChanges,
    selectedRowsSize,
    dataTabActions,
    ddlTabActions,
    columnsDirtyCount,
    dataDirtyCount,
    keysDirtyCount,
    addColumn,
    toggleDeleteRows,
    discardAll,
    saveColumns,
    tabReload,
}: UseTableInfoTabsArgs) {
    const reloadAction = React.useMemo<TabAction>(
        () => ({
            id: 'reload',
            icon: <RefreshCw size={12} />,
            label: 'Reload',
            title: 'Reload (F5)',
            onClick: tabReload[activeTab],
            loading: reloading,
        }),
        [activeTab, reloading, tabReload],
    );

    const actionsByTab = React.useMemo<Record<TableInfoTab, TabAction[]>>(
        () => ({
            columns: [
                ...(viewMode
                    ? []
                    : [
                          {
                              id: 'add',
                              icon: <Plus size={12} />,
                              label: 'Add Column',
                              onClick: addColumn,
                              disabled: saving,
                          },
                      ]),
                ...(!viewMode && selectedRowsSize > 0
                    ? [
                          {
                              id: 'delete',
                              icon: <Trash2 size={12} />,
                              label: 'Delete',
                              onClick: toggleDeleteRows,
                              disabled: saving,
                              danger: true,
                          },
                      ]
                    : []),
                ...(hasChanges
                    ? [
                          {
                              id: 'discard',
                              icon: <RotateCcw size={12} />,
                              label: 'Discard',
                              onClick: discardAll,
                              disabled: saving,
                              danger: true,
                          },
                          ...(!viewMode
                              ? [
                                    {
                                        id: 'save',
                                        icon: <Save size={12} />,
                                        label: isCreateMode ? 'Create Table' : 'Save Change',
                                        title: isCreateMode ? 'Create Table' : 'Save Change',
                                        onClick: () => {
                                            void saveColumns();
                                        },
                                        disabled: saving,
                                        loading: saving,
                                    },
                                ]
                              : []),
                      ]
                    : []),
                reloadAction,
            ],
            data: dataTabActions,
            erd: [reloadAction],
            keys: [reloadAction],
            ddl: [...ddlTabActions, reloadAction],
        }),
        [
            addColumn,
            dataTabActions,
            ddlTabActions,
            discardAll,
            hasChanges,
            isCreateMode,
            reloadAction,
            saveColumns,
            saving,
            selectedRowsSize,
            toggleDeleteRows,
            viewMode,
        ],
    );

    const tabs = React.useMemo(() => {
        if (isCreateMode) {
            return [
                {
                    key: 'columns' as TableInfoTab,
                    label: 'Columns',
                    icon: <Table2 size={TABLE_TAB_ICON_SIZE} />,
                    dirtyCount: columnsDirtyCount,
                },
            ];
        }

        return [
            {
                key: 'columns' as TableInfoTab,
                label: 'Columns',
                icon: <Table2 size={TABLE_TAB_ICON_SIZE} />,
                dirtyCount: columnsDirtyCount,
            },
            {
                key: 'data' as TableInfoTab,
                label: 'Data',
                icon: <Database size={TABLE_TAB_ICON_SIZE} />,
                dirtyCount: dataDirtyCount,
            },
            {
                key: 'erd' as TableInfoTab,
                label: 'ERD',
                icon: <Network size={TABLE_TAB_ICON_SIZE} />,
            },
            {
                key: 'keys' as TableInfoTab,
                label: 'Keys',
                icon: <KeyRound size={TABLE_TAB_ICON_SIZE} />,
                dirtyCount: keysDirtyCount,
            },
            {
                key: 'ddl' as TableInfoTab,
                label: 'DDL',
                icon: <FileCode2 size={TABLE_TAB_ICON_SIZE} />,
            },
        ];
    }, [columnsDirtyCount, dataDirtyCount, isCreateMode, keysDirtyCount]);

    return {
        actionsByTab,
        tabs,
    };
}
