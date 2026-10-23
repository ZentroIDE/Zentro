// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Check } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui';
import { getLicenseState, openCheckoutOrUpgradeUrl } from '../../lib/license/service';
import { StartTrialButton } from './StartTrialButton';

interface UpgradeDialogProps {
    open: boolean;
    onClose: () => void;
    source?: 'project-limit' | 'write-confirm';
    projectLimit?: number;
    /** Where "Upgrade to Pro" opens. A plain suggestion — nothing here
     *  activates or unlocks anything in the app. */
    upgradeUrl: string;
}

const FREE_FEATURES = [
    'Project cap based on current plan',
    'Full SQL IDE (editor, multi-tab, formatter, EXPLAIN)',
    'Schema browser, ERD, column & index ops',
    'Production Mode Overlay - red border warning on every prod connection',
    'Risk classification (Safe / Caution / Danger) on destructive queries',
    'Affected Rows Preview - COUNT before every DELETE/UPDATE',
    'Git schema snapshots & local audit log',
    'Unlimited connections & environments',
];

const PRO_FEATURES = [
    'Unlimited projects',
    'Timed production write unlock (sudo-style) before destructive writes land',
    'Type-to-confirm + cooldown + audit reason for DROP / TRUNCATE',
    'Sandbox Preview - auto-convert to SELECT, see rows before deleting',
    'One-click schema rollback before every DDL on prod',
    'App Lock, Secret Vault, PII Detection, Screenshot Blur',
    'Priority email support',
];

export const UpgradeDialog: React.FC<UpgradeDialogProps> = ({
    open,
    onClose,
    source = 'project-limit',
    projectLimit = 5,
    upgradeUrl,
}) => {
    const resolvedProjectLimit = projectLimit > 0 ? projectLimit : 5;
    const title =
        source === 'project-limit' ? 'Unlock unlimited projects' : 'Unlock stronger Pro guardrails';
    const reasonMessage =
        source === 'project-limit'
            ? `You've reached the ${resolvedProjectLimit}-project limit on the Free plan.`
            : 'This write flow can use stronger Pro guardrails. Review what Pro adds.';
    const primaryLabel =
        source === 'project-limit' ? 'Upgrade for unlimited projects' : 'Upgrade to Pro';

    return (
        <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
            <DialogContent className='max-w-4xl overflow-hidden p-0'>
                <DialogHeader className='px-6 pb-4 pt-6'>
                    <DialogTitle className='font-semibold'>{title}</DialogTitle>
                    <DialogDescription className='mt-0.5 text-small text-muted-foreground'>
                        {reasonMessage}
                    </DialogDescription>
                </DialogHeader>

                <div className='grid grid-cols-2 gap-3 px-6 pb-2'>
                    <div className='rounded-md bg-muted/30 p-4'>
                        <div className='mb-3'>
                            <p className='text-small font-semibold text-foreground'>Free</p>
                            <p className='text-label text-muted-foreground'>Core workflow</p>
                        </div>
                        <ul className='space-y-2'>
                            {FREE_FEATURES.map(feature => (
                                <li key={feature} className='flex items-start gap-2 text-label'>
                                    <Check size={11} className='mt-0.5 shrink-0 text-success' />
                                    <span className='text-foreground'>
                                        {feature === 'Project cap based on current plan'
                                            ? `Up to ${resolvedProjectLimit} projects`
                                            : feature}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className='rounded-md ui-surface-primary-subtle p-4'>
                        <div className='mb-3'>
                            <p className='text-small font-semibold text-foreground'>Pro</p>
                            <p className='text-label text-muted-foreground'>
                                Everything in Free, plus:
                            </p>
                        </div>
                        <ul className='space-y-2'>
                            {PRO_FEATURES.map(feature => (
                                <li key={feature} className='flex items-start gap-2 text-label'>
                                    <Check size={11} className='mt-0.5 shrink-0 text-primary' />
                                    <span className='text-foreground'>{feature}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className='mt-2 flex items-center justify-between gap-2 px-6 py-4'>
                    <StartTrialButton variant='ghost' label='Or start a 30-day trial' />
                    <div className='flex items-center gap-2'>
                        <Button variant='ghost' size='sm' onClick={onClose}>
                            Continue with Free
                        </Button>
                        <Button
                            size='sm'
                            variant='default'
                            onClick={() => {
                                void (async () => {
                                    const result = await getLicenseState();
                                    const savedEmail = result.ok ? result.data.savedEmail : '';
                                    await openCheckoutOrUpgradeUrl(savedEmail || '', upgradeUrl);
                                })();
                                onClose();
                            }}
                        >
                            {primaryLabel}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
