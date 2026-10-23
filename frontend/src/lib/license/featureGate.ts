// SPDX-License-Identifier: GPL-3.0-only

import { ACTIVATION_STATUS, TIER } from './types';
import type { LicenseState, Tier } from './types';
import { ENTITLEMENT_MATRIX, type FeatureId } from './entitlementMatrix';
import { PRICING_URL } from '../../lib/appUrls';

function isLicensed(state: LicenseState): boolean {
    return state.status === ACTIVATION_STATUS.ACTIVE;
}

export type FeatureUiAccessState = 'enabled' | 'upgrade' | 'disabled';

export interface FeatureUiAccess {
    state: FeatureUiAccessState;
    badgeLabel: 'Included' | 'Pro' | 'Team' | 'Enterprise' | 'Unavailable';
    helperText: string;
    ctaLabel?: string;
}

export class FeatureGate {
    constructor(private readonly state: LicenseState) {}

    canUse(featureId: string): boolean {
        const capability = this.state.capabilities?.[featureId];
        if (capability) {
            return capability.enabled === true;
        }
        const policy = ENTITLEMENT_MATRIX[featureId as FeatureId];
        if (!policy) return true;
        if (policy.requiresActiveLicense && !isLicensed(this.state)) return false;
        return policy.defaultEnabled;
    }

    /**
     * True when the user has full access: active Pro, Team, Enterprise, or
     * Pro Early Access. zentro-api reports status "active" for the Free plan
     * too (it means "entitlement synced", not "paid"), so this must also
     * check tier or Free users would read as fully licensed.
     */
    get hasFullAccess(): boolean {
        return this.state.tier !== TIER.FREE && isLicensed(this.state);
    }

    /** True for any paid tier with an active license (Pro, Team, Enterprise). */
    get hasActiveLicense(): boolean {
        return this.state.tier !== TIER.FREE && this.state.status === ACTIVATION_STATUS.ACTIVE;
    }

    /** True when the tier is exactly Pro (not Team or Enterprise), and paid —
     *  not a trial. */
    get isPro(): boolean {
        return (
            this.state.tier === TIER.PRO &&
            this.state.status === ACTIVATION_STATUS.ACTIVE &&
            !this.isTrial
        );
    }

    get isTeam(): boolean {
        return this.state.tier === TIER.TEAM && this.state.status === ACTIVATION_STATUS.ACTIVE;
    }

    get isEnterprise(): boolean {
        return (
            this.state.tier === TIER.ENTERPRISE && this.state.status === ACTIVATION_STATUS.ACTIVE
        );
    }

    /** True during the 30-day Pro trial (ADR 0019). */
    get isTrial(): boolean {
        return this.state.trial.active;
    }

    get isTrialEnded(): boolean {
        return this.state.trial.ended;
    }

    get trialDaysRemaining(): number {
        return this.state.trial.daysRemaining;
    }

    get isVerified(): boolean {
        return this.state.signature.verified === true;
    }

    get hasOfflineGraceActive(): boolean {
        if (!this.state.offlineGraceUntil) return false;
        const parsed = new Date(this.state.offlineGraceUntil);
        if (Number.isNaN(parsed.getTime())) return false;
        return parsed.getTime() > Date.now();
    }

    get projectLimit(): number {
        const limit = this.getLimit('max_projects');
        return typeof limit === 'number' && limit > 0 ? limit : Number.POSITIVE_INFINITY;
    }

    get hasUnlimitedProjects(): boolean {
        return !Number.isFinite(this.projectLimit);
    }

    get projectLimitLabel(): string {
        return Number.isFinite(this.projectLimit)
            ? `Up to ${this.projectLimit} projects`
            : 'Unlimited projects';
    }

    isProjectLimitReached(admittedProjects: number): boolean {
        return Number.isFinite(this.projectLimit) && admittedProjects >= this.projectLimit;
    }

    getProjectUsageLabel(admittedProjects: number): string {
        if (!Number.isFinite(this.projectLimit)) {
            return `${admittedProjects} projects admitted`;
        }
        return `${admittedProjects} / ${this.projectLimit} projects used`;
    }

    get upgradeUrl(): string {
        return this.state.urls.upgrade || PRICING_URL;
    }

    get manageUrl(): string {
        return this.state.urls.manage || this.upgradeUrl;
    }

    get tierLabel(): string {
        return this.state.tier.toUpperCase();
    }

    /**
     * Returns the minimum tier required to unlock a feature, or null if already accessible.
     * Used for building upgrade prompts without a separate RPC call.
     */
    requiredTierFor(featureId: string): Tier | null {
        const cap = this.state.capabilities?.[featureId];
        if (!cap || cap.enabled) return null;
        return (cap.tier as Tier) || null;
    }

    /**
     * Returns a human-readable upgrade message for featureId, or null if accessible.
     */
    upgradeMessageFor(featureId: string): string | null {
        const tier = this.requiredTierFor(featureId);
        if (!tier) return null;
        const messages: Record<string, string> = {
            pro: 'Available on Pro plan',
            team: 'Available on Team plan',
            enterprise: 'Available on Enterprise plan',
        };
        return messages[tier] ?? null;
    }

    getLimit(limitId: string): number | undefined {
        if (
            this.state.limitMap &&
            Object.prototype.hasOwnProperty.call(this.state.limitMap, limitId)
        ) {
            return this.state.limitMap[limitId];
        }
        const limit = this.state.limits.find(item => item.id === limitId);
        return limit?.value;
    }

    getFeatureAccess(featureId: string): FeatureUiAccess {
        if (this.canUse(featureId)) {
            return {
                state: 'enabled',
                badgeLabel: 'Included',
                helperText: 'Available on your current plan.',
            };
        }

        const capability = this.state.capabilities?.[featureId];
        if (this.hasActiveLicense) {
            return {
                state: 'disabled',
                badgeLabel: 'Unavailable',
                helperText:
                    capability?.reason ||
                    'This feature is unavailable in the current entitlement state.',
            };
        }

        const requiredTier = this.requiredTierFor(featureId);
        const upgradeMsg = this.upgradeMessageFor(featureId);
        const badgeLabel =
            requiredTier === TIER.TEAM || requiredTier === TIER.ENTERPRISE
                ? requiredTier === TIER.ENTERPRISE
                    ? 'Enterprise'
                    : 'Team'
                : 'Pro';

        return {
            state: 'upgrade',
            badgeLabel: badgeLabel as FeatureUiAccess['badgeLabel'],
            helperText: capability?.reason || upgradeMsg || 'Upgrade to unlock this feature.',
            ctaLabel: `Unlock in ${badgeLabel}`,
        };
    }

    getProjectLimitAccess(admittedProjects: number): FeatureUiAccess {
        if (!this.isProjectLimitReached(admittedProjects)) {
            return {
                state: 'enabled',
                badgeLabel: 'Included',
                helperText: `You can keep working with ${this.projectLimitLabel.toLowerCase()}.`,
            };
        }

        return {
            state: 'upgrade',
            badgeLabel: 'Pro',
            helperText: `Free includes ${this.projectLimitLabel.toLowerCase()} on this installation.`,
            ctaLabel: 'Unlock unlimited projects',
        };
    }
}
