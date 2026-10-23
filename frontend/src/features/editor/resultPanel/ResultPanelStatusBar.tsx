// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { CircleHelp, Pencil, Plus, Trash2 } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui';
import { formatDuration } from '../../../features/editor/resultPanelUtils';

interface ResultPanelPendingChangeCounts {
    add: number;
    update: number;
    del: number;
}

interface ResultPanelStatusBarProps {
    visibleRowCount: number;
    totalCount?: number;
    hasMore: boolean;
    duration: number;
    strategyLabel: string;
    strategyTooltip: string;
    executionTimeText: string | null;
    executionTimeTooltip: string;
    /** Rendered next to the execution time, for manual row fetching. */
    fetchControls?: React.ReactNode;
    hasPendingChanges: boolean;
    pendingChangeCounts: ResultPanelPendingChangeCounts;
}

/** Icon-only stat: the label lives in a tooltip so the status bar stays on one line. */
const StatusIcon: React.FC<{
    label: string;
    className?: string;
    children: React.ReactNode;
}> = ({ label, className, children }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <span
                tabIndex={0}
                aria-label={label}
                className={`flex items-center gap-0.5 whitespace-nowrap ${className ?? ''}`}
            >
                {children}
            </span>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-64'>
            {label}
        </TooltipContent>
    </Tooltip>
);

const ResultPanelStatusBarInner: React.FC<ResultPanelStatusBarProps> = ({
    visibleRowCount,
    totalCount,
    hasMore,
    duration,
    strategyLabel,
    strategyTooltip,
    executionTimeText,
    executionTimeTooltip,
    fetchControls,
    hasPendingChanges,
    pendingChangeCounts,
}) => {
    return (
        <TooltipProvider delayDuration={150}>
            <div className='flex items-center justify-center relative text-label text-muted-foreground shrink-0 p-1 bg-card rounded-md'>
                <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                    <span className='flex items-center gap-1 whitespace-nowrap'>
                        <strong>{visibleRowCount.toLocaleString()}</strong>
                        {hasMore ? (
                            <>
                                {' of '}
                                <strong>
                                    {totalCount !== undefined ? totalCount.toLocaleString() : '...'}
                                </strong>
                            </>
                        ) : null}
                        {' rows '}
                        {formatDuration(duration)}
                    </span>
                    <StatusIcon
                        label={
                            strategyTooltip
                                ? `Strategy: ${strategyLabel}. ${strategyTooltip}`
                                : `Strategy: ${strategyLabel}`
                        }
                    >
                        <CircleHelp size={13} />
                    </StatusIcon>
                    {executionTimeText &&
                        (executionTimeTooltip ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        tabIndex={0}
                                        aria-label={`Executed ${executionTimeText}`}
                                        className='whitespace-nowrap'
                                    >
                                        Executed {executionTimeText}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side='top' className='max-w-64'>
                                    {executionTimeTooltip}
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            <span className='whitespace-nowrap'>Executed {executionTimeText}</span>
                        ))}
                    {fetchControls}
                </div>

                <div className='ml-auto flex items-center gap-3'>
                    {hasPendingChanges && (
                        <span className='flex gap-2 text-label'>
                            <StatusIcon
                                label={`Added rows: ${pendingChangeCounts.add}`}
                                className='text-success'
                            >
                                <Plus size={13} />
                                {pendingChangeCounts.add}
                            </StatusIcon>
                            <StatusIcon
                                label={`Updated rows: ${pendingChangeCounts.update}`}
                                className='text-primary'
                            >
                                <Pencil size={12} />
                                {pendingChangeCounts.update}
                            </StatusIcon>
                            <StatusIcon
                                label={`Deleted rows: ${pendingChangeCounts.del}`}
                                className='text-destructive'
                            >
                                <Trash2 size={12} />
                                {pendingChangeCounts.del}
                            </StatusIcon>
                        </span>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
};

export const ResultPanelStatusBar = React.memo(ResultPanelStatusBarInner);
