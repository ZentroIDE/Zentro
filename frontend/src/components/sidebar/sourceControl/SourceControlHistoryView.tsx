// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { GitCommitFileDiff, SCCommit as SCCommitType } from '../../../platform/app-api/types';
import { Button } from '../../ui';
import { interactiveSelected } from '../../ui/contract';
import { cn } from '../../../lib/cn';
import { useHistorySections } from './historySectionRegistry';

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString([], {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

interface SourceControlHistoryViewProps {
    historyLoading: boolean;
    history: SCCommitType[];
    expandedHash: string | null;
    fileDiffsCache: Record<string, GitCommitFileDiff[]>;
    fileDiffsLoading: string | null;
    selectedFileKey: string | null;
    onToggleCommit: (hash: string) => void;
    onOpenDiff: (hash: string, file: GitCommitFileDiff) => void;
    onOpenHistoryFileQuery: (file: GitCommitFileDiff) => void;
    getDisplayFileName: (path: string) => string;
}

/**
 * History tab of the SourceControlPanel. Renders whatever an edition
 * contributed above the list (e.g. Pro's schema rollback, via
 * historySectionRegistry.ts) followed by the commit list. Each commit can be
 * expanded to show the file-diff list; clicking a file opens the diff or the
 * raw file in a new editor tab.
 *
 * Purely presentational — all state and side effects live in the parent (or,
 * for a contributed section, in that section's own component).
 */
export const SourceControlHistoryView: React.FC<SourceControlHistoryViewProps> = ({
    historyLoading,
    history,
    expandedHash,
    fileDiffsCache,
    fileDiffsLoading,
    selectedFileKey,
    onToggleCommit,
    onOpenDiff,
    onOpenHistoryFileQuery,
    getDisplayFileName,
}) => {
    const sections = useHistorySections();

    if (historyLoading) {
        return (
            <div className='flex justify-center py-4 text-label text-muted-foreground'>
                Loading...
            </div>
        );
    }
    if (history.length === 0 && sections.length === 0) {
        return (
            <div className='flex justify-center py-4 text-label text-muted-foreground'>
                No commits yet.
            </div>
        );
    }
    return (
        <>
            {sections.map(section => (
                <React.Fragment key={section.id}>{section.render()}</React.Fragment>
            ))}
            {history.map(commit => {
                const isExpanded = expandedHash === commit.hash;
                const cachedFiles = fileDiffsCache[commit.hash];
                const isLoadingFiles = fileDiffsLoading === commit.hash;
                return (
                    <div key={commit.hash}>
                        <Button
                            type='button'
                            variant='ghost'
                            className={cn(
                                'mb-0.5 h-7 w-full justify-start gap-1.5 rounded-md bg-transparent px-1.5 text-left text-small! text-foreground transition-colors duration-fast ui-interactive-surface',
                                isExpanded && 'bg-[var(--state-active-bg)]',
                            )}
                            onClick={() => onToggleCommit(commit.hash)}
                            title={`${commit.author} - ${formatDateTime(commit.when)}`}
                        >
                            {isExpanded ? (
                                <ChevronDown size={10} className='text-accent shrink-0' />
                            ) : (
                                <ChevronRight
                                    size={10}
                                    className='text-muted-foreground shrink-0'
                                />
                            )}
                            <span className='min-w-0 flex-1 truncate text-left leading-5'>
                                {commit.message}
                            </span>
                            <span className='text-label text-muted-foreground shrink-0'>
                                {commit.hash.slice(0, 7)}
                            </span>
                        </Button>
                        {isExpanded && (
                            <div className='relative pl-3'>
                                {isLoadingFiles ? (
                                    <div className='px-1.5 py-1 text-label text-muted-foreground'>
                                        Loading...
                                    </div>
                                ) : cachedFiles && cachedFiles.length > 0 ? (
                                    cachedFiles.map(f => {
                                        const fileKey = `sc:${commit.hash}:${f.path}`;
                                        const isSelected = selectedFileKey === fileKey;
                                        return (
                                            <Button
                                                key={f.path}
                                                type='button'
                                                variant='ghost'
                                                className={cn(
                                                    'mb-0.5 h-7 w-full justify-start gap-1.5 rounded-md bg-transparent pl-3 pr-1.5 text-left text-small! text-foreground transition-colors duration-fast ui-interactive-surface',
                                                    isSelected
                                                        ? `${interactiveSelected} text-foreground`
                                                        : 'text-foreground',
                                                )}
                                                title={f.path}
                                                onClick={() => onOpenDiff(commit.hash, f)}
                                                onDoubleClick={() => onOpenHistoryFileQuery(f)}
                                            >
                                                {!f.before && (
                                                    <span className='text-success shrink-0'>A</span>
                                                )}
                                                {!f.after && (
                                                    <span className='text-destructive shrink-0'>
                                                        D
                                                    </span>
                                                )}
                                                {f.before && f.after && (
                                                    <span className='text-warning shrink-0'>M</span>
                                                )}
                                                <span className='min-w-0 flex-1 truncate text-left leading-5'>
                                                    {getDisplayFileName(f.path)}
                                                </span>
                                            </Button>
                                        );
                                    })
                                ) : (
                                    <div className='px-1.5 py-1 text-label text-muted-foreground'>
                                        No file changes.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
};
