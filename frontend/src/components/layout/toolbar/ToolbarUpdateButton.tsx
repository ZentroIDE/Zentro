// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ArrowUpCircle, ScrollText } from 'lucide-react';

import { BrowserOpenURL } from '../../../../wailsjs/runtime/runtime';
import { APP_URL as WEBSITE_URL } from '../../../lib/appUrls';
import { Button, HoverCard, HoverCardContent, HoverCardTrigger, Spinner } from '../../ui';
import type { UpdateInfo } from '../../../hooks/useUpdateCheck';
import zentroLogo from '../../../assets/images/appicon.png';

interface ToolbarUpdateButtonProps {
    /** Running version, from the backend About info (e.g. "v0.4.0"). */
    currentVersion: string;
    /** A newer release the user hasn't actioned yet. */
    updateInfo: UpdateInfo | null;
    /** True right after the user confirmed "Restart & Install", until the app quits. */
    isApplying?: boolean;
    isNightly?: boolean;
    /** Opens the release-notes dialog with the restart/download CTA. */
    onOpenDetails: () => void;
}

const withVPrefix = (version: string): string => {
    const trimmed = version.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
};

/**
 * ToolbarUpdateButton is the sole surface for the built-in update check
 * (VSCode-style): the check always runs quietly on launch and, when it finds
 * something, this button appears in the toolbar instead of a modal or toast.
 * Clicking opens the release-notes dialog, whose CTA (Restart & Install on
 * Windows, Download Now elsewhere) does the real work.
 *
 * Hovering reveals the current and target versions.
 */
export const ToolbarUpdateButton: React.FC<ToolbarUpdateButtonProps> = ({
    currentVersion,
    updateInfo,
    isApplying,
    isNightly,
    onOpenDetails,
}) => {
    if (!updateInfo && !isApplying) return null;

    const latestVersion = withVPrefix(updateInfo?.latest_version || '');
    const currentLabel = withVPrefix(currentVersion) || 'unknown';
    const productName = isNightly ? 'Zentro IDE Nightly' : 'Zentro IDE';

    const title = isApplying
        ? `${productName} is closing to install ${latestVersion || 'the update'}...`
        : `${productName} ${latestVersion} is available`;

    const openReleaseNotes = () => {
        if (updateInfo?.release_url) {
            BrowserOpenURL(updateInfo.release_url);
        } else {
            BrowserOpenURL(`${WEBSITE_URL}/changelog`);
        }
    };

    return (
        <HoverCard openDelay={200} closeDelay={120}>
            <HoverCardTrigger asChild>
                <Button
                    variant='default'
                    tone='success'
                    size='sm'
                    className='px-2 rounded-sm'
                    title={title}
                    disabled={isApplying}
                    onClick={onOpenDetails}
                >
                    {isApplying ? (
                        <Spinner size={13} tone='current' />
                    ) : (
                        <ArrowUpCircle size={13} strokeWidth={2.25} />
                    )}
                </Button>
            </HoverCardTrigger>
            <HoverCardContent
                align='end'
                sideOffset={8}
                className='w-76 p-4 border border-border bg-popover text-popover-foreground rounded-md shadow-elevation-md'
            >
                <div className='flex flex-col gap-3 font-sans text-small'>
                    <div className='flex items-center gap-3'>
                        <img
                            src={zentroLogo}
                            alt=''
                            className='h-20 w-20 shrink-0 object-contain'
                        />
                        <div className='flex flex-1 flex-col gap-1'>
                            <div className='flex justify-between'>
                                <div className='font-semibold text-foreground'>{productName}</div>
                                <Button
                                    variant='ghost'
                                    size='icon'
                                    title='Release Notes'
                                    onClick={openReleaseNotes}
                                >
                                    <ScrollText size={14} />
                                </Button>
                            </div>
                            <div className='flex items-center justify-between gap-4'>
                                <span className='text-muted-foreground'>Current Version</span>
                                <span className='text-foreground select-all'>{currentLabel}</span>
                            </div>
                            <div className='flex items-center justify-between gap-4'>
                                <span className='text-muted-foreground'>Latest Version</span>
                                <span className='text-success font-medium select-all'>
                                    {latestVersion}
                                </span>
                            </div>
                        </div>
                    </div>
                    <p className='text-label text-muted-foreground'>{title}</p>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
};
