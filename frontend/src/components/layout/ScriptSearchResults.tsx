// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCode, Trash2 } from 'lucide-react';
import { useScriptStore } from '../../stores/scriptStore';
import { useScriptSearchSummaryStore } from '../../stores/scriptSearchSummaryStore';
import { cn } from '../../lib/cn';
import {
    Button,
    CommandItem,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '../ui';

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return '';
    }
}

export function highlightMatch(text: string, keyword: string): React.ReactNode {
    if (!keyword.trim()) return text;
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className='bg-warning/35 text-foreground not-italic rounded-[2px] px-0'>
                {text.slice(idx, idx + keyword.length)}
            </mark>
            {text.slice(idx + keyword.length)}
        </>
    );
}

export function getMatchedLines(content: string, keyword: string, max = 3): string[] {
    if (!keyword.trim()) return [];
    const kw = keyword.toLowerCase();
    return content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && l.toLowerCase().includes(kw))
        .slice(0, max);
}

export function getMatchedLinesWithNumbers(
    content: string,
    keyword: string,
    max = 3,
): { text: string; lineNumber: number }[] {
    if (!keyword.trim()) return [];
    const kw = keyword.toLowerCase();
    const results: { text: string; lineNumber: number }[] = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length && results.length < max; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.length > 0 && trimmed.toLowerCase().includes(kw)) {
            results.push({ text: trimmed, lineNumber: i + 1 });
        }
    }
    return results;
}

export function getFirstMeaningfulLine(content: string): string {
    const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    return lines.find(l => !l.startsWith('--') && !l.startsWith('/*')) ?? lines[0] ?? '';
}

export interface MatchedLinesDisplayProps {
    lines: { text: string; lineNumber: number }[];
    keyword: string;
    onLineClick: (lineNumber: number) => void;
}

export const MatchedLinesDisplay: React.FC<MatchedLinesDisplayProps> = ({
    lines,
    keyword,
    onLineClick,
}) => {
    if (lines.length === 0) return null;
    return (
        <>
            {lines.map(line => (
                <div
                    key={line.lineNumber}
                    className='flex w-full items-baseline gap-2 py-0.5 rounded-md text-label text-muted-foreground/85 ui-interactive-surface cursor-pointer'
                    onClick={e => {
                        e.stopPropagation();
                        onLineClick(line.lineNumber);
                    }}
                >
                    <span className='shrink-0 pl-2 text-right text-muted-foreground/45 select-none'>
                        {line.lineNumber}
                    </span>
                    <span className='truncate'>{highlightMatch(line.text, keyword)}</span>
                </div>
            ))}
        </>
    );
};

interface ScriptSearchResultsProps {
    query: string;
    projectId: string;
    connectionName: string;
    onOpen: (scriptId: string, scriptName: string, content: string, lineNumber?: number) => void;
}

