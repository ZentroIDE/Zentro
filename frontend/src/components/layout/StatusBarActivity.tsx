// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { getCommandById } from '../../lib/shortcutRegistry';
import { useShortcutHint } from '../../lib/shortcutDisplay';
import { selectRunningJobs, useActivityStore } from '../../stores/activityStore';
import { cn } from '../../lib/cn';
import { Button, HoverCard, HoverCardContent, HoverCardTrigger, Progress } from '../ui';
import { interactiveTransparentHover } from '../ui/contract';
import type { Job } from '../../platform/app-api/contracts/job';

/** Determinate percent from a job's own done/total, or undefined (renders
 *  an indeterminate bar) when the job has no known total yet. */
function jobPercent(job: Job): number | undefined {
    const { done, total } = job.progress;
    return total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : undefined;
}

/** Status bar indicator for running Activity-panel jobs (query/export/
 *  import). Hidden entirely when nothing is running.
 *  - The bar itself always shows the most recently started running job's
 *    own progress — the one a user just kicked off is what they're
 *    watching, not whichever has been running longest.
 *  - Hovering opens a passive preview of every running job's progress
 *    (no Cancel/Kill here — those stay in the Activity panel).
 *  - Clicking opens the Activity panel — same as the Ctrl+Shift+Y
 *    shortcut — regardless of where on the trigger it lands, since Radix's
 *    HoverCard only intercepts pointerenter/leave, not click. */
export const StatusBarActivity: React.FC = () => {
    // selectRunningJobs derives a new array every call (map + filter), so
    // without useShallow's shallow-equal memoization, every store tick
    // (even an unrelated one) hands useSyncExternalStore a new reference,
    // which re-renders, which calls the selector again, forever — React
    // flags this as "getSnapshot should be cached" before it snowballs
    // into "Maximum update depth exceeded".
    const runningJobs = useActivityStore(useShallow(selectRunningJobs));
    const hint = useShortcutHint('layout.toggleActivityPanel');

    if (runningJobs.length === 0) return null;

    // selectRunningJobs is oldest-first (matches JobService.List()), so the
    // most recently started running job is the last element.
    const latestJob = runningJobs[runningJobs.length - 1];
    const latestPct = jobPercent(latestJob);
    const openActivityPanel = () => getCommandById('layout.toggleActivityPanel')?.action();

    return (
        <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
                <Button
                    variant='ghost'
                    size='micro'
                    className={cn('gap-1.5 text-background!', interactiveTransparentHover)}
                    aria-label='Open Activity panel'
                    title={`Open Activity panel (${hint})`}
                    onClick={openActivityPanel}
                >
                    <Loader2 size={12} className='animate-spin shrink-0' aria-hidden />
                    <span className='max-w-32 truncate'>
                        {runningJobs.length} running · {latestJob.title}
                    </span>
                    <Progress
                        value={latestPct}
                        size='sm'
                        className='w-12 shrink-0 bg-background/25'
                        fillClassName='bg-background/90!'
                        label={`${latestJob.title} progress`}
                    />
                </Button>
            </HoverCardTrigger>
            <HoverCardContent side='top' align='end' sideOffset={8} className='w-80'>
                <p className='text-small font-semibold text-foreground mb-2'>
                    {runningJobs.length} job{runningJobs.length === 1 ? '' : 's'} running
                </p>
                <div className='flex flex-col gap-2.5 max-h-64 overflow-auto'>
                    {[...runningJobs].reverse().map(job => {
                        const pct = jobPercent(job);
                        return (
                            <div key={job.id} className='flex flex-col gap-1'>
                                <div className='flex items-center justify-between gap-2 text-label'>
                                    <span
                                        className='truncate font-mono text-foreground'
                                        title={job.title}
                                    >
                                        {job.title}
                                    </span>
                                    <span className='shrink-0 text-muted-foreground'>
                                        {pct !== undefined ? `${pct}%` : '…'}
                                    </span>
                                </div>
                                <Progress value={pct} size='sm' label={`${job.title} progress`} />
                            </div>
                        );
                    })}
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};
