// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { CheckCircle2, CircleSlash, Loader2, TriangleAlert, XCircle } from 'lucide-react';
import {
    Badge,
    Button,
    InlineConfirm,
    Progress,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../../shared/kernel';
import { useToast } from '../../components/layout/Toast';
import type { Job } from '../../platform/app-api/contracts/job';
import { useElapsed } from './useElapsed';

const KIND_LABEL: Record<Job['kind'], string> = {
    query: 'QUERY',
    export: 'EXPORT',
    import: 'IMPORT',
};

function StatusIcon({ status }: { status: Job['status'] }) {
    switch (status) {
        case 'queued':
        case 'running':
            return <Loader2 size={14} className='animate-spin text-info' aria-hidden />;
        case 'cancelling':
            return <TriangleAlert size={14} className='text-warning' aria-hidden />;
        case 'succeeded':
            return <CheckCircle2 size={14} className='text-success' aria-hidden />;
        case 'failed':
            return <XCircle size={14} className='text-destructive' aria-hidden />;
        case 'cancelled':
            return <CircleSlash size={14} className='text-muted-foreground' aria-hidden />;
    }
}

// Cancelling a query is cheap and reversible (nothing written outside the
// result panel) — export/import cancel has a real consequence worth
// naming in the confirm itself, not just a generic "Cancel this job?".
const CANCEL_CONFIRM_LABEL: Record<Job['kind'], string> = {
    query: 'Cancel this query?',
    export: 'Cancel this export? The partial file will be discarded.',
    import: 'Cancel this import? Rows already inserted may remain.',
};

const STATUS_LABEL: Record<Job['status'], string> = {
    queued: 'Queued',
    running: 'Running',
    cancelling: 'Cancelling',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelled: 'Cancelled',
};

interface JobRowProps {
    job: Job;
}

export function JobRow({ job }: JobRowProps) {
    const [cancelling, setCancelling] = useState(false);
    const [killing, setKilling] = useState(false);
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const [confirmingKill, setConfirmingKill] = useState(false);
    const { toast } = useToast();

    const isLive =
        job.status === 'queued' || job.status === 'running' || job.status === 'cancelling';
    const elapsed = useElapsed(job.startedAt, job.finishedAt, isLive);
    const startedAtText = new Date(job.startedAt).toLocaleString();
    const finishedAtText = job.finishedAt ? new Date(job.finishedAt).toLocaleString() : undefined;

    const canCancel = job.capabilities.cancel && job.status === 'running';
    // Force kill only once a soft cancel is already in flight — it ends
    // the whole backend session (not just the current statement), so it's
    // offered as the escalation when ctx cancellation alone hasn't landed
    // yet, not as a first move.
    const canKill = job.capabilities.kill && job.status === 'cancelling';

    // The job can leave 'running'/'cancelling' on its own (e.g. it
    // finished before a pending confirm was answered) — drop the inline
    // confirm so it doesn't linger over a row that can no longer act on it.
    React.useEffect(() => {
        if (!canCancel) setConfirmingCancel(false);
    }, [canCancel]);
    React.useEffect(() => {
        if (!canKill) setConfirmingKill(false);
    }, [canKill]);

    const handleCancelConfirmed = async () => {
        setCancelling(true);
        try {
            const result = await getApiGateway().job.cancel(job.id);
            if (!result.ok) {
                toast.error(kernelErrorMessage(result.error), { source: 'activity.cancel-job' });
            }
        } finally {
            setCancelling(false);
            setConfirmingCancel(false);
        }
    };

    const handleKillConfirmed = async () => {
        setKilling(true);
        try {
            const result = await getApiGateway().job.kill(job.id);
            if (!result.ok) {
                toast.error(kernelErrorMessage(result.error), { source: 'activity.kill-job' });
            }
        } finally {
            setKilling(false);
            setConfirmingKill(false);
        }
    };

    const pct =
        job.progress.total && job.progress.total > 0
            ? Math.min(100, Math.round((job.progress.done / job.progress.total) * 100))
            : undefined;
    const showProgress =
        job.status === 'queued' || job.status === 'running' || job.status === 'cancelling';

    const rawCaption =
        job.status === 'failed' || job.status === 'cancelled'
            ? job.error || STATUS_LABEL[job.status]
            : job.progress.detail ||
              (job.progress.done > 0
                  ? `${job.progress.done.toLocaleString('en-US')}${job.progress.total ? ` / ${job.progress.total.toLocaleString('en-US')}` : ''}${job.progress.unit ? ` ${job.progress.unit}` : ''}${pct !== undefined ? ` (${pct}%)` : ''}`
                  : STATUS_LABEL[job.status]);
    // Suppress a caption that's just a repeat of the status label already
    // shown next to the StatusIcon — only surface it when it adds real
    // information (an error, a row count, a percent).
    const caption = rawCaption === STATUS_LABEL[job.status] ? undefined : rawCaption;

    return (
        <div className='border-b border-border/60 last:border-b-0'>
            <div className='grid grid-cols-[minmax(0,1fr)_150px_64px_auto] items-center gap-3 px-3 py-2 text-small'>
                <div className='min-w-0 flex flex-col gap-1'>
                    <div className='flex items-center gap-2 min-w-0'>
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        tabIndex={0}
                                        aria-label={STATUS_LABEL[job.status]}
                                        className='flex items-center shrink-0 cursor-help'
                                    >
                                        <StatusIcon status={job.status} />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side='top'>
                                    {STATUS_LABEL[job.status]}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <Badge variant='muted' className='shrink-0'>
                            {KIND_LABEL[job.kind]}
                        </Badge>
                        <span className='truncate font-mono text-foreground' title={job.title}>
                            {job.title}
                        </span>
                    </div>
                    {showProgress && <Progress value={pct} label={`${job.title} progress`} />}
                    {caption && (
                        <span
                            className={cn(
                                'truncate text-label',
                                job.status === 'failed'
                                    ? 'text-destructive'
                                    : 'text-muted-foreground',
                            )}
                            title={caption}
                        >
                            {caption}
                        </span>
                    )}
                </div>

                <div className='min-w-0 flex flex-col text-label text-muted-foreground'>
                    <span className='truncate'>{job.profileName || '—'}</span>
                    {job.database && <span className='truncate'>{job.database}</span>}
                </div>

                <TooltipProvider delayDuration={200}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                tabIndex={0}
                                className='font-mono text-muted-foreground cursor-help w-fit'
                            >
                                {elapsed}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side='top'>
                            <div className='flex flex-col gap-0.5 text-label'>
                                <span>Started {startedAtText}</span>
                                {finishedAtText && <span>Finished {finishedAtText}</span>}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <div className='flex justify-end gap-1.5'>
                    {canKill && confirmingKill ? (
                        <InlineConfirm
                            label='Force kill this job?'
                            confirmTitle='Yes, force kill — its open transaction is rolled back'
                            confirming={killing}
                            onConfirm={() => void handleKillConfirmed()}
                            onCancel={() => setConfirmingKill(false)}
                        />
                    ) : canCancel && confirmingCancel ? (
                        <InlineConfirm
                            label={CANCEL_CONFIRM_LABEL[job.kind]}
                            confirmTitle='Yes, cancel'
                            cancelTitle='Keep running'
                            confirming={cancelling}
                            onConfirm={() => void handleCancelConfirmed()}
                            onCancel={() => setConfirmingCancel(false)}
                        />
                    ) : (
                        <>
                            {canCancel && (
                                <Button
                                    variant='ghost'
                                    tone='destructive'
                                    size='micro'
                                    onClick={() => setConfirmingCancel(true)}
                                >
                                    Cancel
                                </Button>
                            )}
                            {canKill && (
                                <Button
                                    variant='destructive'
                                    size='micro'
                                    onClick={() => setConfirmingKill(true)}
                                    title='Terminates the backend session; its open transaction is rolled back'
                                >
                                    Force kill
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
