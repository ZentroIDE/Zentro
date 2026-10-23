// SPDX-License-Identifier: GPL-3.0-only

import { ENVIRONMENT_STRICTNESS, SAFETY_LEVEL } from '../lib/constants';
import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';
import { utils } from '../../wailsjs/go/models';
import type { app } from '../../wailsjs/go/models';
import type { ExecutionPolicy, SafetyLevel } from '../types/policy';
import { ToastPlacement } from '../components/layout/Toast';
import { useShortcutStore } from './shortcutStore';
import { useLayoutStore } from './layoutStore';
import { normalizeThemePreference, resolveEffectiveTheme, type ResolvedTheme } from '../lib/theme';
import { applyThemePreset } from '../lib/theme/applyThemePreset';
import { getThemePreset } from '../lib/theme/themePresetRegistry';
import {
    DEFAULT_SQL_FORMAT,
    normalizeSqlFormat,
    toSqlFormatPrefs,
    type SqlFormatSettings,
} from '../lib/sqlFormatSettings';
import {
    DEFAULT_SQL_EDITOR_STYLE,
    normalizeSqlEditorStyle,
    toSqlEditorStylePrefs,
    type SqlEditorStyle,
} from '../lib/sqlEditorStyle';

// Snapshot of layout state saved when focus mode is turned on, restored when turned off.
// Not persisted — intentional: if app restarts in focus mode there's nothing to restore.
const DEFAULT_TOAST_PLACEMENT: ToastPlacement = 'bottom-left';
const VALID_TOAST_PLACEMENTS: ToastPlacement[] = [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
];

export type DensityLevel = 'compact' | 'comfortable' | 'spacious';

export const FONT_PRESETS: Record<string, string> = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    inter: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export const MONO_FONT_PRESETS: Record<string, string> = {
    system: 'ui-monospace, Consolas, Menlo, monospace',
    cascadia: '"Cascadia Code", ui-monospace, Consolas, Menlo, monospace',
    jetbrains: '"JetBrains Mono", ui-monospace, Consolas, Menlo, monospace',
    firaCode: '"Fira Code", ui-monospace, Consolas, Menlo, monospace',
};

export const DEFAULT_THEME_PRESET_LIGHT = 'light-2026';
export const DEFAULT_THEME_PRESET_DARK = 'dark-2026';

const VALID_DENSITIES: DensityLevel[] = ['compact', 'comfortable', 'spacious'];

function mapExecutionPolicy(raw: app.ExecutionPolicy): ExecutionPolicy {
    return {
        timeoutSeconds: raw.timeout_seconds,
        rowCapPerTab: raw.row_cap_per_tab,
        destructiveRules: raw.destructive_rules === 'block' ? 'block' : 'prompt',
        environmentStrictness:
            raw.environment_strictness === ENVIRONMENT_STRICTNESS.STRICT
                ? ENVIRONMENT_STRICTNESS.STRICT
                : ENVIRONMENT_STRICTNESS.NORMAL,
        safetyLevel: (raw.safety_level as SafetyLevel) || SAFETY_LEVEL.BALANCED,
        isProduction: raw.is_production === true,
        locked: raw.locked === true,
    };
}

function mapExecutionPolicies(
    raw: Record<string, app.ExecutionPolicy>,
): Record<string, ExecutionPolicy> {
    const mapped: Record<string, ExecutionPolicy> = {};
    for (const [envKey, policy] of Object.entries(raw || {})) {
        mapped[envKey] = mapExecutionPolicy(policy);
    }
    return mapped;
}

function normalizeEnvironmentSafetyLevels(
    raw: Record<string, string> | undefined,
): Record<string, SafetyLevel> {
    const normalized: Record<string, SafetyLevel> = {};
    for (const [envKey, level] of Object.entries(raw || {})) {
        if (
            level === SAFETY_LEVEL.STRICT ||
            level === SAFETY_LEVEL.BALANCED ||
            level === SAFETY_LEVEL.RELAXED
        ) {
            normalized[envKey] = level;
        }
    }
    return normalized;
}

