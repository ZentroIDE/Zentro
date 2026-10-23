// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Pin } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { hexToRgba, resolveProjectColor } from '../../../lib/projectColors';
import {
    getEnvironmentMeta,
    getEnvironmentShortLabel,
    sortEnvironmentKeys,
} from '../../../lib/projects';
import type { EnvironmentKey, Project } from '../../../types/project';
import { EnvironmentBadge } from '../../shared/EnvironmentBadge';
import {
    PROJECT_ICON_MAP,
    formatRelativeDate,
    getProjectIconKey,
    isProjectPinned,
} from '../projectHubMeta';

interface ProjectRowContentProps {
    project: Project;
    isActive?: boolean;
    /** Replaces the relative "last opened" label, e.g. "Opening...". */
    statusLabel?: string;
}

/**
 * The inside of one project row — color/icon tile, name (+ pin), description,
 * environment badges and last-opened time. Shared by the toolbar's
 * QuickProjectPopover and the no-project Welcome surface so both list projects
 * identically; the caller owns the row wrapper (click, hover, context menu).
 */
export const ProjectRowContent: React.FC<ProjectRowContentProps> = ({
    project,
    isActive = false,
    statusLabel,
}) => {
    const DisplayIcon = PROJECT_ICON_MAP[getProjectIconKey(project)].icon;
    const colorOption = resolveProjectColor(project);
    const pinned = isProjectPinned(project);
    const envKeys = sortEnvironmentKeys(
        (project.environments || []).map(environment => environment.key as EnvironmentKey),
    );
    const description = project.description?.trim();

    return (
        <>
            <span
                className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white'
                style={{
                    backgroundColor: colorOption ? hexToRgba(colorOption.value, 0.85) : undefined,
                }}
            >
                <DisplayIcon size={14} className={cn(!colorOption && 'text-muted-foreground')} />
            </span>
            <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1 truncate text-small font-semibold text-foreground'>
                    {pinned && (
                        <Pin
                            size={10}
                            className={cn(
                                'shrink-0',
                                isActive ? 'text-primary' : 'text-muted-foreground/70',
                            )}
                        />
                    )}
                    <span className='truncate'>{project.name}</span>
                </div>
                <div
                    className={cn(
                        'truncate text-label',
                        description ? 'text-muted-foreground' : 'text-muted-foreground/55',
                    )}
                >
                    {description || 'No description'}
                </div>
            </div>
            <div className='flex shrink-0 flex-col items-end gap-1'>
                <div className='flex gap-1'>
                    {envKeys.length > 0 ? (
                        envKeys.map(envKey => (
                            <EnvironmentBadge
                                key={envKey}
                                label={getEnvironmentShortLabel(envKey)}
                                title={getEnvironmentMeta(envKey).label}
                                className='h-5 px-1.5 text-[10px] font-medium normal-case tracking-normal'
                            />
                        ))
                    ) : (
                        <span className='rounded-md bg-muted/30 px-1.5 py-0.5 text-label text-muted-foreground'>
                            No env
                        </span>
                    )}
                </div>
                <span
                    className={cn(
                        'text-label',
                        isActive ? 'text-primary' : 'text-muted-foreground',
                    )}
                >
                    {statusLabel ??
                        formatRelativeDate(project.last_opened_at || project.updated_at)}
                </span>
            </div>
        </>
    );
};
