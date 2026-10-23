// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui';
import { getLicenseState, openCheckoutOrUpgradeUrl } from '../../lib/license/service';
import { FeatureGate } from '../../lib/license/featureGate';
import type { LicenseState } from '../../lib/license/types';

interface LicenseModalProps {
    onClose: () => void;
}

function getStatusVariant(
    state: LicenseState | null,
): React.ComponentProps<typeof Badge>['variant'] {
    if (!state) return 'muted';
    if (state.trial.active) return 'warning';
    if (state.trial.ended) return 'destructive';
    if (state.status === 'active' && state.tier !== 'free') return 'success';
    if (state.status === 'error') return 'destructive';
    return 'muted';
}

function getStatusLabel(state: LicenseState | null): string {
    if (!state) return 'Loading';
    if (state.trial.active) {
        const days = state.trial.daysRemaining;
        return `Pro trial - ${days} day${days === 1 ? '' : 's'} left`;
    }
    if (state.trial.ended) return 'Pro trial ended';
    // status 'active' just means the license record is valid/not expired —
    // Free plans are "active" too, so it must also check tier to avoid
    // labeling a Free installation as "Pro unlocked".
    if (state.status === 'active' && state.tier !== 'free') return 'Pro unlocked';
    if (state.status === 'error') return 'Needs attention';
    return 'Free plan';
}

// Only meaningful when it adds something the status badge doesn't already
// say — most states need no extra sentence at all.
function getPlanNote(state: LicenseState | null, gate: FeatureGate | null): string | null {
    if (!state || !gate) return 'Checking current license details.';
    if (gate.isTrialEnded) return 'The Free core remains fully available.';
    return null;
}

function formatDate(value?: string): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
}

export const LicenseModal: React.FC<LicenseModalProps> = ({ onClose }) => {
    const [stateLoading, setStateLoading] = useState(true);
    const [stateError, setStateError] = useState<string | null>(null);
    const [licenseState, setLicenseState] = useState<LicenseState | null>(null);

    const loadLicenseState = useCallback(async () => {
        setStateError(null);
        setStateLoading(true);
        const result = await getLicenseState();
        if (!result.ok) {
            setStateError(result.error.message);
            setStateLoading(false);
            return;
        }
        setLicenseState(result.data);
        setStateLoading(false);
    }, []);

    useEffect(() => {
        let mounted = true;

        void loadLicenseState().then(() => {
            if (!mounted) return;
        });

        return () => {
            mounted = false;
        };
    }, [loadLicenseState]);

    const gate = useMemo(
        () => (licenseState ? new FeatureGate(licenseState) : null),
        [licenseState],
    );
    const statusVariant = getStatusVariant(licenseState);
    const statusLabel = getStatusLabel(licenseState);
    const projectLimit = gate?.projectLimit;
    const proProjectLabel =
        projectLimit && Number.isFinite(projectLimit)
            ? `Up to ${projectLimit} projects`
            : 'Unlimited projects';
    const refreshAt = formatDate(licenseState?.nextRefreshAt);
    const expiresAt = formatDate(licenseState?.expiresAt);
    const offlineGraceUntil = formatDate(licenseState?.offlineGraceUntil);
    const canUpgrade = Boolean(gate && !gate.hasFullAccess);

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className='max-w-2xl overflow-hidden p-0'>
                <DialogHeader className='bg-background/70 px-6 py-5'>
                    <DialogTitle className='font-semibold'>License</DialogTitle>
                    <DialogDescription className='mt-1 max-w-xl text-small text-muted-foreground'>
                        Status of the license installed on this machine. Feature comparisons and
                        pricing live on the website.
                    </DialogDescription>
                </DialogHeader>

                <div className='max-h-[82vh] overflow-y-auto px-6 py-5'>
                    <div className='flex flex-col gap-4'>
                        <section className='rounded-md bg-card/60 p-4'>
                            <div className='flex flex-wrap items-center gap-2'>
                                <Badge variant={statusVariant}>{statusLabel}</Badge>
                                {gate?.isVerified && (
                                    <span className='ui-badge-verified'>Verified entitlement</span>
                                )}
                                {gate?.hasOfflineGraceActive && licenseState?.lastError && (
                                    <Badge variant='warning'>Offline grace active</Badge>
                                )}
                            </div>

                            {(getPlanNote(licenseState, gate) ||
                                stateError ||
                                licenseState?.lastError) && (
                                <div className='mt-3'>
                                    {getPlanNote(licenseState, gate) && (
                                        <p className='text-label text-muted-foreground'>
                                            {getPlanNote(licenseState, gate)}
                                        </p>
                                    )}
                                    {stateError && (
                                        <p className='mt-1 text-label text-destructive'>
                                            {stateError}
                                        </p>
                                    )}
                                    {licenseState?.lastError && !stateError && (
                                        <p className='mt-1 text-label text-destructive'>
                                            {licenseState.lastError}
                                        </p>
                                    )}
                                </div>
                            )}

                            {canUpgrade && (
                                <div className='mt-4 flex flex-wrap gap-2'>
                                    <Button
                                        variant='default'
                                        tone='default'
                                        size='sm'
                                        onClick={() =>
                                            openCheckoutOrUpgradeUrl(
                                                licenseState?.savedEmail || '',
                                                gate?.upgradeUrl || '',
                                            )
                                        }
                                        disabled={stateLoading}
                                    >
                                        Upgrade to Pro
                                    </Button>
                                </div>
                            )}

                            <div className='mt-4 grid gap-2 sm:grid-cols-2'>
                                <div className='rounded-md bg-background/40 p-3'>
                                    <p className='text-label uppercase tracking-wide text-muted-foreground'>
                                        Project limit
                                    </p>
                                    <p className='mt-1 text-small font-semibold text-foreground'>
                                        {gate?.projectLimitLabel || proProjectLabel}
                                    </p>
                                </div>
                                <div className='rounded-md bg-background/40 p-3'>
                                    <p className='text-label uppercase tracking-wide text-muted-foreground'>
                                        License key
                                    </p>
                                    <p className='mt-1 text-small font-semibold text-foreground'>
                                        {licenseState?.licenseKeyMasked ||
                                            (licenseState?.trial.active
                                                ? 'Trial - no license key'
                                                : 'No paid license installed')}
                                    </p>
                                </div>
                                <div className='rounded-md bg-background/40 p-3'>
                                    <p className='text-label uppercase tracking-wide text-muted-foreground'>
                                        Next refresh
                                    </p>
                                    <p className='mt-1 text-small font-semibold text-foreground'>
                                        {refreshAt || 'Not scheduled'}
                                    </p>
                                </div>
                                <div className='rounded-md bg-background/40 p-3'>
                                    <p className='text-label uppercase tracking-wide text-muted-foreground'>
                                        Expires at
                                    </p>
                                    <p className='mt-1 text-small font-semibold text-foreground'>
                                        {expiresAt || 'No paid expiry'}
                                    </p>
                                </div>
                                <div className='rounded-md bg-background/40 p-3'>
                                    <p className='text-label uppercase tracking-wide text-muted-foreground'>
                                        Offline grace
                                    </p>
                                    <p className='mt-1 text-small font-semibold text-foreground'>
                                        {offlineGraceUntil || 'Not applicable'}
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
