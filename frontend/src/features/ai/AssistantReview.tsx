// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Button, Textarea } from '../../components/ui';
import { sensitiveLabel, type AIPreview, type AISensitiveMatch } from '../../lib/aiAssistant';
import { readableBody } from './rowApproval';

interface NoticeProps {
    children: React.ReactNode;
}

// Notice is the strip stacked on top of the message box. It only exists while
// the assistant needs an answer from the user.
function Notice({ children }: NoticeProps) {
    return (
        <div className='flex flex-col gap-2 rounded-t-md border-b border-border bg-card p-2.5'>
            {children}
        </div>
    );
}

interface SensitiveNoticeProps {
    matches: AISensitiveMatch[];
    busy: boolean;
    onKeep: () => void;
}

// SensitiveNotice holds a request that looks like it carries personal or
// secret data. It names what was found, where in the request, and shows the
// text around it, so the user can tell a real phone number from an amount.
// The text is shown on this computer only; nothing has been sent.
export function SensitiveNotice({ matches, busy, onKeep }: SensitiveNoticeProps) {
    return (
        <Notice>
            <div className='flex items-start justify-between gap-2'>
                <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <p className='text-small'>
                        Nothing was sent. Part of this request looks like personal or secret data.
                    </p>
                    <p className='text-label text-muted-foreground'>
                        Check the text below. If it is not sensitive (for example an amount or a
                        code), send anyway. Otherwise edit your message.
                    </p>
                </div>
                <Button type='button' disabled={busy} onClick={onKeep}>
                    Send anyway
                </Button>
            </div>
            <ul className='flex flex-col gap-1.5'>
                {matches.map(match => (
                    <li key={`${match.type}-${match.sample}`} className='flex flex-col gap-0.5'>
                        <span className='text-label font-semibold'>
                            {sensitiveLabel(match.type)}
                            {match.where ? ` in ${match.where}` : ''}
                        </span>
                        <span className='wrap-break-word rounded-md bg-muted px-1.5 py-1 font-mono text-label'>
                            {match.context || match.sample}
                        </span>
                    </li>
                ))}
            </ul>
        </Notice>
    );
}

interface AssistantReviewProps {
    review: AIPreview;
    providerLabel: string;
    busy: boolean;
    onAllowChat: () => void;
    onAllowProject: () => void;
    onAllowHost: () => void;
    onKeepSensitive: () => void;
    matches: AISensitiveMatch[];
    holdReason: string;
}

// AssistantReview asks once per chat before schema structure leaves the
// machine. "View" shows exactly what is sent. Holds for a new host or a
// sensitive-looking text keep their own prompt.
export function AssistantReview({
    review,
    providerLabel,
    busy,
    onAllowChat,
    onAllowProject,
    onAllowHost,
    onKeepSensitive,
    matches,
    holdReason,
}: AssistantReviewProps) {
    const [showData, setShowData] = useState(false);
    const [showFull, setShowFull] = useState(false);

    if (review.held && holdReason === 'host') {
        return (
            <Notice>
                <div className='flex items-start justify-between gap-2'>
                    <p className='min-w-0 flex-1 text-small'>
                        Zentro sends data only to hosts you allow. {review.host} is new.
                    </p>
                    <Button type='button' disabled={busy} onClick={onAllowHost}>
                        Allow
                    </Button>
                </div>
            </Notice>
        );
    }
    if (review.held && holdReason === 'sensitive') {
        return <SensitiveNotice matches={matches} busy={busy} onKeep={onKeepSensitive} />;
    }

    return (
        <Notice>
            <div className='flex items-start justify-between gap-2'>
                <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <p className='text-small'>
                        {providerLabel} can look up the structure of this database as it needs it:
                        tables, columns and keys. No rows.
                    </p>
                    <p className='text-label text-muted-foreground'>
                        {review.host}
                        {review.historyTurns > 0
                            ? ` · ${review.historyTurns} earlier messages`
                            : ''}
                    </p>
                </div>
                <div className='flex shrink-0 gap-1'>
                    <Button
                        type='button'
                        variant='outline'
                        aria-label='View data'
                        aria-expanded={showData}
                        onClick={() => setShowData(value => !value)}
                    >
                        View
                    </Button>
                    <Button
                        type='button'
                        variant='outline'
                        aria-label='Allow for this project'
                        title='Send without this review in every chat of this project. Change it in chat setup.'
                        disabled={busy}
                        onClick={onAllowProject}
                    >
                        Allow for project
                    </Button>
                    <Button
                        type='button'
                        aria-label='Allow for this chat'
                        title='Allow for this chat'
                        disabled={busy}
                        onClick={onAllowChat}
                    >
                        Allow
                    </Button>
                </div>
            </div>
            {showData && (
                <>
                    <Textarea
                        readOnly
                        value={review.data}
                        aria-label='Payload preview'
                        className='max-h-40 min-h-16'
                    />
                    <div>
                        <Button
                            type='button'
                            size='micro'
                            variant='ghost'
                            aria-expanded={showFull}
                            onClick={() => setShowFull(value => !value)}
                        >
                            {showFull ? 'Hide full request' : 'Show full request'}
                        </Button>
                    </div>
                    {showFull && (
                        <Textarea
                            readOnly
                            value={readableBody(review.body)}
                            aria-label='Full request'
                            className='max-h-40 min-h-16'
                        />
                    )}
                </>
            )}
        </Notice>
    );
}
