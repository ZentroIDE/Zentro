// SPDX-License-Identifier: GPL-3.0-only

import { ACTIVATION_STATUS, TIER } from './types';
import type {
    LicenseState,
    Entitlement,
    ActivationStatus,
    LicenseLimit,
    SeatInfo,
    Tier,
    CapabilityMap,
    LicenseLimitMap,
    AccessResult,
} from './types';
// license.AccessResult is generated regardless of edition — core's
// CheckFeatureAccess (app_entitlement_facade.go) always binds it.
import type { license } from '../../../wailsjs/go/models';
// Mirrors internal/extensions/license's State/Entitlement/Limit/Policy/URLs
// JSON shape by hand instead of importing `license.*` from the generated
// wailsjs/go/models — that whole license namespace (besides AccessResult,
// which core's CheckFeatureAccess still binds) only exists in a build with
// at least one Pro license method bound (ADR 0019, #130), so a build
// exported without pro_license_facade.go wouldn't generate it at all.
type RawEntitlement = { feature_id: string; enabled: boolean; limit?: number };
type RawLimit = { id: string; value?: number };
type RawPolicy = { require_online_refresh?: boolean; refresh_interval_minute?: number };
type RawUrls = { upgrade?: string; manage?: string };

type RawCapabilityConfig = {
    enabled?: boolean;
    tier?: string;
    limit?: number;
    reason?: string;
    rules?: Record<string, string | number | boolean>;
};

type RawLicenseSignatureMeta = {
    verified?: boolean;
    source?: 'fallback' | 'legacy' | 'signed';
    algorithm?: string;
    key_id?: string;
    reason?: string;
};

export type RawWailsLicenseState = {
    status: string;
    tier?: string;
    masked_key?: string;
    session_token?: string;
    expires_at?: unknown;
    entitlements?: RawEntitlement[];
    limits?: RawLimit[];
    policy?: RawPolicy;
    urls?: RawUrls;
    last_error?: string;
    last_sync_at?: unknown;
    next_refresh_at?: unknown;
    offline_grace_until?: unknown;
    seat?: unknown;
    capabilities?: Record<string, RawCapabilityConfig>;
    limit_map?: Record<string, number>;
    installation_id?: string;
    saved_email?: string;
    restore_available?: boolean;
    issued_at?: string;
    signature_meta?: RawLicenseSignatureMeta;
    signed_entitlement?: {
        payload?: {
            source?: string;
        };
    };
};

function buildCapabilityMap(entitlements: Entitlement[]): CapabilityMap {
    return entitlements.reduce<CapabilityMap>((acc, entitlement) => {
        acc[entitlement.featureId] = {
            enabled: entitlement.enabled,
            ...(typeof entitlement.limit === 'number' ? { limit: entitlement.limit } : {}),
        };
        return acc;
    }, {});
}

function buildLimitMap(limits: LicenseLimit[]): LicenseLimitMap {
    return limits.reduce<LicenseLimitMap>((acc, limit) => {
        acc[limit.id] = limit.value;
        return acc;
    }, {});
}

function resolveCanonicalStatus(raw: RawWailsLicenseState): ActivationStatus {
    return (raw.status as ActivationStatus) ?? ACTIVATION_STATUS.INACTIVE;
}

function resolveCanonicalTier(raw: RawWailsLicenseState): Tier {
    const t = raw.tier as string;
    if (t === TIER.PRO) return TIER.PRO;
    if (t === TIER.TEAM) return TIER.TEAM;
    if (t === TIER.ENTERPRISE) return TIER.ENTERPRISE;
    return TIER.FREE;
}

type RawSeatInfo = { seat_id?: string; total_seats?: number; used_seats?: number } | undefined;

function mapSeatInfo(raw: RawSeatInfo): SeatInfo {
    return {
        seatId: raw?.seat_id ?? '',
        totalSeats: Number(raw?.total_seats ?? 0),
        usedSeats: Number(raw?.used_seats ?? 0),
    };
}

