// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/cn';

export interface InlineConfirmProps {
    /** The question shown in place of the trigger, e.g. "Force kill this
     *  job?" or "Cancel export?". */
    label: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    /** Disables both buttons while an async onConfirm is in flight. */
    confirming?: boolean;
    /** Tooltip on the check button — defaults to a generic "Yes". */
    confirmTitle?: string;
    /** Tooltip on the x button. */
    cancelTitle?: string;
    className?: string;
}

/** A destructive action's inline "<label> [check] [x]" acknowledgement —
 *  swapped in for the action's own trigger (a toolbar icon, a row button,
 *  ...) instead of a modal dialog. Pulled out of the result panel
 *  toolbar's Discard/Cancel-export actions (see useResultPanelToolbar.tsx,
 *  JobRow.tsx) the first time a third caller needed the same pattern — use
 *  this for any future destructive action that warrants a quick
 *  acknowledgement but not a full ConfirmDialog (reserve that for actions
 *  needing more context, like typed-PID production confirmation). */
export function InlineConfirm({
    label,
    onConfirm,
    onCancel,
    confirming = false,
    confirmTitle = 'Yes',
    cancelTitle = 'Cancel',
    className,
}: InlineConfirmProps) {
    return (
        <div
            className={cn(
                'flex items-center shrink-0 gap-0.5 bg-destructive/5 rounded-md pl-2',
                className,
            )}
        >
            <span className='text-destructive mr-1 select-none text-[13px] whitespace-nowrap'>
                {label}
            </span>
            <Button
                variant='ghost'
                size='sm'
                tone='destructive'
                disabled={confirming}
                onClick={onConfirm}
                className='h-6 w-6 p-0 ui-interactive-ghost-destructive'
                title={confirmTitle}
            >
                <Check size={13} />
            </Button>
            <Button
                variant='ghost'
                size='sm'
                disabled={confirming}
                onClick={onCancel}
                className='h-6 w-6 p-0 text-muted-foreground ui-interactive-surface'
                title={cancelTitle}
            >
                <X size={13} />
            </Button>
        </div>
    );
}
