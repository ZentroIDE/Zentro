// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useMemo, useState } from 'react';
import { Button, Spinner } from '../../../components/ui';
import { CLICKABLE_FOCUS_CLASS } from '../../../components/ui/contract';
import { IndexInfoView } from './IndexInfoView';
import { PrimaryKeyView } from './PrimaryKeyView';
import { CheckConstraintsView } from './CheckConstraintsView';
import { TabAction } from './types';

const ToolbarButton: React.FC<{ action: TabAction }> = ({ action }) => {
    if (action.render) return <>{action.render()}</>;
    if (!action.onClick || !action.icon) return null;

    const normalizedLabel = `${action.label ?? ''} ${action.title ?? ''}`.toLowerCase();
    const tone = action.danger
        ? 'destructive'
        : normalizedLabel.includes('save')
          ? 'default'
          : normalizedLabel.includes('add')
            ? 'success'
            : 'default';

    return (
        <Button
            variant='ghost'
            size='icon'
            tone={tone}
            onClick={() => {
                const res = action.onClick?.();
                if (res instanceof Promise) res.catch(() => {});
            }}
            disabled={action.disabled || action.loading}
            title={action.title || action.label}
            className='h-7 w-7 rounded-md p-0'
        >
            {action.loading ? <Spinner size={12} /> : action.icon}
        </Button>
    );
};

export type KeysPanelId = 'primary-key' | 'unique-keys' | 'indexes' | 'check-constraints';

export const DEFAULT_KEYS_TAB: KeysPanelId = 'primary-key';

interface TabDef {
    id: KeysPanelId;
    label: string;
}

const TAB_DEFS: TabDef[] = [
    { id: 'primary-key', label: 'Primary Key' },
    { id: 'unique-keys', label: 'Unique Keys' },
    { id: 'indexes', label: 'Indexes' },
    { id: 'check-constraints', label: 'Check Constraints' },
];

interface KeysViewProps {
    connectionID: string;
    dbName: string;
    environmentKey: string;
    schema: string;
    tableName: string;
    refreshKey: number;
    readOnlyMode?: boolean;
    isActive?: boolean;
    tableColumns?: string[];
    onDirtyCountChange?: (count: number) => void;
    onActionsChange?: (actions: TabAction[]) => void;
    driver?: string;
    activeTab?: KeysPanelId;
    onActiveTabChange?: (tab: KeysPanelId) => void;
}

interface DirtyCounts {
    pk: number;
    unique: number;
    indexes: number;
    check: number;
}

const ZERO_DIRTY: DirtyCounts = { pk: 0, unique: 0, indexes: 0, check: 0 };

