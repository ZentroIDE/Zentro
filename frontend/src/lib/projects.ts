// SPDX-License-Identifier: GPL-3.0-only

import { ENVIRONMENT_KEY } from './constants';
import type { EnvironmentKey } from '../types/project';

export const ENVIRONMENT_KEYS: EnvironmentKey[] = [
    ENVIRONMENT_KEY.DEVELOPMENT,
    ENVIRONMENT_KEY.STAGING,
    ENVIRONMENT_KEY.PRODUCTION,
];

const ENVIRONMENT_ORDER_INDEX = ENVIRONMENT_KEYS.reduce<Record<EnvironmentKey, number>>(
    (acc, key, index) => {
        acc[key] = index;
        return acc;
    },
    {} as Record<EnvironmentKey, number>,
);

// Single source of truth for all env color styling.
// badgeClass    — solid badge (full bg, white text) used in EnvironmentBadge
// colorClass    — tinted variant (low-opacity bg, colored text/border) used in meta/toolbar
//
// Both are fixed brand colors (blue/amber/red), not theme tokens — see the
// env-badge-*/env-toolbar-* comment in index.css for why environment identity
// can't follow the theme's accent color.
export const ENVIRONMENT_BRAND: Record<EnvironmentKey, { badgeClass: string; colorClass: string }> =
    {
        [ENVIRONMENT_KEY.DEVELOPMENT]: {
            badgeClass: 'env-badge-dev',
            colorClass: 'text-[#0078d4] border-[#0078d4]/35 bg-[#0078d4]/9',
        },
        [ENVIRONMENT_KEY.STAGING]: {
            badgeClass: 'env-badge-sta',
            colorClass: 'text-[#b45309] border-[#b45309]/45 bg-[#b45309]/12',
        },
        [ENVIRONMENT_KEY.PRODUCTION]: {
            badgeClass: 'env-badge-pro',
            colorClass: 'text-[#c92a2a] border-[#c92a2a]/45 bg-[#c92a2a]/11',
        },
    };

const ENVIRONMENT_META: Record<
    EnvironmentKey,
    { label: string; description: string; colorClass: string }
> = {
    [ENVIRONMENT_KEY.DEVELOPMENT]: {
        label: 'Development',
        description: 'Main development environment for routine build and feature work.',
        colorClass: ENVIRONMENT_BRAND[ENVIRONMENT_KEY.DEVELOPMENT].colorClass,
    },
    [ENVIRONMENT_KEY.STAGING]: {
        label: 'Staging',
        description: 'Pre-production validation with more caution and cleaner parity expectations.',
        colorClass: ENVIRONMENT_BRAND[ENVIRONMENT_KEY.STAGING].colorClass,
    },
    [ENVIRONMENT_KEY.PRODUCTION]: {
        label: 'Production',
        description: 'Protected live environment where risk should stay explicit and controlled.',
        colorClass: ENVIRONMENT_BRAND[ENVIRONMENT_KEY.PRODUCTION].colorClass,
    },
};

export function getEnvironmentMeta(key?: string | null) {
    if (!key) {
        return {
            label: 'Unknown',
            description: 'Environment metadata is not available yet.',
            colorClass: 'text-muted-foreground border-border/45 bg-muted/20',
        };
    }
    return (
        ENVIRONMENT_META[key as EnvironmentKey] || {
            label: key.toUpperCase(),
            description: 'Custom environment metadata is not available yet.',
            colorClass: 'text-muted-foreground border-border/45 bg-muted/20',
        }
    );
}

export function getEnvironmentLabel(key?: string | null) {
    return getEnvironmentMeta(key).label;
}

const ENVIRONMENT_SHORT_LABEL: Record<EnvironmentKey, string> = {
    [ENVIRONMENT_KEY.DEVELOPMENT]: 'DEV',
    [ENVIRONMENT_KEY.STAGING]: 'STAG',
    [ENVIRONMENT_KEY.PRODUCTION]: 'PROD',
};

export function getEnvironmentShortLabel(key?: string | null): string {
    const shortLabel = key ? ENVIRONMENT_SHORT_LABEL[key as EnvironmentKey] : undefined;
    return shortLabel || getEnvironmentMeta(key).label.toUpperCase();
}

export function isProtectedEnvironmentKey(key?: string | null): key is EnvironmentKey {
    return key === ENVIRONMENT_KEY.STAGING || key === ENVIRONMENT_KEY.PRODUCTION;
}

// Theme-aware surface tint (toolbar, schema diff). Classes live in index.css
// so dark mode can use a stronger mix than light mode.
const ENVIRONMENT_TOOLBAR_BG: Record<EnvironmentKey, string> = {
    [ENVIRONMENT_KEY.DEVELOPMENT]: 'env-toolbar-dev',
    [ENVIRONMENT_KEY.STAGING]: 'env-toolbar-sta',
    [ENVIRONMENT_KEY.PRODUCTION]: 'env-toolbar-pro',
};

export function getEnvironmentBgClass(key?: string | null): string {
    if (!key) return '';
    return ENVIRONMENT_TOOLBAR_BG[key as EnvironmentKey] ?? '';
}

export function getEnvironmentOrderIndex(key?: EnvironmentKey | null): number {
    if (!key) return Number.MAX_SAFE_INTEGER;
    return ENVIRONMENT_ORDER_INDEX[key] ?? Number.MAX_SAFE_INTEGER;
}

export function sortEnvironmentKeys(keys: EnvironmentKey[]): EnvironmentKey[] {
    return [...keys].sort((a, b) => getEnvironmentOrderIndex(a) - getEnvironmentOrderIndex(b));
}
