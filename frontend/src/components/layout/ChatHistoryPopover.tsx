// SPDX-License-Identifier: GPL-3.0-only

import React, { useMemo, useState } from 'react';
import { History, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '../ui';
import type { AISessionSummary } from '../../lib/aiAssistant';
import { relativeTime } from '../../lib/aiTime';
import { cn } from '../../lib/cn';

interface ChatHistoryPopoverProps {
    sessions: AISessionSummary[];
    currentId: string | null;
    disabled: boolean;
    onOpen: (id: string) => void;
    onNew: () => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
}

function Tile() {
    return (
        <span className='flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground'>
            <MessageSquare className='size-3.5' aria-hidden />
        </span>
    );
}

// ChatHistoryPopover lists the saved chats of this project. It opens on click.
// A row shows its title, a short line about it, and when it last changed.
// Hovering or focusing a row swaps the time for rename and delete. Delete asks
// once inside the row before it removes anything.
export function ChatHistoryPopover({
    sessions,
    currentId,
    disabled,
    onOpen,
    onNew,
    onRename,
    onDelete,
}: ChatHistoryPopoverProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return sessions;
        return sessions.filter(item => item.title.toLowerCase().includes(needle));
    }, [sessions, query]);

    const finishRename = (id: string) => {
        const title = draft.trim();
        setEditingId(null);
        if (title) onRename(id, title);
    };

    const reset = () => {
        setEditingId(null);
        setConfirmId(null);
        setQuery('');
    };

    return (
        <Popover
            open={open}
            onOpenChange={next => {
                setOpen(next);
                if (!next) reset();
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label='Chat history'
                    title='Chat history'
                    disabled={disabled}
                >
                    <History className='size-3.5' aria-hidden />
                </Button>
            </PopoverTrigger>
            <PopoverContent align='end' className='flex w-86 flex-col gap-2 p-2'>
                <div className='flex gap-1.5'>
                    <Input
                        type='search'
                        value={query}
                        placeholder='Search chats…'
                        aria-label='Search chats'
                        onChange={event => setQuery(event.target.value)}
                    />
                    <Button
                        type='button'
                        variant='default'
                        size='sm'
                        onClick={() => {
                            setOpen(false);
                            reset();
                            onNew();
                        }}
                    >
                        New chat
                    </Button>
                </div>
                <div className='flex max-h-80 flex-col gap-0.5 overflow-y-auto'>
                    {shown.length === 0 && (
                        <p className='px-2 py-3 text-label text-muted-foreground'>
                            {sessions.length === 0 ? 'No saved chats yet.' : 'No chats match.'}
                        </p>
                    )}
                    {shown.map(session => {
                        const isCurrent = session.id === currentId;
                        if (confirmId === session.id) {
                            return (
                                <div
                                    key={session.id}
                                    className='flex items-center gap-2.5 rounded-md bg-destructive/10 px-2 py-1.5'
                                >
                                    <div className='min-w-0 flex-1'>
                                        <p>Delete this chat?</p>
                                        <p className='truncate text-label text-muted-foreground'>
                                            {session.title}
                                        </p>
                                    </div>
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        onClick={() => setConfirmId(null)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type='button'
                                        variant='destructive'
                                        onClick={() => {
                                            setConfirmId(null);
                                            onDelete(session.id);
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            );
                        }
                        if (editingId === session.id) {
                            return (
                                <div
                                    key={session.id}
                                    className='flex items-center gap-2.5 rounded-md px-2 py-1.5'
                                >
                                    <Input
                                        autoFocus
                                        value={draft}
                                        aria-label='Chat title'
                                        className='min-w-0 flex-1'
                                        onChange={event => setDraft(event.target.value)}
                                        onKeyDown={event => {
                                            if (event.key === 'Enter') finishRename(session.id);
                                            if (event.key === 'Escape') setEditingId(null);
                                        }}
                                        onBlur={() => finishRename(session.id)}
                                    />
                                </div>
                            );
                        }
                        return (
                            <div
                                key={session.id}
                                className={cn(
                                    'group relative flex items-center gap-1 rounded-md pr-1.5',
                                    'hover:bg-(--state-hover-bg)',
                                    isCurrent && 'bg-(--state-selected-bg)',
                                )}
                            >
                                <Button
                                    type='button'
                                    variant='ghost'
                                    aria-current={isCurrent}
                                    className='min-h-11 min-w-0 flex-1 justify-start gap-2.5 [height:auto] px-2 py-1.5 [--btn-ghost-bg-active:transparent] [--btn-ghost-bg-hover:transparent]'
                                    onClick={() => {
                                        setOpen(false);
                                        reset();
                                        onOpen(session.id);
                                    }}
                                >
                                    <span className='flex min-w-0 flex-1 flex-col items-start'>
                                        <span className='w-full truncate text-left'>
                                            {session.title}
                                        </span>
                                        <span className='w-full truncate text-left text-label text-muted-foreground'>
                                            {session.turnCount} messages · {session.model}
                                        </span>
                                    </span>
                                </Button>
                                <span className='min-w-12 shrink-0 text-right text-label text-muted-foreground group-focus-within:invisible group-hover:invisible'>
                                    {relativeTime(session.updatedAt)}
                                </span>
                                <span className='absolute top-1/2 right-1.5 hidden -translate-y-1/2 items-center gap-0.5 group-focus-within:flex group-hover:flex'>
                                    <Button
                                        type='button'
                                        size='icon'
                                        variant='ghost'
                                        aria-label={`Rename ${session.title}`}
                                        title='Rename'
                                        onClick={() => {
                                            setEditingId(session.id);
                                            setDraft(session.title);
                                        }}
                                    >
                                        <Pencil className='size-3.5' aria-hidden />
                                    </Button>
                                    <Button
                                        type='button'
                                        size='icon'
                                        variant='ghost'
                                        tone='destructive'
                                        aria-label={`Delete ${session.title}`}
                                        title='Delete'
                                        className='text-destructive'
                                        onClick={() => setConfirmId(session.id)}
                                    >
                                        <Trash2 className='size-3.5' aria-hidden />
                                    </Button>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
