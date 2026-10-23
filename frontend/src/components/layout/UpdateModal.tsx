// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Download, PackageCheck } from 'lucide-react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Spinner,
} from '../ui';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
import appIcon from '../../assets/images/appicon.png';

interface UpdateModalProps {
    /** The version currently running - from AboutInfo, not the frontend bundle's own package.json (which tracks a different release cadence and can't be trusted to reflect what's actually installed). */
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    onClose: () => void;
    onDismiss: () => void;
    canAutoUpdate?: boolean;
    /** True right after Restart & Install was clicked, until the app quits. */
    isApplying?: boolean;
    /**
     * Quits the app and hands the download -> verify -> install -> relaunch
     * sequence to a detached helper - see internal/app/update_installer_windows.go,
     * update_installer_linux.go, and update_installer_darwin.go. Only wired up
     * when canAutoUpdate is true; every other install just opens the release
     * page instead.
     */
    onRestartAndUpdate?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
    currentVersion,
    latestVersion,
    releaseUrl,
    onClose,
    onDismiss,
    canAutoUpdate,
    isApplying,
    onRestartAndUpdate,
}) => {
    const handlePrimaryAction = () => {
        if (canAutoUpdate && onRestartAndUpdate) {
            onRestartAndUpdate();
            // Don't close - stay open (disabled, spinning) so the click
            // doesn't feel like it did nothing right up until the app
            // actually quits a moment later.
        } else {
            BrowserOpenURL(releaseUrl);
            onClose();
        }
    };

    const footer = (
        <div className='flex w-full items-center justify-between gap-3'>
            <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={onDismiss}
                disabled={isApplying}
            >
                Skip this version
            </Button>
            <div className='flex gap-2'>
                <Button
                    variant='default'
                    size='sm'
                    className='gap-1.5 px-2'
                    onClick={handlePrimaryAction}
                    disabled={isApplying}
                >
                    {isApplying ? (
                        <>
                            <Spinner size={13} tone='current' />
                            Restarting…
                        </>
                    ) : canAutoUpdate ? (
                        <>
                            <PackageCheck size={14} />
                            Restart & Install
                        </>
                    ) : (
                        <>
                            <Download size={14} />
                            Download Now
                        </>
                    )}
                </Button>
            </div>
        </div>
    );

    return (
        <Dialog open onOpenChange={v => !v && !isApplying && onClose()}>
            <DialogContent className='max-w-125 max-h-[85vh] overflow-hidden p-0'>
                <DialogHeader className='px-6 pb-3 pt-6'>
                    <DialogTitle>Zentro Update available</DialogTitle>
                </DialogHeader>
                <div className='min-h-0 flex-1 overflow-y-auto px-6 pb-1'>
                    <div className='flex items-center gap-4'>
                        <div className='h-42 w-42 shrink-0 overflow-hidden rounded-md bg-background/60 p-2'>
                            <img
                                src={appIcon}
                                alt='Zentro App Icon'
                                className='h-full w-full object-contain'
                            />
                        </div>
                        <div className='flex flex-col gap-3 text-small'>
                            <div className='flex items-center gap-2'>
                                <span className='text-muted-foreground'>Current Version:</span>
                                <span className='text-muted-foreground'>{currentVersion}</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <span className='text-muted-foreground'>Latest Version:</span>
                                <span className='font-semibold text-foreground'>
                                    v{latestVersion}
                                </span>
                            </div>
                        </div>
                    </div>
                    {canAutoUpdate && (
                        <p className='text-label text-muted-foreground'>
                            {isApplying
                                ? 'Zentro is closing now - the update will install in the background, then Zentro will reopen automatically.'
                                : 'Restarting will close Zentro, install the update in the background, then reopen Zentro automatically.'}
                        </p>
                    )}
                </div>
                <DialogFooter className='px-6 py-4'>{footer}</DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
