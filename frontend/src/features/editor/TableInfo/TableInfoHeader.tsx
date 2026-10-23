// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Search } from 'lucide-react';
import { Input, Tabs, TabsList, TabsTrigger } from '../../../components/ui';
import { TableSchemaBreadcrumb } from './TableSchemaBreadcrumb';
import { TableInfoTab, TabAction } from './types';
import { ToolbarActionItem } from '../resultPanel/useResultPanelToolbar';

const TABLE_TAB_BADGE_CLASSNAME =
    'absolute right-0 top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warning px-0.5 text-label font-semibold leading-none text-background';

interface TableTabDefinition {
    key: TableInfoTab;
    label: string;
    icon: React.ReactNode;
    dirtyCount?: number;
    count?: number | null;
}

interface TableInfoHeaderProps {
    activeTab: TableInfoTab;
    actions: TabAction[];
    createNameInputRef: React.RefObject<HTMLInputElement | null>;
    dbName: string;
    draftTableName: string;
    filterCol: string;
    filterInputRef: React.RefObject<HTMLInputElement | null>;
    isCreateMode: boolean;
    onDraftTableNameChange: (value: string) => void;
    onDraftTableNameReset: () => void;
    onFilterChange: (value: string) => void;
    onSelectTable: (tableName: string) => void;
    onTabChange: (tab: TableInfoTab) => void;
    schema: string;
    showFilter: boolean;
    table: string;
    tabs: TableTabDefinition[];
}

export const TableInfoHeader: React.FC<TableInfoHeaderProps> = ({
    activeTab,
    actions,
    createNameInputRef,
    dbName,
    draftTableName,
    filterCol,
    filterInputRef,
    isCreateMode,
    onDraftTableNameChange,
    onDraftTableNameReset,
    onFilterChange,
    onSelectTable,
    onTabChange,
    schema,
    showFilter,
    table,
    tabs,
}) => (
    <div className='shrink-0 bg-card grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2'>
        <div className='min-w-0 overflow-x-auto whitespace-nowrap'>
            <TableSchemaBreadcrumb
                dbName={dbName}
                schema={schema}
                table={table}
                onSelectTable={onSelectTable}
                isCreateMode={isCreateMode}
                draftTableName={draftTableName}
                onDraftTableNameChange={onDraftTableNameChange}
                onDraftTableNameReset={onDraftTableNameReset}
                tableInputRef={createNameInputRef as React.RefObject<HTMLInputElement>}
            />
        </div>

        <div className='justify-self-center flex items-center min-w-0'>
            <Tabs
                value={activeTab}
                onValueChange={value => onTabChange(value as TableInfoTab)}
                className='min-w-0'
            >
                <TabsList className='h-9 w-full justify-start gap-1 p-0 bg-transparent rounded-md'>
                    {tabs.map(({ key, label, icon, dirtyCount, count }) => {
                        const dirtyBadgeCount =
                            typeof dirtyCount === 'number' && dirtyCount > 0 ? dirtyCount : null;
                        const badgeValue = count ?? dirtyBadgeCount;
                        const title =
                            count !== undefined && count !== null
                                ? `${label} (${count})`
                                : (dirtyCount ?? 0) > 0
                                  ? `${label} (${dirtyCount} unsaved)`
                                  : label;
                        return (
                            <TabsTrigger
                                key={key}
                                value={key}
                                title={title}
                                aria-label={label}
                                className='relative h-8 my-1 rounded-md cursor-pointer bg-transparent px-2.5 shadow-none ui-interactive-primary-tab'
                            >
                                {icon}
                                {typeof badgeValue === 'number' && badgeValue > 0 && (
                                    <span className={TABLE_TAB_BADGE_CLASSNAME}>{badgeValue}</span>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
            </Tabs>
        </div>

        <div className='min-w-0 justify-self-end flex items-center'>
            {actions.map(action => (
                <ToolbarActionItem key={action.id} action={action} />
            ))}

            {showFilter && (
                <div className='relative group flex items-center w-[180px] min-w-[180px]'>
                    <Search
                        size={11}
                        className='absolute left-3 text-muted-foreground group-focus-within:text-accent'
                    />
                    <Input
                        ref={filterInputRef as React.RefObject<HTMLInputElement>}
                        type='text'
                        placeholder='Filter columns...'
                        value={filterCol}
                        onChange={e => onFilterChange(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Escape') onFilterChange('');
                        }}
                        size='sm'
                        variant='ghost'
                        className='w-full border-border/30 pl-8 pr-3 placeholder:text-muted-foreground/40'
                    />
                </div>
            )}
        </div>
    </div>
);
