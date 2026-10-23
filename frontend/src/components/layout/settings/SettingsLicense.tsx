// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlertCircle, BadgeCheck, CheckCircle2, RefreshCw } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Button, Input } from '../../ui';
import type { LicenseState } from '../../../lib/license/types';
import { openCheckoutOrUpgradeUrl } from '../../../lib/license/service';
import { StartTrialButton } from '../StartTrialButton';

interface Props {
    licenseState: LicenseState | null;
    loading: boolean;
    onOpenLicense: () => void;
    /** Shows an "Upgrade to Pro" button that just opens this URL — a
     *  suggestion, nothing in the app activates or unlocks anything. */
    upgradeUrl?: string;
    canUpgrade?: boolean;
    onRetry?: () => void;
    retrying?: boolean;
    canRetry?: boolean;
    onRefresh?: () => void;
    refreshing?: boolean;
    licenseEmail: string;
    onLicenseEmailChange: (value: string) => void;
    onSaveEmail?: () => void;
    savingEmail?: boolean;
    canSaveEmail?: boolean;
    onRestore?: () => void;
    restoring?: boolean;
    showRestore?: boolean;
    saveEmailError?: string | null;
    /** False in a build with no license client at all (ADR 0019, #130 — the
     *  public/Community tree never calls the license server). Hides the
     *  "Email for Pro access" section entirely instead of showing fields
     *  whose buttons would silently do nothing. */
    licenseSyncAvailable?: boolean;
}

export function isLicenseConnectionFailure(message?: string): boolean {
    const raw = (message || '').toLowerCase();
    return (
        raw.includes('dial tcp') ||
        raw.includes('connection refused') ||
        raw.includes('actively refused') ||
        raw.includes('timeout') ||
        raw.includes('context deadline exceeded') ||
        raw.includes('no connection could be made') ||
        raw.includes('license server returned') ||
        raw.includes('unable to load license state') ||
        raw.includes('http://') ||
        raw.includes('https://') ||
        raw.includes('/api/v1/app/license/')
    );
}

function getFriendlyLicenseError(message?: string): string {
    if (isLicenseConnectionFailure(message)) {
        return 'License server cannot connect right now.';
    }
    return 'We could not confirm license status right now.';
}

function getLicenseHeadline(state: LicenseState | null): string {
    if (!state) return 'License details are loading.';
    if (state.trial.active) {
        const days = state.trial.daysRemaining;
        return `Pro trial active - ${days} day${days !== 1 ? 's' : ''} remaining`;
    }
    if (state.trial.ended) return 'Pro trial ended';
    if (state.status === 'active' && state.tier !== 'free')
        return 'Pro is active on this installation';
    if (state.status === 'error') return 'License check needs attention';
    if (state.status === 'activating') return 'Check your email to finish';
    return 'Free core plan';
}

function getLicenseMessage(state: LicenseState | null): string {
    if (!state) return 'Checking your current plan and Pro status.';
    if (state.trial.active) {
        return `You have full Pro access through your trial, tied to ${state.savedEmail || 'the email you confirmed'}.`;
    }
    if (state.trial.ended) {
        return 'Your 30-day Pro trial has ended. Free remains available while Pro features stay locked.';
    }
    if (state.status === 'active' && state.tier !== 'free') {
        return 'Pro features are unlocked for this installation.';
    }
    if (state.status === 'error') {
        return getFriendlyLicenseError(state.lastError);
    }
    if (state.status === 'activating') {
        return 'We sent a link to your email — open it to finish activating Pro on this device.';
    }
    return 'Free covers the core SQL workflow. Pro adds stronger safety, security, and scale when you need them.';
}

