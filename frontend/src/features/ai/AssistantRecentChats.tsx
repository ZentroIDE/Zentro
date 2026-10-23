// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '../../components/ui';
import { relativeTime } from '../../lib/aiTime';
import type { AISessionSummary } from '../../lib/aiAssistant';

// How many earlier chats the empty chat offers. Three is enough to pick up
// yesterday's thread; the history button holds the rest.
export const RECENT_CHAT_COUNT = 3;

// recentChats picks the newest saved chats that have something in them,
// leaving out the one that is open.
export function recentChats(
    sessions: AISessionSummary[],
    currentId: string | undefined,
): AISessionSummary[] {
    return [...sessions]
        .filter(session => session.id !== currentId && session.turnCount > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_CHAT_COUNT);
}

type Props = {
    sessions: AISessionSummary[];
    onOpen: (id: string) => void;
};

// AssistantRecentChats sits under the starter questions of an empty chat. A
// click opens that chat, and the person carries on where they stopped.
export function AssistantRecentChats({ sessions, onOpen }: Props) {
    if (sessions.length === 0) return null;
    return (
        <div className='flex flex-col gap-1'>
            <p className='text-label font-semibold tracking-wide text-muted-foreground uppercase'>
                Continue a chat
            </p>
            <ul className='flex flex-col gap-0.5' aria-label='Recent chats'>
                {sessions.map(session => (
                    <li key={session.id}>
                        <Button
                            type='button'
                            variant='ghost'
                            className='h-auto w-full min-w-0 justify-between gap-3 px-2 py-1.5 text-left'
                            onClick={() => onOpen(session.id)}
                        >
                            <span className='flex min-w-0 items-center gap-2'>
                                <MessageSquare
                                    className='size-3.5 shrink-0 text-muted-foreground'
                                    aria-hidden
                                />
                                <span className='flex min-w-0 flex-col'>
                                    <span className='truncate text-small font-normal'>
                                        {session.title || 'Untitled chat'}
                                    </span>
                                    <span className='truncate text-label font-normal text-muted-foreground'>
                                        {session.turnCount} messages · {session.model}
                                    </span>
                                </span>
                            </span>
                            <span className='shrink-0 text-label font-normal text-muted-foreground'>
                                {relativeTime(session.updatedAt)}
                            </span>
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
