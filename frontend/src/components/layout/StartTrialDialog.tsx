// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from '../ui';
import { startTrial } from '../../lib/license/service';
import { ACTIVATION_STATUS } from '../../lib/license/types';
import { kernelErrorMessage } from '../../shared/kernel';
import { useToast } from './Toast';

interface StartTrialDialogProps {
    open: boolean;
    onClose: () => void;
}

/**
 * The 30-day Pro trial (ADR 0019). The server grants it, keyed to this email
 * and installation — there is no client-side trial counter, so a second
 * attempt on the same email/machine is for the server to refuse, not this
 * dialog to guess at.
 */
export const StartTrialDialog: React.FC<StartTrialDialogProps> = ({ open, onClose }) => {
    const { toast } = useToast();
    const [email, setEmail] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);

    const handleSubmit = async () => {
        const trimmed = email.trim();
        if (!trimmed || submitting) return;
        setSubmitting(true);
        const result = await startTrial(trimmed);
        setSubmitting(false);
        if (!result.ok) {
            toast.error(kernelErrorMessage(result.error));
            return;
        }
        if (result.data.status === ACTIVATION_STATUS.ACTIVATING) {
            toast.success('Check your email to confirm and start the trial.');
        } else {
            toast.success('Your 30-day Pro trial has started.');
        }
        setEmail('');
        onClose();
    };

    return (
        <Dialog
            open={open}
            onOpenChange={nextOpen => {
                if (!nextOpen && !submitting) onClose();
            }}
        >
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle className='font-semibold'>Start your 30-day Pro trial</DialogTitle>
                    <DialogDescription className='mt-0.5 text-small text-muted-foreground'>
                        One trial per email and installation. No card, no restart — Pro unlocks as
                        soon as it's confirmed.
                    </DialogDescription>
                </DialogHeader>

                <div className='px-4 py-3'>
                    <Input
                        type='email'
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder='you@example.com'
                        autoFocus
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleSubmit();
                            }
                        }}
                    />
                </div>

                <DialogFooter>
                    <Button variant='ghost' size='sm' onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        size='sm'
                        variant='default'
                        onClick={() => void handleSubmit()}
                        disabled={!email.trim() || submitting}
                    >
                        {submitting ? 'Starting...' : 'Start trial'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