export const SettingsLicense: React.FC<Props> = ({
    licenseState,
    loading,
    onOpenLicense,
    upgradeUrl,
    canUpgrade = false,
    onRetry,
    retrying = false,
    canRetry = false,
    onRefresh,
    refreshing = false,
    licenseEmail,
    onLicenseEmailChange,
    onSaveEmail,
    savingEmail = false,
    canSaveEmail = false,
    onRestore,
    restoring = false,
    showRestore = false,
    saveEmailError = null,
    licenseSyncAvailable = true,
}) => {
    const headline = loading ? 'Loading license status...' : getLicenseHeadline(licenseState);
    const message = loading
        ? 'Checking your current plan and Pro status.'
        : getLicenseMessage(licenseState);
    const detailLabel = licenseState
        ? `Status: ${licenseState.status} - Tier: ${licenseState.tier.toUpperCase()}`
        : 'Status unavailable';

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={BadgeCheck}
                title='License'
                description='Review your Free or Pro status, license details, and recovery options for this app.'
            />
            <div className={SettingsClasses.sectionContent}>
                <div className='rounded-md py-3'>
                    <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='text-small font-semibold text-foreground'>{headline}</p>
                            <p className='mt-1 text-label text-muted-foreground'>{message}</p>
                            {licenseState?.status === 'error' && licenseState.lastError && (
                                <p className='mt-2 rounded-md bg-muted/35 px-2 py-1.5 font-mono text-label text-muted-foreground whitespace-pre-wrap break-all'>
                                    {licenseState.lastError}
                                </p>
                            )}
                            <p className='mt-2 text-label text-muted-foreground'>{detailLabel}</p>
                            {licenseState?.licenseKeyMasked && (
                                <p className='mt-1 text-label text-muted-foreground'>
                                    Key: {licenseState.licenseKeyMasked}
                                </p>
                            )}
                        </div>
                        <div className='flex shrink-0 flex-col items-end gap-2'>
                            {onRefresh && (
                                <Button
                                    variant='outline'
                                    tone='default'
                                    size='sm'
                                    className='gap-2'
                                    onClick={onRefresh}
                                    disabled={loading || refreshing}
                                    title='Re-check license status with the license server'
                                >
                                    <RefreshCw
                                        size={12}
                                        className={refreshing ? 'animate-spin' : undefined}
                                    />
                                    {refreshing ? 'Refreshing...' : 'Refresh'}
                                </Button>
                            )}
                            {canRetry && (
                                <Button
                                    variant='outline'
                                    tone='default'
                                    size='sm'
                                    className='gap-2'
                                    onClick={onRetry}
                                    disabled={loading || retrying}
                                >
                                    {retrying ? 'Retrying...' : 'Retry'}
                                </Button>
                            )}
                            {canUpgrade && (
                                <>
                                    <StartTrialButton size='sm' />
                                    <Button
                                        variant='default'
                                        tone='default'
                                        size='sm'
                                        onClick={() =>
                                            openCheckoutOrUpgradeUrl(
                                                licenseEmail || licenseState?.savedEmail || '',
                                                upgradeUrl || '',
                                            )
                                        }
                                    >
                                        Upgrade to Pro
                                    </Button>
                                </>
                            )}
                            <Button
                                variant='outline'
                                tone='default'
                                size='sm'
                                className='gap-2'
                                onClick={onOpenLicense}
                            >
                                View License
                            </Button>
                        </div>
                    </div>
                    {licenseSyncAvailable && (
                        <div className='mt-4 border-t border-border/25 pt-4'>
                            <p className='text-small font-semibold text-foreground'>
                                Email for Pro access
                            </p>
                            <p className='mt-1 text-label text-muted-foreground'>
                                Keep the email you want Zentro to associate with this installation.
                                Saving just checks that email — it never activates Pro by itself.
                            </p>
                            <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                                <Input
                                    type='email'
                                    value={licenseEmail}
                                    onChange={event => onLicenseEmailChange(event.target.value)}
                                    placeholder='you@example.com'
                                    className='sm:max-w-72'
                                />
                                <Button
                                    variant='outline'
                                    tone='default'
                                    size='sm'
                                    onClick={onSaveEmail}
                                    disabled={!canSaveEmail || savingEmail}
                                >
                                    {savingEmail ? 'Saving...' : 'Save email'}
                                </Button>
                                {showRestore && (
                                    <Button
                                        variant={
                                            licenseState?.restoreAvailable ? 'default' : 'outline'
                                        }
                                        tone='default'
                                        size='sm'
                                        onClick={onRestore}
                                        disabled={restoring}
                                    >
                                        {restoring ? 'Restoring...' : 'Restore license'}
                                    </Button>
                                )}
                            </div>
                            {saveEmailError && (
                                <div className='mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-label text-destructive'>
                                    <AlertCircle size={12} className='mt-px shrink-0' />
                                    <span className='flex-1 break-words'>{saveEmailError}</span>
                                </div>
                            )}
                            {!saveEmailError && licenseState?.restoreAvailable && (
                                <div className='mt-2 flex items-start gap-1.5 rounded-md bg-accent/10 px-2.5 py-1.5 text-label text-accent'>
                                    <CheckCircle2 size={12} className='mt-px shrink-0' />
                                    <span className='flex-1 break-words'>
                                        This email already has an active Pro plan. Click{' '}
                                        <span className='font-semibold'>Restore license</span> to
                                        activate it on this device — we'll send a confirmation link
                                        to your email first.
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
