// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { app } from '../../../../wailsjs/go/models';
import { cn } from '../../../lib/cn';
import { TAB_STRIP_BAR_CLASS, TAB_STRIP_ITEM_CLASS, TAB_STRIP_ITEM_ACTIVE_CLASS } from '../../ui';
import { useSidebarPanelState } from '../../../stores/sidebarUiStore';
import { LOGS_PANEL_STATE_DEFAULT } from '../sidebarPanelStateDefaults';
import { LogFilterBar } from './LogFilterBar';
import { AuditLogView } from './AuditLogView';
import { RealtimeOutputView } from './RealtimeOutputView';
import { AppDebugLogView } from './AppDebugLogView';
import { useAuditQuery } from './useAuditQuery';

type LogView = 'audit' | 'realtime' | 'debug';

const VIEWS: { id: LogView; label: string }[] = [
    { id: 'audit', label: 'Audit' },
    { id: 'realtime', label: 'Realtime' },
    { id: 'debug', label: 'App Log' },
];

export const LogPanel: React.FC = () => {
    const [panelState, setPanelState] = useSidebarPanelState(
        'primary',
        'logs',
        LOGS_PANEL_STATE_DEFAULT,
    );
    const activeView = panelState.activeView as LogView;

    const filter: app.SQLAuditFilter = {
        search: panelState.search,
        status: panelState.statusFilter,
        profile: '',
        limit: 500,
        pinned_only: false,
    };

    const { entries, reload } = useAuditQuery(filter);

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            <div className={cn(TAB_STRIP_BAR_CLASS, 'rounded-t-md')} role='tablist'>
                {VIEWS.map(v => {
                    const isActive = activeView === v.id;
                    return (
                        <div
                            key={v.id}
                            role='tab'
                            aria-selected={isActive}
                            tabIndex={0}
                            className={cn(
                                TAB_STRIP_ITEM_CLASS,
                                'rounded-t-md',
                                isActive && TAB_STRIP_ITEM_ACTIVE_CLASS,
                            )}
                            onClick={() => setPanelState(s => ({ ...s, activeView: v.id }))}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setPanelState(s => ({ ...s, activeView: v.id }));
                                }
                            }}
                        >
                            {v.label}
                        </div>
                    );
                })}
            </div>

            <LogFilterBar
                filter={filter}
                onChange={patch => {
                    if ('search' in patch)
                        setPanelState(s => ({ ...s, search: patch.search ?? s.search }));
                    if ('status' in patch)
                        setPanelState(s => ({
                            ...s,
                            statusFilter: (patch.status ?? s.statusFilter) as
                                | ''
                                | 'success'
                                | 'error',
                        }));
                }}
                environmentFilter={panelState.environmentFilter ?? 'all'}
                onEnvironmentChange={value =>
                    setPanelState(s => ({ ...s, environmentFilter: value }))
                }
                onReload={reload}
                activeView={activeView}
            />

            <div className='min-h-0 flex-1 overflow-hidden'>
                {activeView === 'audit' && (
                    <AuditLogView
                        filter={filter}
                        entries={entries}
                        environmentFilter={panelState.environmentFilter ?? 'all'}
                        reload={reload}
                    />
                )}
                {activeView === 'realtime' && <RealtimeOutputView />}
                {activeView === 'debug' && <AppDebugLogView />}
            </div>
        </div>
    );
};
