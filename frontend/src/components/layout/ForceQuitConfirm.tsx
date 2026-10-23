// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui';

interface ForceQuitConfirmProps {
    open: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

/**
 * Confirm dialog shown when the user closes the window while one or more
 * editor queries or Activity-panel jobs (export/import, etc.) are still
 * running — see useBeforeCloseGuard. Cancel keeps the app open; Confirm
 * calls the supplied `onConfirm` (typically `forceQuitWithAutosave`).
 */
export const ForceQuitConfirm: React.FC<ForceQuitConfirmProps> = ({
    open,
    onCancel,
    onConfirm,
}) => {
    return (
        <Dialog open={open} onOpenChange={v => !v && onCancel()}>
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle>Force Close Application</DialogTitle>
                </DialogHeader>
                <div className='px-4 py-3'>
                    <p className='text-small'>
                        One or more queries or background jobs (export/import) are still running.
                    </p>
                    <p className='text-label text-muted-foreground mt-1'>
                        Close now and stop everything in progress? Any export/import job will be
                        cancelled and its partial file discarded.
                    </p>
                </div>
                <DialogFooter>
                    <Button variant='ghost' onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant='destructive' onClick={onConfirm}>
                        Force Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
