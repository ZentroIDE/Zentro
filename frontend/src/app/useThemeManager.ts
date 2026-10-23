// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { installSqlTokenizer } from '../lib/monaco/sqlLanguage';
import { useResolvedTheme } from '../lib/theme';
import { registerBuiltInThemePresets } from '../lib/theme/builtIn';
import { getThemePresets } from '../lib/theme/themePresetRegistry';
import { buildMonacoCustomTheme } from '../lib/theme/monacoThemeFromTokens';
import {
    LOG_TOKEN_RULES_DARK,
    LOG_TOKEN_RULES_LIGHT,
    buildLogTokenRules,
} from '../components/sidebar/log/logHighlight';
import { buildSqlStyleRules, schemaTokenCssVars, type SqlEditorStyle } from '../lib/sqlEditorStyle';
import { applyThemeToDOM, useSettingsStore } from '../stores/settingsStore';

type MonacoApi = Awaited<ReturnType<typeof loader.init>>;

export interface AppMonacoTheme {
    id: string;
    data: editor.IStandaloneThemeData;
}

// Monaco's active theme is global (no per-editor theme), so every editor in the
// app — SQL, filter, diff, JSON, logs — must share one theme id or switching
// between them re-themes the lot. We register each app preset with the log
// token colours folded in, and redefine the built-in `vs` / `vs-dark` the
// Zentro presets ride on, so the log views can use the active app theme too.
// The user's SQL colour overrides ride on the same definitions (their rules
// are `.zsql`-scoped, so other editors are untouched). Redefining a theme id
// re-themes every open editor live, which is how a settings change lands.
export function buildAppMonacoThemes(sqlStyle: SqlEditorStyle): AppMonacoTheme[] {
    const themes: AppMonacoTheme[] = [];
    for (const preset of getThemePresets()) {
        const logRules = buildLogTokenRules(preset);
        const hasCustomTokens = Object.keys(preset.tokens).length > 0;
        const custom =
            preset.monaco.custom ??
            (hasCustomTokens
                ? buildMonacoCustomTheme(preset.tokens, preset.appearance)
                : undefined);
        if (!custom) continue;
        themes.push({
            id: preset.monaco.id,
            data: {
                ...custom,
                rules: [
                    ...custom.rules,
                    ...logRules,
                    ...buildSqlStyleRules(sqlStyle, preset.appearance),
                ],
            },
        });
    }
    // A preset may itself be the theme called `vs` / `vs-dark` (the 2026 ones
    // are); redefining those plainly afterwards would throw its colours away.
    const defined = new Set(themes.map(theme => theme.id));
    if (!defined.has('vs-dark')) {
        themes.push({
            id: 'vs-dark',
            data: {
                base: 'vs-dark',
                inherit: true,
                rules: [...LOG_TOKEN_RULES_DARK, ...buildSqlStyleRules(sqlStyle, 'dark')],
                colors: {},
            },
        });
    }
    if (!defined.has('vs')) {
        themes.push({
            id: 'vs',
            data: {
                base: 'vs',
                inherit: true,
                rules: [...LOG_TOKEN_RULES_LIGHT, ...buildSqlStyleRules(sqlStyle, 'light')],
                colors: {},
            },
        });
    }
    return themes;
}

function defineSqlMonacoThemes(monaco: MonacoApi, sqlStyle: SqlEditorStyle): void {
    installSqlTokenizer(monaco);
    for (const theme of buildAppMonacoThemes(sqlStyle)) {
        monaco.editor.defineTheme(theme.id, theme.data);
    }
}

export function useThemeManager() {
    const theme = useSettingsStore(state => state.theme);
    const fontFamily = useSettingsStore(state => state.fontFamily);
    const monoFamily = useSettingsStore(state => state.monoFamily);
    const accentColor = useSettingsStore(state => state.accentColor);
    const density = useSettingsStore(state => state.density);
    const themePresetLight = useSettingsStore(state => state.themePresetLight);
    const themePresetDark = useSettingsStore(state => state.themePresetDark);
    const sqlEditorStyle = useSettingsStore(state => state.sqlEditorStyle);
    const effectiveTheme = useResolvedTheme(theme);

    useEffect(() => {
        registerBuiltInThemePresets();
    }, []);

    // Schema-aware names are decorations coloured through CSS variables (see
    // index.css), so they follow the theme without redefining any Monaco theme.
    useEffect(() => {
        const root = document.documentElement;
        const all = schemaTokenCssVars({ ...sqlEditorStyle, schemaHighlight: true }, 'light');
        Object.keys(all).forEach(name => root.style.removeProperty(name));
        const vars = schemaTokenCssVars(sqlEditorStyle, effectiveTheme);
        Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
    }, [effectiveTheme, sqlEditorStyle]);

    useEffect(() => {
        let cancelled = false;
        loader
            .init()
            .then(monaco => {
                if (!cancelled) defineSqlMonacoThemes(monaco, sqlEditorStyle);
            })
            .catch(() => {
                // Monaco failed to load — SQL editors fall back to their default
                // theme resolution; nothing else in the app depends on this.
            });
        return () => {
            cancelled = true;
        };
    }, [sqlEditorStyle]);

    useEffect(() => {
        applyThemeToDOM({
            theme,
            resolvedTheme: effectiveTheme,
            fontFamily,
            monoFamily,
            accentColor,
            density,
            themePresetLight,
            themePresetDark,
        });
    }, [
        accentColor,
        density,
        effectiveTheme,
        fontFamily,
        monoFamily,
        theme,
        themePresetLight,
        themePresetDark,
    ]);
}
