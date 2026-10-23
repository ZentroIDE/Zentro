// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { app } from '../../../../wailsjs/go/models';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useEditorStore } from '../../../stores/editorStore';
import { useAuditQuery } from '../../../components/sidebar/log/useAuditQuery';
import { LogFilterBar } from '../../../components/sidebar/log/LogFilterBar';
import { AuditLogView } from '../../../components/sidebar/log/AuditLogView';
import { RealtimeOutputView } from '../../../components/sidebar/log/RealtimeOutputView';
import { AppDebugLogView } from '../../../components/sidebar/log/AppDebugLogView';
import { ExplainResultView } from './ExplainResultView';

// Registered as the render() for three separate Bottom Panel ids
// ('audit'/'realtime'/'debug', see bottomPanels.tsx) — it reads its own
// active-tab and active-panel state from the stores (rather than taking them
// as props) since a registry render() is a plain no-arg function.
export const ResultPanelLogPane: React.FC = () => {
    const { activeBottomPanelId } = useLayoutStore();
    const { groups, activeGroupId } = useEditorStore();
    const activeQueryTabId = groups.find(group => group.id === activeGroupId)?.activeTabId;

    const [search, setSearch] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<'' | 'success' | 'error'>('');
    const [environmentFilter, setEnvironmentFilter] = React.useState<string>('all');

    const filter = React.useMemo<app.SQLAuditFilter>(
        () => ({
            search,
            status: statusFilter,
            profile: '',
            limit: 500,
            pinned_only: false,
        }),
        [search, statusFilter],
    );

    const { entries, reload } = useAuditQuery(filter);

    if (activeBottomPanelId === 'explain-plan' || activeBottomPanelId === 'explain-analyze') {
        const explainTabId = activeQueryTabId
            ? `${activeQueryTabId}::explain:${activeBottomPanelId === 'explain-analyze' ? 'analyze' : 'plan'}`
            : '';
        return (
            <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                <ExplainResultView tabId={explainTabId} />
            </div>
        );
    }

    return (
        <div className='flex h-full min-h-0 flex-col'>
            <LogFilterBar
                filter={filter}
                environmentFilter={environmentFilter}
                onChange={patch => {
                    if ('search' in patch) setSearch(patch.search ?? '');
                    if ('status' in patch)
                        setStatusFilter((patch.status ?? '') as '' | 'success' | 'error');
                }}
                onEnvironmentChange={setEnvironmentFilter}
                onReload={reload}
                activeView={activeBottomPanelId as 'audit' | 'realtime' | 'debug'}
            />
            <div className='min-h-0 flex-1'>
                {activeBottomPanelId === 'audit' && (
                    <AuditLogView
                        filter={filter}
                        entries={entries}
                        environmentFilter={environmentFilter}
                        reload={reload}
                    />
                )}
                {activeBottomPanelId === 'realtime' && <RealtimeOutputView />}
                {activeBottomPanelId === 'debug' && <AppDebugLogView />}
            </div>
        </div>
    );
};
