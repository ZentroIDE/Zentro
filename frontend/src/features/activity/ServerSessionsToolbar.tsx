// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { RefreshCw } from 'lucide-react';
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import type { ServerSessionFilter } from './useServerSessions';
import { REFRESH_INTERVALS, type ServerSessionsController } from './useServerSessionsController';

type ServerSessionsToolbarProps = Pick<
    ServerSessionsController,
    'filter' | 'setFilter' | 'intervalMs' | 'setIntervalMs' | 'filtered' | 'loading' | 'refresh'
>;

/** Sessions tab's toolbar — filter, poll interval, session count, and a
 *  refresh icon — rendered on the shared Jobs/Sessions tab row rather than
 *  its own header line (see ActivityPanel.tsx). */
export function ServerSessionsToolbar({
    filter,
    setFilter,
    intervalMs,
    setIntervalMs,
    filtered,
    loading,
    refresh,
}: ServerSessionsToolbarProps) {
    return (
        <div className='flex items-center gap-2'>
            <Select value={filter} onValueChange={v => setFilter(v as ServerSessionFilter)}>
                <SelectTrigger size='sm' className='w-24'>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value='active'>Active</SelectItem>
                    <SelectItem value='all'>All</SelectItem>
                    <SelectItem value='mine'>Mine</SelectItem>
                </SelectContent>
            </Select>
            <Select value={String(intervalMs)} onValueChange={v => setIntervalMs(Number(v))}>
                <SelectTrigger size='sm' className='w-20'>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {REFRESH_INTERVALS.map(opt => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <span className='text-label text-muted-foreground whitespace-nowrap'>
                {filtered.length} sessions
            </span>
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => void refresh()}
                            disabled={loading}
                            aria-label='Refresh sessions'
                        >
                            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side='top'>Refresh</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
