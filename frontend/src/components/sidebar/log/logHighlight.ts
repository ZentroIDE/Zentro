// SPDX-License-Identifier: GPL-3.0-only

import type { BeforeMount } from '@monaco-editor/react';
import type { MonacoThemeRule, ThemePreset } from '../../../lib/theme/themePresetTypes';

// Monaco has no per-instance theme — `editor.setTheme()` is global. So the log
// views can't ship their own `applog-*` theme without yanking every SQL editor
// onto it the moment a log tab mounts. Instead these token rules are folded
// into *every* app Monaco theme (see useThemeManager.registerSqlMonacoThemes),
// and the log editors just use the active app theme like everything else. The
// `log.*` / `rt.*` tokens are inert for SQL, so this is a no-op there.

export const LOG_TOKEN_RULES_DARK: MonacoThemeRule[] = [
    { token: 'log.timestamp', foreground: '6b7280' },
    { token: 'log.fatal', foreground: 'f87171', fontStyle: 'bold' },
    { token: 'log.error', foreground: 'f87171', fontStyle: 'bold' },
    { token: 'log.warn', foreground: 'fbbf24' },
    { token: 'log.info', foreground: '60a5fa' },
    { token: 'log.debug', foreground: '9ca3af' },
    { token: 'log.extra', foreground: '6b7280' },
    { token: 'rt.connection', foreground: '34d399' },
    { token: 'rt.query', foreground: '60a5fa' },
    { token: 'rt.schema', foreground: 'a78bfa' },
    { token: 'rt.transaction', foreground: 'fb923c' },
];

export const LOG_TOKEN_RULES_LIGHT: MonacoThemeRule[] = [
    { token: 'log.timestamp', foreground: '9ca3af' },
    { token: 'log.fatal', foreground: 'b91c1c', fontStyle: 'bold' },
    { token: 'log.error', foreground: 'dc2626', fontStyle: 'bold' },
    { token: 'log.warn', foreground: 'd97706' },
    { token: 'log.info', foreground: '2563eb' },
    { token: 'log.debug', foreground: '6b7280' },
    { token: 'log.extra', foreground: '9ca3af' },
    { token: 'rt.connection', foreground: '059669' },
    { token: 'rt.query', foreground: '2563eb' },
    { token: 'rt.schema', foreground: '7c3aed' },
    { token: 'rt.transaction', foreground: 'ea580c' },
];

// Monaco token-rule foregrounds must be bare hex — `var()`/`color-mix()`
// can't resolve here (this runs in JS, not CSS), so treat those as absent
// and let the caller fall back to the static default rather than handing
// Monaco an illegal color (it throws and takes the whole app down with it).
function stripHash(value: string | undefined): string | undefined {
    if (!value || value.includes('var(') || value.includes('color-mix')) return undefined;
    return value.replace(/^#/, '');
}

// Zentro's own two presets intentionally keep the static, hand-curated
// VS Code-style log palette above rather than deriving one from their status
// tokens — those are a separate, deliberately different palette tuned for
// log readability, not meant to track the app's general status colors.
// (Historically this branched on "does the preset have any tokens at all",
// back when dark-2026/light-2026 shipped `tokens: {}` — now that both
// declare their tokens explicitly for clarity, that signal no longer holds,
// so key off preset identity instead.)
const PRESETS_WITH_CURATED_LOG_PALETTE = new Set(['dark-2026', 'light-2026']);

/**
 * Builds per-preset Monaco log-token rules from a preset's own literal status
 * tokens, so each theme's log/runtime severity colors match its own palette.
 * Any token a preset doesn't set as a literal hex (var()/color-mix chains,
 * or simply missing) falls back to the static default per rule below.
 */
export function buildLogTokenRules(preset: ThemePreset): MonacoThemeRule[] {
    if (PRESETS_WITH_CURATED_LOG_PALETTE.has(preset.id)) {
        return preset.appearance === 'dark' ? LOG_TOKEN_RULES_DARK : LOG_TOKEN_RULES_LIGHT;
    }

    const destructive = stripHash(preset.tokens['--status-destructive']);
    const warning = stripHash(preset.tokens['--status-warning']);
    const success = stripHash(preset.tokens['--status-success']);
    const info = stripHash(preset.tokens['--status-info']);
    const accent = stripHash(preset.tokens['--user-accent']);
    const secondary = stripHash(preset.tokens['--content-secondary']);
    const muted = stripHash(preset.tokens['--content-muted']);

    return [
        { token: 'log.timestamp', foreground: muted ?? '6b7280' },
        { token: 'log.fatal', foreground: destructive ?? 'f87171', fontStyle: 'bold' },
        { token: 'log.error', foreground: destructive ?? 'f87171', fontStyle: 'bold' },
        { token: 'log.warn', foreground: warning ?? 'fbbf24' },
        { token: 'log.info', foreground: accent ?? '60a5fa' },
        { token: 'log.debug', foreground: secondary ?? '9ca3af' },
        { token: 'log.extra', foreground: muted ?? '6b7280' },
        { token: 'rt.connection', foreground: success ?? '34d399' },
        { token: 'rt.query', foreground: accent ?? '60a5fa' },
        { token: 'rt.schema', foreground: info ?? 'a78bfa' },
        { token: 'rt.transaction', foreground: warning ?? 'fb923c' },
    ];
}

export const registerLogLanguages: BeforeMount = monaco => {
    if (!monaco.languages.getLanguages().find(l => l.id === 'applog')) {
        monaco.languages.register({ id: 'applog' });
        monaco.languages.setMonarchTokensProvider('applog', {
            tokenizer: {
                root: [
                    [/\d{4}-\d{2}-\d{2}T[\d:.+\-Z]+/, 'log.timestamp'],
                    [/\bFATAL\b/, 'log.fatal'],
                    [/\bERROR\b/, 'log.error'],
                    [/\bWARN\b/, 'log.warn'],
                    [/\bINFO\b/, 'log.info'],
                    [/\bDEBUG\b/, 'log.debug'],
                    [/\{.*\}/, 'log.extra'],
                    [/./, ''],
                ],
            },
        });
    }

    if (!monaco.languages.getLanguages().find(l => l.id === 'rtlog')) {
        monaco.languages.register({ id: 'rtlog' });
        monaco.languages.setMonarchTokensProvider('rtlog', {
            tokenizer: {
                root: [
                    [/\d{4}-\d{2}-\d{2}T[\d:.+\-Z]+/, 'log.timestamp'],
                    [/\bCONNECTION\b/, 'rt.connection'],
                    [/\bQUERY\b/, 'rt.query'],
                    [/\bSCHEMA\b/, 'rt.schema'],
                    [/\bTRANSACTION\b/, 'rt.transaction'],
                    [/./, ''],
                ],
            },
        });
    }
};
