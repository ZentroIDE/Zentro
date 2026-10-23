// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Bell,
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    Info,
    Trash2,
    ArrowUpRight,
    FolderOpen,
    RotateCw,
    Copy,
    Eye,
} from 'lucide-react';
import {
    useNotificationStore,
    type AppNotification,
    type NotificationAction,
} from '../../stores/notificationStore';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../ui';
import { interactiveIconAction, interactiveTransparentHover } from '../ui';
import { cn } from '../../lib/cn';

const timestampFormatter = new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
});

function getLevelDisplay(entry: AppNotification) {
    switch (entry.level) {
        case 'success':
            return {
                icon: CheckCircle2,
                tone: 'text-success',
                cardClassName: 'bg-success/6',
            };
        case 'warning':
            return {
                icon: AlertTriangle,
                tone: 'text-warning',
                cardClassName: 'bg-warning/8',
            };
        case 'error':
            return {
                icon: AlertCircle,
                tone: 'text-destructive',
                cardClassName: 'bg-destructive/6',
            };
        default:
            return {
                icon: Info,
                tone: 'text-accent',
                cardClassName: 'bg-accent/6',
            };
    }
}

function getActionIcon(action: NotificationAction) {
    const key = `${action.id} ${action.label}`.toLowerCase();
    if (key.includes('folder') || key.includes('directory')) return FolderOpen;
    if (key.includes('retry') || key.includes('refresh') || key.includes('rerun')) return RotateCw;
    if (key.includes('copy')) return Copy;
    if (key.includes('view') || key.includes('show')) return Eye;
    return ArrowUpRight;
}

export const StatusBarNotifications: React.FC = () => {
    const entries = useNotificationStore(state => state.entries);
    const unreadCount = useNotificationStore(state => state.unreadCount);
    const markAllRead = useNotificationStore(state => state.markAllRead);
    const clearAll = useNotificationStore(state => state.clearAll);
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open || unreadCount === 0) return;
        markAllRead();
    }, [markAllRead, open, unreadCount]);

    const visibleEntries = React.useMemo(() => [...entries].reverse(), [entries]);
    const triggerLabel =
        unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications';

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant='ghost'
                    size='micro'
                    className={cn('relative text-background!', interactiveTransparentHover)}
                    aria-label={triggerLabel}
                    title={triggerLabel}
                >
                    <Bell size={12} />
                    {unreadCount > 0 && (
                        <span
                            aria-hidden
                            className='absolute right-0.5 top-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-background'
                        />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side='top'
                align='end'
                sideOffset={6}
                className='w-[420px] overflow-hidden border-border/70 bg-card/98 p-0 shadow-elevation-lg backdrop-blur-sm'
                onOpenAutoFocus={event => event.preventDefault()}
            >
                <div className='border-b border-border/70 px-4 py-3'>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='text-small font-semibold text-foreground'>
                                Notifications
                            </p>
                        </div>
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className={interactiveIconAction}
                            onClick={clearAll}
                            disabled={visibleEntries.length === 0}
                            aria-label='Clear all notifications'
                            title='Clear all notifications'
                        >
                            <Trash2 size={14} />
                        </Button>
                    </div>
                </div>
                {visibleEntries.length === 0 ? (
                    <div className='px-4 py-8 text-center'>
                        <div className='mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-muted/35 text-muted-foreground'>
                            <Bell size={16} />
                        </div>
                        <p className='mt-3 text-small font-medium text-foreground'>
                            No important notifications yet.
                        </p>
                        <p className='mt-1 text-label text-muted-foreground'>
                            Exports, failures, and follow-up actions will appear here.
                        </p>
                    </div>
                ) : (
                    <div className='max-h-[420px] overflow-y-auto px-3 py-3'>
                        <div className='space-y-2'>
                            {visibleEntries.map(entry => {
                                const display = getLevelDisplay(entry);
                                const Icon = display.icon;
                                const actions = entry.actions ?? [];
                                return (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            'rounded-md px-3 py-3 transition-colors',
                                            entry.read
                                                ? 'bg-muted/22'
                                                : 'bg-muted/34 shadow-elevation-xs',
                                            display.cardClassName,
                                        )}
                                    >
                                        <div className='flex items-start gap-3'>
                                            <Icon
                                                size={15}
                                                className={cn('mt-1 shrink-0', display.tone)}
                                            />
                                            <div className='min-w-0 flex-1'>
                                                <p className='whitespace-pre-wrap break-words text-small leading-5 text-foreground'>
                                                    {entry.message}
                                                </p>
                                                <div className='mt-3 flex items-end justify-between gap-3'>
                                                    <div className='flex min-w-0 items-center gap-2 text-label text-muted-foreground'>
                                                        {!entry.read && (
                                                            <span className='inline-flex h-2 w-2 shrink-0 rounded-full bg-accent' />
                                                        )}
                                                        <span>
                                                            {timestampFormatter.format(
                                                                entry.timestamp,
                                                            )}
                                                        </span>
                                                    </div>
                                                    {actions.length > 0 && (
                                                        <div className='flex shrink-0 flex-wrap justify-end gap-1.5'>
                                                            {actions.map(action => (
                                                                <NotificationActionButton
                                                                    key={action.id}
                                                                    action={action}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};

function NotificationActionButton({ action }: { action: NotificationAction }) {
    const Icon = getActionIcon(action);
    return (
        <Button
            type='button'
            variant='ghost'
            size='icon'
            className={cn('h-7 w-7', interactiveIconAction)}
            aria-label={action.label}
            title={action.label}
            onClick={() => {
                void Promise.resolve(action.run()).catch(() => {});
            }}
        >
            <Icon size={14} />
            <span className='sr-only'>{action.label}</span>
        </Button>
    );
}
