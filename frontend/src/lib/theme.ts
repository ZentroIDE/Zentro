// SPDX-License-Identifier: GPL-3.0-only

import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { getThemePreset } from './theme/themePresetRegistry';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const SYSTEM_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function normalizeThemePreference(theme: string | undefined): ThemePreference {
    if (theme === 'dark' || theme === 'light') return theme;
    return 'system';
}

export function getSystemPrefersDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(SYSTEM_THEME_MEDIA_QUERY).matches;
}

export function resolveEffectiveTheme(
    theme: string | undefined,
    systemPrefersDark = getSystemPrefersDark(),
): ResolvedTheme {
    const preference = normalizeThemePreference(theme);
    if (preference === 'dark') return 'dark';
    if (preference === 'light') return 'light';
    return systemPrefersDark ? 'dark' : 'light';
}

function subscribeToSystemTheme(onStoreChange: () => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
    }

    const mediaQuery = window.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
    const listener = () => onStoreChange();

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
}

export function useResolvedTheme(theme: string | undefined): ResolvedTheme {
    const systemPrefersDark = useSyncExternalStore(
        subscribeToSystemTheme,
        getSystemPrefersDark,
        () => false,
    );

    return resolveEffectiveTheme(theme, systemPrefersDark);
}

export function resolveMonacoTheme(
    theme: string | undefined,
    systemPrefersDark = getSystemPrefersDark(),
): 'vs' | 'vs-dark' {
    return resolveEffectiveTheme(theme, systemPrefersDark) === 'dark' ? 'vs-dark' : 'vs';
}

/**
 * Resolves the Monaco theme name for the currently active theme preset
 * (Zentro Dark / Zentro Light / Solarized Dark / Solarized Light / ...), falling
 * back to Monaco's plain 'vs'/'vs-dark' built-ins if no preset is registered
 * yet (e.g. before registerBuiltInThemePresets() has run).
 */
export function useMonacoTheme(theme: string | undefined): string {
    const effective = useResolvedTheme(theme);
    const presetId = useSettingsStore(state =>
        effective === 'dark' ? state.themePresetDark : state.themePresetLight,
    );
    const preset = getThemePreset(presetId);
    return preset?.monaco.id ?? (effective === 'dark' ? 'vs-dark' : 'vs');
}