export const KeysView: React.FC<KeysViewProps> = ({
    connectionID,
    dbName,
    environmentKey,
    schema,
    tableName,
    refreshKey,
    readOnlyMode,
    isActive,
    tableColumns,
    onDirtyCountChange,
    onActionsChange,
    driver,
    activeTab = DEFAULT_KEYS_TAB,
    onActiveTabChange,
}) => {
    const [pkActions, setPkActions] = useState<TabAction[]>([]);
    const [uniqueActions, setUniqueActions] = useState<TabAction[]>([]);
    const [indexActions, setIndexActions] = useState<TabAction[]>([]);
    const [checkActions, setCheckActions] = useState<TabAction[]>([]);

    const [dirtyCounts, setDirtyCounts] = useState<DirtyCounts>(ZERO_DIRTY);

    const makeDirtyHandler = useCallback(
        (key: keyof DirtyCounts) => (n: number) =>
            setDirtyCounts(prev => (prev[key] === n ? prev : { ...prev, [key]: n })),
        [],
    );
    const handlePkDirty = useMemo(() => makeDirtyHandler('pk'), [makeDirtyHandler]);
    const handleUniqueDirty = useMemo(() => makeDirtyHandler('unique'), [makeDirtyHandler]);
    const handleIndexDirty = useMemo(() => makeDirtyHandler('indexes'), [makeDirtyHandler]);
    const handleCheckDirty = useMemo(() => makeDirtyHandler('check'), [makeDirtyHandler]);

    React.useEffect(() => {
        const total = dirtyCounts.pk + dirtyCounts.unique + dirtyCounts.indexes + dirtyCounts.check;
        onDirtyCountChange?.(total);
    }, [dirtyCounts, onDirtyCountChange]);

    React.useEffect(() => {
        onActionsChange?.([...pkActions, ...uniqueActions, ...indexActions, ...checkActions]);
    }, [checkActions, indexActions, onActionsChange, pkActions, uniqueActions]);

    const actionsByTab: Record<KeysPanelId, TabAction[]> = {
        'primary-key': pkActions,
        'unique-keys': uniqueActions,
        indexes: indexActions,
        'check-constraints': checkActions,
    };

    const dirtyByTab: Record<KeysPanelId, number> = {
        'primary-key': dirtyCounts.pk,
        'unique-keys': dirtyCounts.unique,
        indexes: dirtyCounts.indexes,
        'check-constraints': dirtyCounts.check,
    };

    const renderActions = (actions: TabAction[]) =>
        actions.map(action => <ToolbarButton key={action.id} action={action} />);

    return (
        <div className='flex flex-1 min-h-0 overflow-hidden'>
            <div
                role='tablist'
                aria-orientation='vertical'
                className='flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto bg-background/20 p-1.5'
            >
                {TAB_DEFS.map(tab => {
                    const isTabActive = activeTab === tab.id;
                    const isDirty = dirtyByTab[tab.id] > 0;
                    return (
                        <div
                            key={tab.id}
                            role='tab'
                            aria-selected={isTabActive}
                            tabIndex={0}
                            onClick={() => onActiveTabChange?.(tab.id)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onActiveTabChange?.(tab.id);
                                }
                            }}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-label font-normal ${CLICKABLE_FOCUS_CLASS} ${
                                isTabActive
                                    ? 'ui-interactive-selected font-medium'
                                    : 'ui-interactive-selectable text-muted-foreground'
                            }`}
                        >
                            <span className='flex-1 truncate text-left'>{tab.label}</span>
                            {isDirty && (
                                <span
                                    className='h-1.5 w-1.5 shrink-0 rounded-full bg-warning'
                                    title='Unsaved changes'
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
                <div className='flex h-9 shrink-0 items-center justify-between px-3'>
                    <span className='text-small font-medium text-foreground/80 uppercase tracking-wide'>
                        {TAB_DEFS.find(tab => tab.id === activeTab)?.label}
                    </span>
                    <div className='flex items-center gap-0.5'>
                        {renderActions(actionsByTab[activeTab])}
                    </div>
                </div>

                <div className='min-h-0 flex-1 overflow-hidden'>
                    <div
                        className={`h-full min-h-0 flex-col ${activeTab === 'primary-key' ? 'flex' : 'hidden'}`}
                    >
                        <PrimaryKeyView
                            connectionID={connectionID}
                            dbName={dbName}
                            environmentKey={environmentKey}
                            schema={schema}
                            tableName={tableName}
                            refreshKey={refreshKey}
                            readOnlyMode={readOnlyMode}
                            isActive={isActive && activeTab === 'primary-key'}
                            tableColumns={tableColumns}
                            onActionsChange={setPkActions}
                            onDirtyCountChange={handlePkDirty}
                            driver={driver}
                        />
                    </div>

                    <div
                        className={`h-full min-h-0 flex-col ${activeTab === 'unique-keys' ? 'flex' : 'hidden'}`}
                    >
                        <IndexInfoView
                            connectionID={connectionID}
                            dbName={dbName}
                            environmentKey={environmentKey}
                            schema={schema}
                            tableName={tableName}
                            filterText=''
                            refreshKey={refreshKey}
                            readOnlyMode={readOnlyMode}
                            isActive={isActive && activeTab === 'unique-keys'}
                            tableColumns={tableColumns}
                            onActionsChange={setUniqueActions}
                            onDirtyCountChange={handleUniqueDirty}
                            uniqueOnly
                        />
                    </div>

                    <div
                        className={`h-full min-h-0 flex-col ${activeTab === 'indexes' ? 'flex' : 'hidden'}`}
                    >
                        <IndexInfoView
                            connectionID={connectionID}
                            dbName={dbName}
                            environmentKey={environmentKey}
                            schema={schema}
                            tableName={tableName}
                            filterText=''
                            refreshKey={refreshKey}
                            readOnlyMode={readOnlyMode}
                            isActive={isActive && activeTab === 'indexes'}
                            tableColumns={tableColumns}
                            onActionsChange={setIndexActions}
                            onDirtyCountChange={handleIndexDirty}
                        />
                    </div>

                    <div
                        className={`h-full min-h-0 flex-col ${activeTab === 'check-constraints' ? 'flex' : 'hidden'}`}
                    >
                        <CheckConstraintsView
                            connectionID={connectionID}
                            dbName={dbName}
                            environmentKey={environmentKey}
                            schema={schema}
                            tableName={tableName}
                            refreshKey={refreshKey}
                            readOnlyMode={readOnlyMode}
                            isActive={isActive && activeTab === 'check-constraints'}
                            onActionsChange={setCheckActions}
                            onDirtyCountChange={handleCheckDirty}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
