// SPDX-License-Identifier: GPL-3.0-only

// Paired with ActivationStatus/Tier values in
// internal/extensions/license/contracts.go — crosses the wire via
// GetLicenseState. Keep both sides in sync.
export const ACTIVATION_STATUS = {
    INACTIVE: 'inactive',
    ACTIVATING: 'activating',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    ERROR: 'error',
} as const;
export type ActivationStatus = (typeof ACTIVATION_STATUS)[keyof typeof ACTIVATION_STATUS];

export const TIER = {
    FREE: 'free',
    PRO: 'pro',
    TEAM: 'team',
    ENTERPRISE: 'enterprise',
} as const;
export type Tier = (typeof TIER)[keyof typeof TIER];

export interface Entitlement {
    featureId: string;
    enabled: boolean;
    limit?: number;
}

export interface LicenseLimit {
    id: string;
    value: number;
}

export type CapabilityRuleValue = boolean | string | number;

export interface CapabilityConfig {
    enabled: boolean;
    tier?: string;
    limit?: number;
    reason?: string;
    rules?: Record<string, CapabilityRuleValue>;
}

export type CapabilityMap = Record<string, CapabilityConfig>;
export type LicenseLimitMap = Record<string, number>;

export interface SeatInfo {
    seatId: string;
    totalSeats: number; // 0 = not applicable (Free/Pro)
    usedSeats: number;
}

export interface AccessResult {
    allowed: boolean;
    code: string; // see ErrCode* constants: 'ok' | 'tier_required' | 'seat_limit_exceeded' | ...
    requiredTier?: Tier;
}

export interface LicenseSignatureMeta {
    verified: boolean;
    source: 'fallback' | 'legacy' | 'signed';
    algorithm?: string;
    keyId?: string;
    reason?: string;
}

export type EntitlementMatrix = Record<
    string,
    { defaultEnabled: boolean; requiresActiveLicense?: boolean }
>;

export interface LicensePolicy {
    requireOnlineRefresh: boolean;
    refreshIntervalMinutes: number;
}

/** The 30-day Pro trial (ADR 0019): active Pro with no license key,
 *  time-boxed. */
export interface TrialInfo {
    active: boolean;
    ended: boolean;
    daysRemaining: number;
    endsAt?: string;
}

export interface LicenseUrls {
    upgrade?: string;
    manage?: string;
}

export interface LicenseState {
    status: ActivationStatus;
    tier: Tier;
    licenseKeyMasked?: string;
    sessionToken?: string;
    expiresAt?: string;
    entitlements: Entitlement[];
    limits: LicenseLimit[];
    capabilities: CapabilityMap;
    limitMap: LicenseLimitMap;
    policy: LicensePolicy;
    trial: TrialInfo;
    urls: LicenseUrls;
    lastError?: string;
    lastSyncAt?: string;
    nextRefreshAt?: string;
    offlineGraceUntil?: string;
    installationId?: string;
    savedEmail?: string;
    restoreAvailable: boolean;
    issuedAt?: string;
    signature: LicenseSignatureMeta;
    seat: SeatInfo; // zero value for Free/Pro (seatId='', totalSeats=0)
}

export function createLicenseState(overrides: Partial<LicenseState> = {}): LicenseState {
    return {
        status: ACTIVATION_STATUS.INACTIVE,
        tier: TIER.FREE,
        entitlements: [],
        limits: [],
        capabilities: {},
        limitMap: {},
        policy: {
            requireOnlineRefresh: true,
            refreshIntervalMinutes: 30,
        },
        trial: {
            active: false,
            ended: false,
            daysRemaining: 0,
        },
        urls: {},
        restoreAvailable: false,
        signature: {
            verified: false,
            source: 'fallback',
        },
        seat: { seatId: '', totalSeats: 0, usedSeats: 0 },
        ...overrides,
    };
}

export interface LicenseBackendContract {
    RestoreLicenseByEmail(email: string): Promise<LicenseState>;
    ActivateLicense(key: string, deviceInfo: string): Promise<LicenseState>;
    RefreshLicense(sessionToken: string): Promise<LicenseState>;
    DeactivateLicense(reason: string): Promise<void>;
    GetLicenseState(): Promise<LicenseState>;
    SetSavedLicenseEmail(email: string): Promise<LicenseState>;
    CheckFeatureAccess(featureId: string): Promise<AccessResult>;
}
