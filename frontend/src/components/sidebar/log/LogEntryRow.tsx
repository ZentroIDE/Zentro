// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { app } from '../../../../wailsjs/go/models';
import { cn } from '../../../lib/cn';
import { getEnvironmentLabel } from '../../../lib/projects';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '../../ui/context-menu';
import { EnvironmentBadge } from '../../shared/EnvironmentBadge';

interface Props {
    entry: app.SQLAuditEntry;
    onPaste: () => void;
    onPin: () => void;
    onCopy: () => void;
    onOpenInNewTab: () => void;
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export const LogEntryRow: React.FC<Props> = ({ entry, onPaste, onPin, onCopy, onOpenInNewTab }) => {
    const isError = Boolean(entry.error);
    const environmentLabel = getEnvironmentLabel(entry.env_key);
    const hasReason = Boolean(entry.reason?.trim());

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
                <div
                    className={cn(
                        'w-full border-b border-border/20 px-3 py-2 text-left transition-colors duration-fast last:border-none ui-interactive-surface',
                        isError ? 'bg-destructive/4' : '',
                    )}
                    title='Right-click for actions.'
                >
                    <div className='min-w-0'>
                        <div className='flex items-start justify-between gap-2'>
                            <div className='min-w-0 space-y-1'>
                                <div className='flex flex-wrap items-center gap-1.5'>
                                    <EnvironmentBadge
                                        label={environmentLabel}
                                        className='h-5 px-1.5 text-[11px] tracking-[0.08em]'
                                        title={`Executed in ${environmentLabel}`}
                                    />
                                    <span className='min-w-0 truncate text-label text-muted-foreground'>
                                        {entry.profile}
                                        {entry.database ? ` / ${entry.database}` : ''}
                                    </span>
                                </div>
                                <div className='text-label text-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-full'>
                                    {entry.statement_text}
                                </div>
                            </div>

                            <div className='shrink-0 space-y-0.5 text-right text-label text-muted-foreground'>
                                <div>{formatDuration(entry.duration_ms)}</div>
                                <div>{formatTime(entry.executed_at)}</div>
                            </div>
                        </div>

                        {hasReason && (
                            <div className='mt-1 flex items-start gap-2 text-label text-muted-foreground'>
                                <span className='shrink-0 text-[10px] uppercase tracking-[0.12em] text-foreground/55'>
                                    Reason
                                </span>
                                <span className='line-clamp-2 text-foreground/72'>
                                    {entry.reason}
                                </span>
                            </div>
                        )}

                        {isError && (
                            <div className='mt-1 text-label text-destructive whitespace-nowrap overflow-hidden text-ellipsis'>
                                {entry.error}
                            </div>
                        )}
                    </div>
                </div>
            </ContextMenuTrigger>

            <ContextMenuContent className='min-w-[180px]'>
                <ContextMenuItem onSelect={onPaste}>Paste Into Editor</ContextMenuItem>
                <ContextMenuItem onSelect={onCopy}>Copy SQL</ContextMenuItem>
                <ContextMenuItem onSelect={onOpenInNewTab}>Open In New Tab</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={onPin}>{entry.pinned ? 'Unpin' : 'Pin'}</ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};