function clampNumber(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeToastPlacement(value: unknown): ToastPlacement {
    if (typeof value === 'string' && VALID_TOAST_PLACEMENTS.includes(value as ToastPlacement)) {
        return value as ToastPlacement;
    }
    return DEFAULT_TOAST_PLACEMENT;
}

function normalizeDensity(value: unknown): DensityLevel {
    if (typeof value === 'string' && VALID_DENSITIES.includes(value as DensityLevel)) {
        return value as DensityLevel;
    }
    return 'compact';
}

export function applyThemeToDOM(prefs: {
    theme?: string;
    resolvedTheme?: ResolvedTheme;
    density?: DensityLevel;
    accentColor?: string;
    fontFamily?: string;
    monoFamily?: string;
    themePresetLight?: string;
    themePresetDark?: string;
}) {
    const root = document.documentElement;
    const themePreference = normalizeThemePreference(prefs.theme);
    const effectiveTheme = prefs.resolvedTheme ?? resolveEffectiveTheme(themePreference);

    // Theme preset — resolves to the preset matching the effective light/dark
    // family, applies its color tokens, and sets data-theme itself.
    root.setAttribute('data-theme-preference', themePreference);
    const presetId =
        effectiveTheme === 'dark'
            ? (prefs.themePresetDark ?? DEFAULT_THEME_PRESET_DARK)
            : (prefs.themePresetLight ?? DEFAULT_THEME_PRESET_LIGHT);
    const preset = getThemePreset(presetId);
    if (preset) {
        applyThemePreset(preset, prefs.accentColor);
    } else {
        // Registry not populated yet (e.g. very first paint) — fall back to
        // the plain data-theme attribute; tokens.css's static defaults cover it.
        root.setAttribute('data-theme', effectiveTheme);
        if (prefs.accentColor) {
            root.style.setProperty('--user-accent', prefs.accentColor);
        } else {
            root.style.removeProperty('--user-accent');
        }
    }

    // Density — compact = no attribute (uses :root defaults)
    const density = prefs.density ?? 'compact';
    if (density === 'compact') {
        root.removeAttribute('data-density');
    } else {
        root.setAttribute('data-density', density);
    }

    // Font families — user choice wins over any theme preset's font seed. When
    // there's no user choice, leave --font-family-sans/-mono alone: applyThemePreset
    // (above) already set them from the preset's tokens, or left them unset to fall
    // through to tokens.css's var(--user-font-sans/-mono) default — removing them
    // here would wipe out a preset's font seed right after it was applied.
    if (prefs.fontFamily && FONT_PRESETS[prefs.fontFamily]) {
        root.style.setProperty('--user-font-sans', FONT_PRESETS[prefs.fontFamily]);
        root.style.setProperty('--font-family-sans', FONT_PRESETS[prefs.fontFamily]);
    } else {
        root.style.removeProperty('--user-font-sans');
    }
    if (prefs.monoFamily && MONO_FONT_PRESETS[prefs.monoFamily]) {
        root.style.setProperty('--user-font-mono', MONO_FONT_PRESETS[prefs.monoFamily]);
        root.style.setProperty('--font-family-mono', MONO_FONT_PRESETS[prefs.monoFamily]);
    } else {
        root.style.removeProperty('--user-font-mono');
    }
}

interface SettingsState {
    theme: string;
    fontSize: number;
    fontFamily: string;
    monoFamily: string;
    themePresetLight: string;
    themePresetDark: string;
    accentColor: string;
    density: DensityLevel;
    toastPlacement: ToastPlacement;
    connectTimeout: number;
    queryTimeout: number;
    viewMode: boolean;
    riskHighlight: boolean;
    minimap: boolean;
    /** Show diagnostics as text at the end of the affected line. */
    errorLens: boolean;
    /** Options the backend SQL formatter reads on every Format Query. */
    sqlFormat: SqlFormatSettings;
    /** Per-appearance SQL token colour overrides; empty means "follow the theme". */
    sqlEditorStyle: SqlEditorStyle;
    editorFocusMode: boolean;
    editorFocusWidth: number;
    focusModeLayoutSnapshot: {
        showSidebar: boolean;
        showResultPanel: boolean;
        showRightSidebar: boolean;
    } | null;
    saveTimeout: ReturnType<typeof window.setTimeout> | null;
    toggleEditorFocusMode: () => void;

    // Backend-resolved Execution Policies keyed by environment key (ADR-0008).
    environmentPolicies: Record<string, ExecutionPolicy>;
    environmentSafetyLevels: Record<string, SafetyLevel>;

    load: () => Promise<void>;
    save: (prefs: utils.Preferences) => Promise<void>;
    loadEnvironmentPolicies: () => Promise<void>;
    setEnvironmentSafetyLevel: (environmentKey: string, level: SafetyLevel) => Promise<void>;
    setFontSize: (size: number) => void;
    updateFontSize: (delta: number) => void;
}

export const useSettingsStore = create<SettingsState>(set => ({
    theme: 'system',
    fontSize: 14,
    fontFamily: 'system',
    monoFamily: 'cascadia',
    themePresetLight: DEFAULT_THEME_PRESET_LIGHT,
    themePresetDark: DEFAULT_THEME_PRESET_DARK,
    accentColor: '',
    density: 'compact',
    toastPlacement: 'bottom-left',
    connectTimeout: 10,
    queryTimeout: 60,
    viewMode: false,
    riskHighlight: true,
    minimap: false,
    errorLens: true,
    sqlFormat: DEFAULT_SQL_FORMAT,
    sqlEditorStyle: DEFAULT_SQL_EDITOR_STYLE,
    editorFocusMode: false,
    editorFocusWidth: 900,
    focusModeLayoutSnapshot: null,
    saveTimeout: null,
    environmentPolicies: {},
    environmentSafetyLevels: {},

    load: async () => {
        void useSettingsStore.getState().loadEnvironmentPolicies();
        const result = await getApiGateway().settings.getPreferences();
        if (!result.ok) {
            console.error('Failed to load preferences:', result.error.message);
            return;
        }
        try {
            const prefs = result.data;
            const fontSize = clampNumber(prefs.font_size, 14, 8, 48);
            const theme = prefs.theme || 'system';
            // New fields — backend may not have them yet, use defaults
            const fontFamily = (prefs as any).font_family || 'system';
            const monoFamily = (prefs as any).mono_family || 'cascadia';
            const themePresetLight =
                (prefs as any).theme_preset_light || DEFAULT_THEME_PRESET_LIGHT;
            const themePresetDark = (prefs as any).theme_preset_dark || DEFAULT_THEME_PRESET_DARK;
            const accentColor = (prefs as any).accent_color || '';
            const density = normalizeDensity((prefs as any).density);

            set({
                theme,
                fontSize,
                fontFamily,
                monoFamily,
                themePresetLight,
                themePresetDark,
                accentColor,
                density,
                toastPlacement: normalizeToastPlacement(prefs.toast_placement),
                connectTimeout: clampNumber(prefs.connect_timeout, 10, 5, 300),
                queryTimeout: clampNumber(prefs.query_timeout, 60, 5, 100000),
                viewMode: prefs.view_mode === true,
                riskHighlight: prefs.risk_highlight !== false,
                minimap: prefs.minimap === true,
                // Unset (older config) means on.
                errorLens: prefs.error_lens !== false,
                sqlFormat: normalizeSqlFormat(prefs.sql_format),
                sqlEditorStyle: normalizeSqlEditorStyle(prefs.sql_editor_style),
                editorFocusMode: (prefs as any).editor_focus_mode === true,
                environmentSafetyLevels: normalizeEnvironmentSafetyLevels(
                    (prefs as any).environment_safety_levels,
                ),
                editorFocusWidth: clampNumber(
                    (prefs as any).editor_focus_width || 900,
                    900,
                    400,
                    2400,
                ),
            });
            useShortcutStore.getState().loadFromPreferences(prefs.shortcuts, prefs.shortcut_rules);
            applyThemeToDOM({
                theme,
                fontFamily,
                monoFamily,
                accentColor,
                density,
                themePresetLight,
                themePresetDark,
            });
        } catch (err) {
            // Guards the local mapping/DOM logic above, distinct from the
            // gateway-call failure handled by the !result.ok branch.
            console.error('Failed to apply loaded preferences:', err);
        }
    },

    save: async (prefs: utils.Preferences) => {
        try {
            const current = unwrapOrThrow(await getApiGateway().settings.getPreferences());
            const state = useSettingsStore.getState();
            const merged = new utils.Preferences({
                theme: prefs.theme ?? current.theme ?? state.theme,
                font_size: clampNumber(
                    prefs.font_size ?? current.font_size ?? state.fontSize,
                    state.fontSize,
                    8,
                    48,
                ),
                chunk_size: prefs.chunk_size ?? current.chunk_size,
                toast_placement: normalizeToastPlacement(
                    prefs.toast_placement ?? current.toast_placement ?? state.toastPlacement,
                ),
                query_timeout: clampNumber(
                    prefs.query_timeout ?? current.query_timeout ?? state.queryTimeout,
                    state.queryTimeout,
                    5,
                    100000,
                ),
                connect_timeout: clampNumber(
                    prefs.connect_timeout ?? current.connect_timeout ?? state.connectTimeout,
                    state.connectTimeout,
                    5,
                    300,
                ),
                schema_timeout: prefs.schema_timeout ?? current.schema_timeout,
                view_mode: prefs.view_mode ?? current.view_mode ?? state.viewMode,
                risk_highlight:
                    prefs.risk_highlight !== undefined
                        ? prefs.risk_highlight
                        : current.risk_highlight !== undefined
                          ? current.risk_highlight
                          : state.riskHighlight,
                minimap:
                    prefs.minimap !== undefined
                        ? prefs.minimap
                        : current.minimap !== undefined
                          ? current.minimap
                          : state.minimap,
                error_lens: prefs.error_lens ?? current.error_lens ?? state.errorLens,
                // Omitting this would reset every formatter option to the Go zero value on save.
                sql_format:
                    prefs.sql_format ?? current.sql_format ?? toSqlFormatPrefs(state.sqlFormat),
                sql_editor_style:
                    prefs.sql_editor_style ??
                    current.sql_editor_style ??
                    toSqlEditorStylePrefs(state.sqlEditorStyle),
                editor_focus_mode:
                    prefs.editor_focus_mode !== undefined
                        ? prefs.editor_focus_mode
                        : current.editor_focus_mode !== undefined
                          ? current.editor_focus_mode
                          : state.editorFocusMode,
                editor_focus_width: clampNumber(
                    prefs.editor_focus_width ??
                        current.editor_focus_width ??
                        state.editorFocusWidth,
                    state.editorFocusWidth,
                    400,
                    2400,
                ),
                shortcuts:
                    prefs.shortcuts ?? current.shortcuts ?? useShortcutStore.getState().bindings,
                shortcut_rules:
                    prefs.shortcut_rules ??
                    current.shortcut_rules ??
                    useShortcutStore.getState().userRules.map(rule => ({
                        id: rule.id,
                        command_id: rule.commandId,
                        binding: rule.binding,
                        when: rule.when,
                        source: 'user',
                        order: rule.order,
                    })),
                environment_safety_levels:
                    (prefs as any).environment_safety_levels ??
                    (current as any).environment_safety_levels,
                // These must fall back through current/state like every other field above —
                // omitting the key here (rather than resolving it) drops it to the Go
                // zero-value ("") on save, silently wiping whatever was persisted before.
                font_family: prefs.font_family ?? current.font_family ?? state.fontFamily,
                mono_family: prefs.mono_family ?? current.mono_family ?? state.monoFamily,
                theme_preset_light:
                    prefs.theme_preset_light ??
                    current.theme_preset_light ??
                    state.themePresetLight,
                theme_preset_dark:
                    prefs.theme_preset_dark ?? current.theme_preset_dark ?? state.themePresetDark,
                accent_color: prefs.accent_color ?? current.accent_color ?? state.accentColor,
                density: normalizeDensity(prefs.density ?? current.density ?? state.density),
            });

            const fontFamily = merged.font_family;
            const monoFamily = merged.mono_family;
            const themePresetLight = merged.theme_preset_light;
            const themePresetDark = merged.theme_preset_dark;
            const accentColor = merged.accent_color;
            const density = normalizeDensity(merged.density);

            unwrapOrThrow(await getApiGateway().settings.setPreferences(merged));
            set({
                theme: merged.theme,
                fontSize: merged.font_size,
                fontFamily,
                monoFamily,
                themePresetLight,
                themePresetDark,
                accentColor,
                density,
                toastPlacement: merged.toast_placement as ToastPlacement,
                connectTimeout: merged.connect_timeout,
                queryTimeout: merged.query_timeout,
                viewMode: merged.view_mode === true,
                riskHighlight: merged.risk_highlight !== false,
                minimap: merged.minimap === true,
                errorLens: merged.error_lens !== false,
                sqlFormat: normalizeSqlFormat(merged.sql_format),
                sqlEditorStyle: normalizeSqlEditorStyle(merged.sql_editor_style),
                editorFocusMode: merged.editor_focus_mode === true,
                environmentSafetyLevels: normalizeEnvironmentSafetyLevels(
                    (merged as any).environment_safety_levels,
                ),
                editorFocusWidth: clampNumber(merged.editor_focus_width || 900, 900, 400, 2400),
            });
            applyThemeToDOM({
                theme: merged.theme,
                fontFamily,
                monoFamily,
                accentColor,
                density,
                themePresetLight,
                themePresetDark,
            });
        } catch (err) {
            console.error('Failed to save preferences:', err);
        }
    },

    loadEnvironmentPolicies: async () => {
        const result = await getApiGateway().settings.getEnvironmentPolicies();
        if (!result.ok) {
            console.error('Failed to load environment policies:', result.error.message);
            return;
        }
        const policies = mapExecutionPolicies(result.data);
        const environmentSafetyLevels: Record<string, SafetyLevel> = {};
        for (const [envKey, policy] of Object.entries(policies)) {
            environmentSafetyLevels[envKey] = policy.safetyLevel;
        }
        set({ environmentPolicies: policies, environmentSafetyLevels });
    },

    setEnvironmentSafetyLevel: async (environmentKey: string, level: SafetyLevel) => {
        const raw = unwrapOrThrow(
            await getApiGateway().settings.setEnvironmentSafetyLevel(environmentKey, level),
        );
        const policies = mapExecutionPolicies(raw);
        const environmentSafetyLevels: Record<string, SafetyLevel> = {};
        for (const [envKey, policy] of Object.entries(policies)) {
            environmentSafetyLevels[envKey] = policy.safetyLevel;
        }
        set({ environmentPolicies: policies, environmentSafetyLevels });
    },

    setFontSize: (size: number) => {
        const newSize = Math.max(8, Math.min(48, size));
        set({ fontSize: newSize });

        const current = useSettingsStore.getState();
        if (current.saveTimeout) clearTimeout(current.saveTimeout);
        const nextTimeout = setTimeout(() => {
            useSettingsStore
                .getState()
                .save(
                    new utils.Preferences({
                        font_size: useSettingsStore.getState().fontSize,
                    }),
                )
                .catch(err => console.error('Failed to auto-save font size:', err));
        }, 1000);
        set({ saveTimeout: nextTimeout });
    },

    updateFontSize: (delta: number) => {
        const { fontSize, setFontSize } = useSettingsStore.getState();
        setFontSize(fontSize + delta);
    },

    toggleEditorFocusMode: () => {
        const state = useSettingsStore.getState();
        const layout = useLayoutStore.getState();
        const turningOn = !state.editorFocusMode;

        if (turningOn) {
            set({
                focusModeLayoutSnapshot: {
                    showSidebar: layout.showSidebar,
                    showResultPanel: layout.showResultPanel,
                    showRightSidebar: layout.showRightSidebar,
                },
            });
            layout.setShowSidebar(false);
            layout.setShowResultPanel(false);
            layout.setShowRightSidebar(false);
        } else if (state.focusModeLayoutSnapshot) {
            layout.setShowSidebar(state.focusModeLayoutSnapshot.showSidebar);
            layout.setShowResultPanel(state.focusModeLayoutSnapshot.showResultPanel);
            layout.setShowRightSidebar(state.focusModeLayoutSnapshot.showRightSidebar);
            set({ focusModeLayoutSnapshot: null });
        }

        state.save(new utils.Preferences({ editor_focus_mode: turningOn }));
    },
}));
