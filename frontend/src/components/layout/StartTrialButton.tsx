// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button } from '../ui';
import { isLicenseSyncAvailable } from '../../lib/license/service';
import { StartTrialDialog } from './StartTrialDialog';

interface StartTrialButtonProps {
    variant?: React.ComponentProps<typeof Button>['variant'];
    size?: React.ComponentProps<typeof Button>['size'];
    className?: string;
    label?: string;
}

/** A button that opens StartTrialDialog, dropped into the three places ADR
 *  0019 names: the Welcome screen, Settings > License, and an upgrade prompt
 *  the user is already looking at. */
export const StartTrialButton: React.FC<StartTrialButtonProps> = ({
    variant = 'outline',
    size = 'sm',
    className,
    label = 'Start 30-day Pro trial',
}) => {
    const [open, setOpen] = React.useState(false);

    // A build without the license client (ADR 0019, #130 — the public/
    // Community tree) has nothing for this to call; hide rather than offer
    // a trial that would silently no-op.
    if (!isLicenseSyncAvailable()) return null;

    return (
        <>
            <Button
                variant={variant}
                size={size}
                className={className}
                onClick={() => setOpen(true)}
            >
                {label}
            </Button>
            <StartTrialDialog open={open} onClose={() => setOpen(false)} />
        </>
    );
};