export const ScriptSearchResults: React.FC<ScriptSearchResultsProps> = ({
    query,
    projectId,
    connectionName,
    onOpen,
}) => {
    const { scripts, getContent, deleteScript } = useScriptStore();
    const [contentCache, setContentCache] = useState<Map<string, string>>(new Map());
    const [isReady, setIsReady] = useState(false);
    const [pendingDeleteScript, setPendingDeleteScript] = useState<{
        id: string;
        name: string;
    } | null>(null);

    useEffect(() => {
        if (!projectId || !connectionName || scripts.length === 0) {
            setIsReady(true);
            return;
        }
        let cancelled = false;
        Promise.all(
            scripts.map(
                async s => [s.id, await getContent(projectId, connectionName, s.id)] as const,
            ),
        )
            .then(entries => {
                if (!cancelled) {
                    setContentCache(new Map(entries));
                    setIsReady(true);
                }
            })
            .catch(() => {
                if (!cancelled) setIsReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [scripts, projectId, connectionName, getContent]);

    const results = useMemo(() => {
        const kw = query.trim().toLowerCase();
        if (!kw) return scripts.slice(0, 30);
        return scripts
            .filter(s => {
                if (s.name.toLowerCase().includes(kw)) return true;
                return (contentCache.get(s.id) ?? '').toLowerCase().includes(kw);
            })
            .slice(0, 30);
    }, [scripts, contentCache, query]);

    const searchSummary = useMemo(() => {
        const kw = query.trim().toLowerCase();
        if (!kw) return null;
        let matchCount = 0;
        let fileCount = 0;
        results.forEach(script => {
            const content = contentCache.get(script.id) ?? '';
            const lineMatches = content
                .split('\n')
                .filter(line => line.toLowerCase().includes(kw)).length;
            const nameMatches = script.name.toLowerCase().includes(kw) ? 1 : 0;
            const total = lineMatches + nameMatches;
            if (total > 0) {
                matchCount += total;
                fileCount += 1;
            }
        });
        return { matchCount, fileCount };
    }, [results, contentCache, query]);

    const setSearchSummary = useScriptSearchSummaryStore(state => state.setSummary);

    useEffect(() => {
        setSearchSummary(searchSummary);
        return () => setSearchSummary(null);
    }, [searchSummary, setSearchSummary]);

    const handleSelect = useCallback(
        (scriptId: string, scriptName: string, lineNumber?: number) => {
            onOpen(scriptId, scriptName, contentCache.get(scriptId) ?? '', lineNumber);
        },
        [contentCache, onOpen],
    );

    const handleDelete = useCallback(
        async (scriptId: string) => {
            try {
                if (!projectId || !connectionName) return;
                await deleteScript(projectId, connectionName, scriptId);
            } catch (error) {
                console.error('Failed to delete script', error);
            }
            setPendingDeleteScript(null);
        },
        [connectionName, deleteScript, projectId],
    );

    if (!isReady && scripts.length > 0) {
        return (
            <div className='px-4 py-2 text-label text-muted-foreground'>
                Loading script content...
            </div>
        );
    }

    if (results.length === 0) {
        return <div className='px-4 py-2 text-label text-muted-foreground'>No scripts found</div>;
    }

    return (
        <>
            <div className='py-1'>
                {results.map(script => {
                    const content = contentCache.get(script.id) ?? '';
                    const kw = query.trim();
                    const matchedLines = getMatchedLinesWithNumbers(content, kw);
                    const nameMatch = kw
                        ? script.name.toLowerCase().includes(kw.toLowerCase())
                        : false;
                    const preview =
                        content && !matchedLines.length ? getFirstMeaningfulLine(content) : '';

                    const item = (
                        <CommandItem
                            value={`script:${script.id}:${script.name}`}
                            onSelect={() => handleSelect(script.id, script.name)}
                            className='group flex flex-col items-start px-4 py-0 mx-1 cursor-pointer gap-1 ui-interactive-command-item-primary'
                        >
                            <div className='flex w-full items-center gap-2 py-1.5'>
                                <FileCode size={13} className='shrink-0 text-success opacity-80' />
                                <span className='flex-1 truncate text-small font-medium text-foreground'>
                                    {nameMatch ? highlightMatch(script.name, kw) : script.name}
                                </span>
                                <span className='shrink-0 text-label text-muted-foreground'>
                                    {formatDate(String(script.updated_at ?? ''))}
                                </span>
                                <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    className={cn(
                                        'h-6 w-6 p-0.75 text-muted-foreground transition-all duration-100 ui-interactive-ghost-destructive',
                                        'shrink-0 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100',
                                    )}
                                    title='Delete script'
                                    onClick={e => {
                                        e.stopPropagation();
                                        setPendingDeleteScript({
                                            id: script.id,
                                            name: script.name,
                                        });
                                    }}
                                >
                                    <Trash2 size={12} />
                                </Button>
                            </div>
                            {matchedLines.length > 0 && (
                                <div className='w-full pl-5 pr-2 pb-1'>
                                    <MatchedLinesDisplay
                                        lines={matchedLines}
                                        keyword={kw}
                                        onLineClick={ln => handleSelect(script.id, script.name, ln)}
                                    />
                                </div>
                            )}
                            {preview && (
                                <div className='w-full truncate pl-5 pr-2 pb-1 text-label text-muted-foreground/70'>
                                    {preview}
                                </div>
                            )}
                        </CommandItem>
                    );

                    if (!content) return <React.Fragment key={script.id}>{item}</React.Fragment>;

                    return (
                        <HoverCard key={script.id} openDelay={150} closeDelay={100}>
                            <HoverCardTrigger asChild>{item}</HoverCardTrigger>
                            <HoverCardContent
                                side='right'
                                align='start'
                                className='z-topmost w-80 p-0 font-mono'
                            >
                                <pre
                                    className='max-h-64 overflow-auto p-3 text-label text-foreground whitespace-pre-wrap break-all'
                                    onWheel={event => {
                                        // The Spotlight dialog is modal and locks page
                                        // scroll (react-remove-scroll), which also blocks
                                        // wheel input on this hover card's own portal since
                                        // it isn't part of the dialog's DOM subtree. Scroll
                                        // it manually so wheel works, not just scrollbar drag.
                                        event.stopPropagation();
                                        event.currentTarget.scrollTop += event.deltaY;
                                    }}
                                >
                                    {content}
                                </pre>
                            </HoverCardContent>
                        </HoverCard>
                    );
                })}
            </div>
            <Dialog
                open={Boolean(pendingDeleteScript)}
                onOpenChange={v => !v && setPendingDeleteScript(null)}
            >
                <DialogContent size='sm'>
                    <DialogHeader>
                        <DialogTitle>Delete Saved Script</DialogTitle>
                    </DialogHeader>
                    <div className='px-4 py-3'>
                        <p className='text-small'>
                            Delete "{pendingDeleteScript?.name || 'this script'}"?
                        </p>
                        <p className='text-label text-muted-foreground mt-1'>
                            This action permanently removes the saved SQL script.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant='ghost' onClick={() => setPendingDeleteScript(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                if (pendingDeleteScript?.id)
                                    void handleDelete(pendingDeleteScript.id);
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
