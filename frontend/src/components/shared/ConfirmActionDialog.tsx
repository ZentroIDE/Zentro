// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui';

interface ConfirmActionDialogProps {
    open: boolean;
    title: string;
    description: React.ReactNode;
    detail?: React.ReactNode;
    confirmLabel: string;
    busyLabel?: string;
    confirmVariant?: 'default' | 'destructive';
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
    open,
    title,
    description,
    detail,
    confirmLabel,
    busyLabel,
    confirmVariant = 'destructive',
    busy = false,
    onCancel,
    onConfirm,
}) => {
    return (
        <Dialog open={open} onOpenChange={nextOpen => !nextOpen && !busy && onCancel()}>
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className='px-4 py-3'>
                    <p className='text-small'>{description}</p>
                    {detail ? (
                        <p className='text-label text-muted-foreground mt-1'>{detail}</p>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant='ghost' onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
                        {busy ? busyLabel || confirmLabel : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
