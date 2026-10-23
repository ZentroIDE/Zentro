// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { runSafe } from '../../shared/kernel/async';
import { createLicenseState, type AccessResult, type LicenseState } from './types';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
export const LICENSE_STATE_CHANGED_EVENT = 'zentro:license-state-changed';

function normalizeExternalURL(rawURL: string): string {
    return rawURL.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
}

/** Opens a plan's upgrade/pricing URL in the OS browser. A plain suggestion —
 *  nothing in the app activates or unlocks anything by itself. */
export function openUpgradeUrl(url: string): void {
    if (!url) return;
    BrowserOpenURL(normalizeExternalURL(url));
}

function defaultState(): LicenseState {
    return createLicenseState();
}

/** True when this build has a license client bound at all (ADR 0019, #130:
 *  the whole client — trial, restore, refresh, upgrade — is Pro-only, built
 *  from internal/app/pro_license_facade.go). A build exported without that
 *  file (the public/Community tree) never calls the license server, so
 *  every `getApiGateway().license.*` method below is simply absent — this
 *  lets UI that offers to start a trial or restore a purchase hide itself
 *  instead of rendering a button that silently does nothing. */
export function isLicenseSyncAvailable(): boolean {
    return Boolean(getApiGateway().license.getLicenseState);
}

export function emitLicenseStateChanged(): void {
    window.dispatchEvent(new Event(LICENSE_STATE_CHANGED_EVENT));
}

export async function getLicenseState() {
    return runSafe('license.state.failed', 'Unable to load license state', async () => {
        const fn = getApiGateway().license.getLicenseState;
        if (!fn) return defaultState();
        return fn();
    });
}

export async function setSavedLicenseEmail(email: string) {
    return runSafe('license.save-email.failed', 'Unable to save license email', async () => {
        const fn = getApiGateway().license.setSavedLicenseEmail;
        if (!fn) return defaultState();
        const state = await fn(email.trim());
        emitLicenseStateChanged();
        return state;
    });
}

export async function refreshLicense() {
    return runSafe('license.refresh.failed', 'Unable to refresh license status', async () => {
        const fn = getApiGateway().license.refreshLicense;
        if (!fn) return defaultState();
        const state = await fn('');
        emitLicenseStateChanged();
        return state;
    });
}

/** Starts the 30-day Pro trial (ADR 0019). The server may grant it directly
 *  or ask for email verification first — either way the result is just the
 *  next license state; there is no client-side trial counter to track. */
export async function startTrial(email: string) {
    return runSafe('license.start-trial.failed', 'Unable to start the trial', async () => {
        const fn = getApiGateway().license.startTrial;
        if (!fn) return defaultState();
        const state = await fn(email.trim());
        emitLicenseStateChanged();
        return state;
    });
}

export async function restoreLicenseByEmail(email: string) {
    return runSafe(
        'license.restore-by-email.failed',
        'Unable to restore license for this device',
        async () => {
            const fn = getApiGateway().license.restoreLicenseByEmail;
            if (!fn) return defaultState();
            const state = await fn(email.trim());
            emitLicenseStateChanged();
            return state;
        },
    );
}

const defaultAccessResult = (): AccessResult => ({ allowed: false, code: 'tier_required' });

/**
 * Returns the full access result for a feature ID.
 * Use when the UI needs contextual tier information for upgrade prompts.
 * For bulk checks, read capabilities from getLicenseState() instead.
 */
/** Opens a real Polar checkout session for the given email, falling back to
 *  the marketing pricing page (`url`) if checkout can't be created — no
 *  configured billing API, network error, or a build without a license
 *  client at all. */
export async function openCheckoutOrUpgradeUrl(email: string, fallbackUrl: string) {
    const fn = getApiGateway().license.createCheckoutUrl;
    if (fn) {
        try {
            const checkoutUrl = await fn(email.trim());
            if (checkoutUrl) {
                openUpgradeUrl(checkoutUrl);
                return;
            }
        } catch {
            // fall through to the pricing page
        }
    }
    openUpgradeUrl(fallbackUrl);
}

export async function checkFeatureAccess(featureId: string) {
    return runSafe(
        'license.check-feature-access.failed',
        'Unable to check feature access',
        async () => {
            const fn = getApiGateway().license.checkFeatureAccess;
            if (!fn) return defaultAccessResult();
            return fn(featureId);
        },
    );
}
