// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RotateCcw, Server, SquareTerminal, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../components/ui';
import {
    TAB_STRIP_BAR_CLASS,
    TAB_STRIP_ITEM_ACTIVE_CLASS,
    TAB_STRIP_ITEM_CLASS,
} from '../../components/ui/contract';
import { useSmoothWheelScroll } from '../../hooks/useSmoothWheelScroll';
import { cn } from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import type { TerminalKind } from '../../platform/app-api/contracts/terminal';
import { useTerminalStore } from '../../stores/terminalStore';
import { closeTerminal, openTerminal } from './terminalController';
import type { TerminalTab } from '../../stores/terminalStore';
import { attachLiveTerminal, getLiveTerminal, safeFit } from './terminalRegistry';

interface SshTarget {
    id: string;
    name: string;
    detail: string;
}

/** The bottom panel's Terminal tab: a local shell, or a shell on the SSH
 *  server of a connection that has a tunnel. The xterm instances outlive this
 *  component (see terminalRegistry), so switching to another bottom-panel tab
 *  and back keeps every session and its scrollback. */
export const TerminalPanel: React.FC = () => {
    const tabs = useTerminalStore(s => s.tabs);
    const activeId = useTerminalStore(s => s.activeId);
    const setActive = useTerminalStore(s => s.setActive);
    const activeTab = tabs.find(tab => tab.id === activeId);
    const hostRef = useRef<HTMLDivElement>(null);
    const tabsScrollRef = useRef<HTMLDivElement>(null);
    useSmoothWheelScroll(tabsScrollRef, { axis: 'x' });
    const [error, setError] = useState('');
    const [sshTargets, setSshTargets] = useState<SshTarget[]>([]);

    const open = useCallback(async (kind: TerminalKind, profileId = '') => {
        setError('');
        try {
            await openTerminal(kind, profileId);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        }
    }, []);

    // An exited shell keeps its scrollback; restarting opens the same kind of
    // shell and only then retires the old tab, so a failed restart loses nothing.
    const restart = useCallback(async (tab: TerminalTab) => {
        setError('');
        try {
            await openTerminal(tab.kind, tab.profileId);
            closeTerminal(tab.id);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        }
    }, []);

    // Connections that can host an SSH shell: the ones with a tunnel configured.
    useEffect(() => {
        let cancelled = false;
        void getApiGateway()
            .connection.loadConnections()
            .then(result => {
                if (cancelled || !result.ok) return;
                setSshTargets(
                    result.data
                        .filter(p => p.ssh_enabled && p.id)
                        .map(p => ({
                            id: p.id,
                            name: p.name,
                            detail: `${p.ssh_user ?? ''}@${p.ssh_host ?? ''}`,
                        })),
                );
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Show the active session in the host element and keep it fitted to it.
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !activeId) return;
        const entry = getLiveTerminal(activeId);
        if (!entry) return;

        attachLiveTerminal(entry, host);
        entry.term.focus();

        // Allotment resizes the pane without a window resize event.
        const observer = new ResizeObserver(() => safeFit(entry));
        observer.observe(host);
        return () => observer.disconnect();
    }, [activeId]);

    return (
        <div className='flex h-full min-h-0 flex-col bg-background'>
            <div className={TAB_STRIP_BAR_CLASS}>
                <div
                    ref={tabsScrollRef}
                    role='tablist'
                    aria-label='Terminal sessions'
                    className='flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-x-auto ui-scrollbar-hover transition-opacity p-1'
                >
                    {tabs.map(tab => (
                        <div
                            key={tab.id}
                            role='tab'
                            tabIndex={0}
                            aria-selected={tab.id === activeId}
                            onClick={() => setActive(tab.id)}
                            onKeyDown={event => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setActive(tab.id);
                                }
                            }}
                            className={cn(
                                TAB_STRIP_ITEM_CLASS,
                                'rounded-md h-7',
                                tab.id === activeId && TAB_STRIP_ITEM_ACTIVE_CLASS,
                            )}
                            title={tab.exited ? `${tab.title} (exited)` : tab.title}
                        >
                            <span
                                className={cn(
                                    'flex h-full max-w-40 items-center gap-1 truncate',
                                    tab.exited && 'opacity-60',
                                )}
                            >
                                {tab.kind === 'ssh' ? (
                                    <Server size={13} aria-hidden className='shrink-0' />
                                ) : (
                                    <SquareTerminal size={13} aria-hidden className='shrink-0' />
                                )}
                                {tab.kind === 'ssh' && <span className='sr-only'>SSH · </span>}
                                {tab.title}
                            </span>
                            <Button
                                type='button'
                                variant='ghost'
                                size='micro'
                                className='h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
                                aria-label={`Close ${tab.title}`}
                                title='Close terminal'
                                onClick={event => {
                                    event.stopPropagation();
                                    closeTerminal(tab.id);
                                }}
                            >
                                <X size={10} />
                            </Button>
                        </div>
                    ))}
                </div>
                <div className='flex h-full shrink-0 gap-1 py-1 pr-1'>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                aria-label='New terminal'
                                title='New terminal'
                            >
                                <Plus size={13} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                            <DropdownMenuItem onSelect={() => void open('local')}>
                                Local shell
                            </DropdownMenuItem>
                            {sshTargets.length > 0 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>SSH shell</DropdownMenuLabel>
                                    {sshTargets.map(target => (
                                        <DropdownMenuItem
                                            key={target.id}
                                            onSelect={() => void open('ssh', target.id)}
                                        >
                                            {target.name}
                                            <span className='ml-2 text-label text-muted-foreground'>
                                                {target.detail}
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {error && (
                <div
                    role='alert'
                    className='shrink-0 bg-destructive/10 px-3 py-1.5 text-label text-destructive'
                >
                    {error}
                </div>
            )}

            {tabs.length === 0 ? (
                <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>
                    <div className='my-auto flex flex-col items-center gap-3 py-4'>
                        <SquareTerminal
                            aria-hidden
                            strokeWidth={1}
                            className='pointer-events-none h-24 w-24 text-foreground opacity-10'
                        />
                        <div className='flex flex-col gap-1'>
                            <Button
                                type='button'
                                variant='ghost'
                                onClick={() => void open('local')}
                                className='flex h-auto items-center justify-between gap-8 rounded-md px-2.5 py-1.5 text-left'
                            >
                                <span className='text-small text-muted-foreground'>
                                    New Local Terminal
                                </span>
                            </Button>
                            {sshTargets.map(target => (
                                <Button
                                    key={target.id}
                                    type='button'
                                    variant='ghost'
                                    title={`Open a shell on ${target.detail}`}
                                    onClick={() => void open('ssh', target.id)}
                                    className='flex h-auto items-center justify-between gap-8 rounded-md px-2.5 py-1.5 text-left'
                                >
                                    <span className='text-small text-muted-foreground'>
                                        SSH Shell · {target.name}
                                    </span>
                                    <span className='text-label text-muted-foreground'>
                                        {target.detail}
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div ref={hostRef} className='zentro-terminal min-h-0 flex-1 overflow-hidden p-1' />
            )}

            {activeTab?.exited && (
                <div
                    role='status'
                    className='flex h-8 shrink-0 items-center justify-between gap-2 bg-card px-3 text-label text-muted-foreground'
                >
                    <span className={cn(activeTab.exitCode ? 'text-destructive' : undefined)}>
                        Shell exited
                        {activeTab.exitCode !== undefined ? ` (code ${activeTab.exitCode})` : ''}
                    </span>
                    <Button
                        type='button'
                        variant='ghost'
                        size='micro'
                        onClick={() => void restart(activeTab)}
                    >
                        <RotateCcw size={12} aria-hidden className='mr-1' />
                        Restart
                    </Button>
                </div>
            )}
        </div>
    );
};
