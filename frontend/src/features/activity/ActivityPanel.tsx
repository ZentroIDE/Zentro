// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
    Button,
    DataEmpty,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../../components/ui';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../../shared/kernel';
import { useToast } from '../../components/layout/Toast';
import { selectJobCount, selectJobList, useActivityStore } from '../../stores/activityStore';
import { JobRow } from './JobRow';
import { ServerSessionsView } from './ServerSessionsView';
import { ServerSessionsToolbar } from './ServerSessionsToolbar';
import { useServerSessionsController } from './useServerSessionsController';

const COLUMN_HEADER_CLASS =
    'grid grid-cols-[minmax(0,1fr)_150px_64px_auto] gap-3 border-b border-border px-3 py-1.5 text-label font-semibold uppercase tracking-wide text-muted-foreground';

function JobsList() {
    // selectJobList derives a new array every call — see StatusBarActivity's
    // useShallow comment for why this must be wrapped.
    const jobs = useActivityStore(useShallow(selectJobList));
    // selectJobList is oldest-first (matches JobService.List()'s insertion
    // order, which other consumers like StatusBarActivity's "latest
    // running job" rely on) — reversed only for display here, so the job a
    // user just started lands at the top instead of the bottom.
    const displayJobs = React.useMemo(() => [...jobs].reverse(), [jobs]);

    if (jobs.length === 0) {
        return (
            <div className='flex flex-1 items-center justify-center'>
                <DataEmpty
                    title='No jobs yet'
                    description='Heavy queries, imports and exports show up here while they run.'
                />
            </div>
        );
    }

    return (
        <div className='flex h-full min-h-0 flex-col'>
            <div className={COLUMN_HEADER_CLASS}>
                <span>Job</span>
                <span>Connection</span>
                <span>Elapsed</span>
                <span />
            </div>
            <div className='flex-1 min-h-0 overflow-auto'>
                {displayJobs.map(job => (
                    <JobRow key={job.id} job={job} />
                ))}
            </div>
        </div>
    );
}

export function ActivityPanel() {
    const jobCount = useActivityStore(selectJobCount);
    // Only read here for hasFinished — JobsList re-selects independently
    // for its own render, a second cheap subscription to the same store.
    const jobs = useActivityStore(useShallow(selectJobList));
    const [clearing, setClearing] = useState(false);
    const [tab, setTab] = useState<'jobs' | 'sessions'>('jobs');
    const { toast } = useToast();

    // Lifted out of ServerSessionsView so the toolbar (rendered here, on
    // the shared tab row) and the session list (rendered in TabsContent)
    // share one poll/filter/confirm state instead of each owning their
    // own — also means the filter/interval choice now survives switching
    // away to the Jobs tab and back, instead of resetting every time.
    const sessions = useServerSessionsController(tab === 'sessions');

    const hasFinished = jobs.some(
        job => job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled',
    );

    const handleClearFinished = async () => {
        setClearing(true);
        try {
            const result = await getApiGateway().job.clearFinished();
            if (!result.ok) {
                toast.error(kernelErrorMessage(result.error), {
                    source: 'activity.clear-finished',
                });
                return;
            }
            useActivityStore.getState().removeJobs(result.data);
        } finally {
            setClearing(false);
        }
    };

    return (
        <Tabs
            value={tab}
            onValueChange={v => setTab(v as 'jobs' | 'sessions')}
            className='flex h-full min-h-0 flex-col'
        >
            <div className='flex items-center gap-2 border-b border-border px-2 pt-1'>
                <TabsList>
                    <TabsTrigger value='jobs'>
                        Jobs <span className='text-muted-foreground ml-1'>{jobCount}</span>
                    </TabsTrigger>
                    <TabsTrigger value='sessions'>Sessions</TabsTrigger>
                </TabsList>
                <div className='flex-1' />
                {tab === 'jobs' ? (
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant='ghost'
                                    tone='destructive'
                                    size='icon'
                                    disabled={!hasFinished || clearing}
                                    onClick={() => void handleClearFinished()}
                                    aria-label='Clear finished jobs'
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top'>Clear finished</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : sessions.supported ? (
                    <ServerSessionsToolbar
                        filter={sessions.filter}
                        setFilter={sessions.setFilter}
                        intervalMs={sessions.intervalMs}
                        setIntervalMs={sessions.setIntervalMs}
                        filtered={sessions.filtered}
                        loading={sessions.loading}
                        refresh={sessions.refresh}
                    />
                ) : null}
            </div>
            <TabsContent value='jobs' className='flex-1 min-h-0 mt-0'>
                <JobsList />
            </TabsContent>
            <TabsContent value='sessions' className='flex-1 min-h-0 mt-0'>
                <ServerSessionsView
                    filtered={sessions.filtered}
                    error={sessions.error}
                    supported={sessions.supported}
                    killAction={sessions.killAction}
                    acting={sessions.acting}
                    isProduction={sessions.isProduction}
                    handleConfirmKill={sessions.handleConfirmKill}
                />
            </TabsContent>
        </Tabs>
    );
}