type RawAccessResult = license.AccessResult | undefined;

export function mapAccessResult(raw: RawAccessResult): AccessResult {
    return {
        allowed: Boolean(raw?.allowed),
        code: raw?.code ?? 'tier_required',
        ...(raw?.required_tier ? { requiredTier: raw.required_tier as Tier } : {}),
    };
}

function resolveDaysRemaining(expiresAt?: string): number {
    if (!expiresAt) return 0;
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) return 0;
    const diffMs = parsed.getTime() - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function mapWailsLicenseState(raw: RawWailsLicenseState): LicenseState {
    const state = raw;
    const entitlements: Entitlement[] = (raw.entitlements ?? []).map(e => ({
        featureId: e.feature_id,
        enabled: e.enabled,
        limit: e.limit,
    }));
    const limits: LicenseLimit[] = (raw.limits ?? []).map(item => ({
        id: item.id,
        value: Number(item.value ?? 0),
    }));
    const capabilities =
        state.capabilities && Object.keys(state.capabilities).length > 0
            ? Object.fromEntries(
                  Object.entries(state.capabilities).map(([featureId, config]) => [
                      featureId,
                      {
                          enabled: Boolean(config?.enabled),
                          tier: config?.tier,
                          limit:
                              typeof config?.limit === 'number' ? Number(config.limit) : undefined,
                          reason: config?.reason,
                          rules: config?.rules,
                      },
                  ]),
              )
            : buildCapabilityMap(entitlements);
    const limitMap =
        state.limit_map && Object.keys(state.limit_map).length > 0
            ? Object.fromEntries(
                  Object.entries(state.limit_map).map(([limitId, value]) => [
                      limitId,
                      Number(value ?? 0),
                  ]),
              )
            : buildLimitMap(limits);
    const entitlementSource = state.signed_entitlement?.payload?.source;
    const isTrialSource = entitlementSource === 'trial';
    const expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at : undefined;
    const trialActive =
        raw.status === ACTIVATION_STATUS.ACTIVE && raw.tier === TIER.PRO && isTrialSource;
    const trialEnded = isTrialSource && raw.status !== ACTIVATION_STATUS.ACTIVE;

    return {
        status: resolveCanonicalStatus(raw),
        tier: resolveCanonicalTier(raw),
        entitlements,
        limits,
        capabilities,
        limitMap,
        policy: {
            requireOnlineRefresh: Boolean(raw.policy?.require_online_refresh),
            refreshIntervalMinutes: Number(raw.policy?.refresh_interval_minute ?? 30),
        },
        trial: {
            active: trialActive,
            ended: trialEnded,
            daysRemaining: trialActive ? resolveDaysRemaining(expiresAt) : 0,
            endsAt: expiresAt,
        },
        urls: {
            upgrade: raw.urls?.upgrade,
            manage: raw.urls?.manage,
        },
        licenseKeyMasked: raw.masked_key,
        sessionToken: raw.session_token,
        expiresAt,
        lastError: raw.last_error,
        lastSyncAt: typeof raw.last_sync_at === 'string' ? raw.last_sync_at : undefined,
        nextRefreshAt: typeof raw.next_refresh_at === 'string' ? raw.next_refresh_at : undefined,
        offlineGraceUntil:
            typeof raw.offline_grace_until === 'string' ? raw.offline_grace_until : undefined,
        installationId:
            typeof state.installation_id === 'string' ? state.installation_id : undefined,
        savedEmail: typeof state.saved_email === 'string' ? state.saved_email : undefined,
        restoreAvailable: Boolean(state.restore_available),
        issuedAt: typeof state.issued_at === 'string' ? state.issued_at : undefined,
        signature: {
            verified: Boolean(state.signature_meta?.verified),
            source: state.signature_meta?.source ?? 'legacy',
            algorithm: state.signature_meta?.algorithm,
            keyId: state.signature_meta?.key_id,
            reason: state.signature_meta?.reason,
        },
        seat: mapSeatInfo((raw as any).seat),
    };
}
