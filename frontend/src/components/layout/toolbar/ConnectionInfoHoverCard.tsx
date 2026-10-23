// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Server, Database } from 'lucide-react';

import { useConnectionStore } from '../../../stores/connectionStore';
import { useProjectStore } from '../../../stores/projectStore';
import { resolveProjectColor } from '../../../lib/projectColors';
import { cn } from '../../../lib/cn';
import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from '../../ui';
import { controlGhost } from '../../ui/contract';

/**
 * ConnectionInfoHoverCard renders the toolbar's `server / database` breadcrumb
 * and, on hover, a card with the active connection's driver, host, port,
 * database, user and SSL mode. Read-only — everything comes from the connection
 * store. When the project has a colour set, the trigger text flips white to
 * stay legible on the project-zone wash.
 */
export const ConnectionInfoHoverCard: React.FC = () => {
    const activeProfile = useConnectionStore(s => s.activeProfile);
    const activeProject = useProjectStore(s => s.activeProject);

    const serverLabel = activeProfile?.host || 'No server';
    const databaseLabel = activeProfile?.db_name || 'No database';
    const projectColorOption = resolveProjectColor(activeProject);

    return (
        <HoverCard openDelay={300} closeDelay={150}>
            <HoverCardTrigger asChild>
                <div
                    className={cn(
                        controlGhost,
                        'flex items-center gap-1 cursor-default rounded-md px-1 transition-colors duration-fast',
                        projectColorOption && 'text-white!',
                    )}
                >
                    <Server size={12} className='shrink-0' />
                    <span className='truncate max-w-20 xl:max-w-none' title={serverLabel}>
                        {serverLabel}
                    </span>
                    <span
                        className={cn(
                            'px-0.5',
                            projectColorOption ? 'text-white/40' : 'text-muted-foreground/30',
                        )}
                    >
                        /
                    </span>
                    <Database size={12} className='shrink-0' />
                    <span className='truncate max-w-20 xl:max-w-none' title={databaseLabel}>
                        {databaseLabel}
                    </span>
                </div>
            </HoverCardTrigger>
            {activeProfile && (
                <HoverCardContent className='w-80 p-4 border border-border bg-popover text-popover-foreground rounded-md shadow-elevation-md'>
                    <div className='w-fit mx-auto flex flex-col gap-2 font-sans text-small'>
                        <div className='flex items-center gap-4'>
                            <span className='text-muted-foreground w-20 shrink-0 text-right'>
                                Driver
                            </span>
                            <span className='text-foreground break-all select-all font-medium'>
                                <Badge>{activeProfile.driver}</Badge>
                            </span>
                        </div>
                        <div className='flex items-center gap-4'>
                            <span className='text-muted-foreground w-20 shrink-0 text-right font-medium'>
                                Host
                            </span>
                            <span className='text-foreground break-all select-all text-label'>
                                {activeProfile.host || 'No host'}
                            </span>
                        </div>
                        <div className='flex items-center gap-4'>
                            <span className='text-muted-foreground w-20 shrink-0 text-right font-medium'>
                                Port
                            </span>
                            <span className='text-foreground text-label select-all'>
                                {activeProfile.port || '-'}
                            </span>
                        </div>
                        <div className='flex items-center gap-4'>
                            <span className='text-muted-foreground w-20 shrink-0 text-right font-medium'>
                                Database
                            </span>
                            <span className='text-foreground break-all text-label select-all'>
                                {activeProfile.db_name || 'No database'}
                            </span>
                        </div>
                        {activeProfile.username && (
                            <div className='flex items-center gap-4'>
                                <span className='text-muted-foreground w-20 shrink-0 text-right font-medium'>
                                    User
                                </span>
                                <span className='text-foreground text-label select-all'>
                                    {activeProfile.username}
                                </span>
                            </div>
                        )}
                        {activeProfile.ssl_mode && (
                            <div className='flex items-center gap-4'>
                                <span className='text-muted-foreground w-20 shrink-0 text-right font-medium'>
                                    SSL Mode
                                </span>
                                <span className='text-foreground text-label'>
                                    {activeProfile.ssl_mode}
                                </span>
                            </div>
                        )}
                    </div>
                </HoverCardContent>
            )}
        </HoverCard>
    );
};
