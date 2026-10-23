// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { EnvironmentBadge } from './EnvironmentBadge';
import { getEnvironmentMeta, getEnvironmentShortLabel } from '../../lib/projects';
import type { PinnedConnection } from '../../stores/editor/types';
import { useConnectionStore } from '../../stores/connectionStore';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui';

interface PinnedEnvironmentBadgeProps {
    connection: PinnedConnection;
    /** Show the abbreviated form (DEV/STAG/PROD) instead of the full env name. */
    truncate?: boolean;
}

// Pinned Environment indicator (ADR-0001, docs/adr/0001-pinned-environment-
// context-for-data-tabs.md): shown on Table/Catalog tabs so their fixed
// environment is legible at a glance, independent of the Toolbar's Active
// Environment (which only ever drives Query tabs).
export const PinnedEnvironmentBadge: React.FC<PinnedEnvironmentBadgeProps> = ({
    connection,
    truncate = false,
}) => {
    const meta = getEnvironmentMeta(connection.environmentKey);
    const label = truncate ? getEnvironmentShortLabel(connection.environmentKey) : meta.label;
    // PinnedConnection only carries the stable ID — resolve the pool's
    // current display name for it (falls back to the raw ID if the
    // connection was since deleted from the pool).
    const poolConnections = useConnectionStore(state => state.connections);
    const connectionName =
        poolConnections.find(profile => profile.id === connection.connectionID)?.name ||
        connection.connectionID;

    return (
        <HoverCard openDelay={250} closeDelay={100}>
            <HoverCardTrigger asChild>
                <span onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <EnvironmentBadge
                        label={label}
                        toneClassName={meta.colorClass}
                        className='h-4! min-w-0! shrink-0 px-1! text-[10px]! font-semibold'
                        title={`Pinned to ${meta.label}`}
                    />
                </span>
            </HoverCardTrigger>
            <HoverCardContent
                align='start'
                side='bottom'
                sideOffset={8}
                className='z-dropdown w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-elevation-md'
            >
                <div className='flex flex-col gap-1.5 font-sans text-small'>
                    <div className='flex items-center gap-4'>
                        <span className='w-16 shrink-0 text-right text-muted-foreground'>Env</span>
                        <EnvironmentBadge label={meta.label} toneClassName={meta.colorClass} />
                    </div>
                    <div className='flex items-center gap-4'>
                        <span className='w-16 shrink-0 text-right text-muted-foreground'>
                            Driver
                        </span>
                        <span className='text-foreground select-all'>{connection.driver}</span>
                    </div>
                    <div className='flex items-center gap-4'>
                        <span className='w-16 shrink-0 text-right text-muted-foreground'>
                            Connection
                        </span>
                        <span className='truncate text-foreground select-all'>
                            {connectionName}
                        </span>
                    </div>
                    <div className='flex items-center gap-4'>
                        <span className='w-16 shrink-0 text-right text-muted-foreground'>
                            Database
                        </span>
                        <span className='truncate text-foreground select-all'>
                            {connection.dbName}
                        </span>
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};
