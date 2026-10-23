// SPDX-License-Identifier: GPL-3.0-only

import { THEME_TOKENS, type ThemePreset } from './themePresetTypes';

/**
 * Applies a theme preset's tokens to the document root as inline CSS
 * custom-property overrides, on top of the data-theme='light'|'dark' CSS
 * defaults in tokens.css. Resets every previous preset's overrides first, so
 * switching presets never leaves a stale token behind.
 */
export function applyThemePreset(preset: ThemePreset, accentOverride?: string): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', preset.appearance);

    for (const name of THEME_TOKENS) {
        root.style.removeProperty(name);
    }
    for (const [name, value] of Object.entries(preset.tokens)) {
        if (value) root.style.setProperty(name, value);
    }

    // The user's explicit accent-color override always wins over the preset's own accent.
    if (accentOverride) {
        root.style.setProperty('--user-accent', accentOverride);
    }
}
