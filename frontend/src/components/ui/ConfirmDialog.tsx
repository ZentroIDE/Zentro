// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import { Button } from './button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './dialog';

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: React.ReactNode;
    helperText?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    confirming?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

/** Plain yes/no confirmation dialog for a single pending action — pair
 *  with `useConfirmAction` for the pending-target state it renders. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    helperText,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    confirming = false,
    onCancel,
    onConfirm,
}) => (
    <Dialog open={open} onOpenChange={next => !next && onCancel()}>
        <DialogContent size='sm'>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <div className='px-4 py-3'>
                <p className='text-small'>{description}</p>
                {helperText && (
                    <p className='text-label text-muted-foreground mt-1'>{helperText}</p>
                )}
            </div>
            <DialogFooter>
                <Button variant='ghost' onClick={onCancel} disabled={confirming}>
                    {cancelLabel}
                </Button>
                <Button
                    variant={destructive ? 'destructive' : 'default'}
                    onClick={onConfirm}
                    disabled={confirming}
                    state={confirming ? 'loading' : 'default'}
                >
                    {confirmLabel}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
