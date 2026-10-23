// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Minus, Plus } from 'lucide-react';

import type { SCFileStatus } from '../../../platform/app-api/types';
import { Button } from '../../ui';
import { interactiveSelected } from '../../ui/contract';
import { cn } from '../../../lib/cn';

const STATUS_ICON: Record<string, { label: string; className: string }> = {
    added: { label: 'A', className: 'text-success' },
    deleted: { label: 'D', className: 'text-destructive' },
    modified: { label: 'M', className: 'text-warning' },
    untracked: { label: '?', className: 'text-muted-foreground' },
};

function FileStatusBadge({ status }: { status: string }) {
    const meta = STATUS_ICON[status] ?? {
        label: '?',
        className: 'text-muted-foreground',
    };
    return (
        <span className={cn('shrink-0 text-label font-bold', meta.className)}>{meta.label}</span>
    );
}

interface SourceControlChangesViewProps {
    loading: boolean;
    staged: SCFileStatus[];
    unstaged: SCFileStatus[];
    selectedFileKey: string | null;
    onStage: (path: string) => void;
    onUnstage: (path: string) => void;
    onStageAll: () => void;
    onOpenWorkingDiff: (file: SCFileStatus, stagedView: boolean) => void;
    onOpenFileQuery: (file: SCFileStatus, stagedView: boolean) => void;
    getDisplayFileName: (path: string) => string;
}

/**
 * Changes tab of the SourceControlPanel. Renders the staged file list +
 * unstaged file list. Each entry: click opens the diff, double-click opens
 * the raw file in a new query tab, hover reveals stage/unstage button.
 *
 * Purely presentational. State (loading, file lists) and mutation handlers
 * are passed in from the parent so this can be tested in isolation.
 */
export const SourceControlChangesView: React.FC<SourceControlChangesViewProps> = ({
    loading,
    staged,
    unstaged,
    selectedFileKey,
    onStage,
    onUnstage,
    onStageAll,
    onOpenWorkingDiff,
    onOpenFileQuery,
    getDisplayFileName,
}) => {
    return (
        <div>
            <div className='px-2.5 py-1 flex items-center justify-between'>
                <span className='text-label font-semibold text-muted-foreground uppercase tracking-wide'>
                    Staged ({staged.length})
                </span>
                {unstaged.length > 0 && (
                    <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='text-label text-muted-foreground ui-interactive-surface flex items-center gap-0.5'
                        title='Stage all'
                        onClick={() => onStageAll()}
                    >
                        <Plus size={10} /> All
                    </Button>
                )}
            </div>
            {staged.length === 0 ? (
                <div className='px-3 py-1 text-label text-muted-foreground'>No staged changes.</div>
            ) : (
                staged.map(f => (
                    <div
                        key={f.path}
                        className={cn(
                            'group flex h-7 w-full items-center gap-1.5 rounded-md bg-transparent px-1.5 text-small! text-foreground transition-colors duration-fast hover:bg-(--state-hover-bg)',
                            selectedFileKey === `wip:staged:${f.path}` && interactiveSelected,
                        )}
                        role='button'
                        tabIndex={0}
                        title={f.path}
                        onClick={() => onOpenWorkingDiff(f, true)}
                        onDoubleClick={() => onOpenFileQuery(f, true)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onOpenWorkingDiff(f, true);
                            }
                        }}
                    >
                        <FileStatusBadge status={f.status} />
                        <span className='flex-1 truncate text-label text-foreground' title={f.path}>
                            {getDisplayFileName(f.path)}
                        </span>
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            title={`Unstage ${f.path}`}
                            className='h-7 w-7 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ui-interactive-surface'
                            onClick={event => {
                                event.stopPropagation();
                                onUnstage(f.path);
                            }}
                        >
                            <Minus size={11} />
                        </Button>
                    </div>
                ))
            )}

            <div className='border-t border-border/30 mt-1' />

            <div className='px-2.5 py-1'>
                <span className='text-label font-semibold text-muted-foreground uppercase tracking-wide'>
                    Unstaged ({unstaged.length})
                </span>
            </div>
            {unstaged.length === 0 ? (
                <div className='px-3 py-1 text-label text-muted-foreground'>
                    No unstaged changes.
                </div>
            ) : (
                unstaged.map(f => (
                    <div
                        key={f.path}
                        className={cn(
                            'group flex h-7 w-full items-center gap-1.5 rounded-md bg-transparent px-1.5 text-small! text-foreground transition-colors duration-fast hover:bg-(--state-hover-bg)',
                            selectedFileKey === `wip:unstaged:${f.path}` && interactiveSelected,
                        )}
                        role='button'
                        tabIndex={0}
                        title={f.path}
                        onClick={() => onOpenWorkingDiff(f, false)}
                        onDoubleClick={() => onOpenFileQuery(f, false)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onOpenWorkingDiff(f, false);
                            }
                        }}
                    >
                        <FileStatusBadge status={f.status} />
                        <span className='flex-1 truncate text-label text-foreground' title={f.path}>
                            {getDisplayFileName(f.path)}
                        </span>
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            title={`Stage ${f.path}`}
                            className='h-7 w-7 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground ui-interactive-surface'
                            onClick={event => {
                                event.stopPropagation();
                                onStage(f.path);
                            }}
                        >
                            <Plus size={11} />
                        </Button>
                    </div>
                ))
            )}

            {staged.length === 0 && unstaged.length === 0 && !loading && (
                <div className='flex justify-center py-4 text-label text-muted-foreground'>
                    Working tree clean.
                </div>
            )}
        </div>
    );
};
