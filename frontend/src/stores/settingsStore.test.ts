// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMock = vi.hoisted(() => ({
    settings: {
        getPreferences: vi.fn(),
        setPreferences: vi.fn(),
        getEnvironmentPolicies: vi.fn(),
        setEnvironmentSafetyLevel: vi.fn(),
    },
}));

const shortcutStoreMock = vi.hoisted(() => ({
    loadFromPreferences: vi.fn(),
    bindings: {},
    userRules: [],
}));

const layoutStoreMock = vi.hoisted(() => ({
    showSidebar: true,
    showResultPanel: true,
    showRightSidebar: false,
    setShowSidebar: vi.fn(),
    setShowResultPanel: vi.fn(),
    setShowRightSidebar: vi.fn(),
}));

vi.mock('../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => gatewayMock,
}));
vi.mock('./shortcutStore', () => ({
    useShortcutStore: {
        getState: () => shortcutStoreMock,
    },
}));
vi.mock('./layoutStore', () => ({
    useLayoutStore: {
        getState: () => layoutStoreMock,
    },
}));

import { utils } from '../../wailsjs/go/models';
import { useSettingsStore } from './settingsStore';
import { DEFAULT_SQL_FORMAT } from '../lib/sqlFormatSettings';
import { DEFAULT_SQL_EDITOR_STYLE } from '../lib/sqlEditorStyle';

function ok<T>(data: T) {
    return { ok: true as const, data };
}

describe('settingsStore', () => {
    beforeEach(() => {
        gatewayMock.settings.getPreferences.mockReset();
        gatewayMock.settings.setPreferences.mockReset();
        gatewayMock.settings.getEnvironmentPolicies.mockReset();
        gatewayMock.settings.setEnvironmentSafetyLevel.mockReset();
        shortcutStoreMock.loadFromPreferences.mockReset();
        layoutStoreMock.setShowSidebar.mockReset();
        layoutStoreMock.setShowResultPanel.mockReset();
        layoutStoreMock.setShowRightSidebar.mockReset();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme-preference');
        document.documentElement.removeAttribute('data-density');
        document.documentElement.style.removeProperty('--user-accent');
        document.documentElement.style.removeProperty('--user-font-sans');
        document.documentElement.style.removeProperty('--user-font-mono');
        useSettingsStore.setState({
            theme: 'system',
            fontSize: 14,
            fontFamily: 'system',
            monoFamily: 'cascadia',
            themePresetLight: 'light-2026',
            themePresetDark: 'dark-2026',
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
        });
    });

    it('preserves backend-owned environment safety levels when saving other preferences', async () => {
        gatewayMock.settings.getPreferences.mockResolvedValue(
            ok({
                theme: 'system',
                font_size: 14,
                toast_placement: 'bottom-left',
                connect_timeout: 10,
                query_timeout: 60,
                view_mode: false,
                risk_highlight: true,
                minimap: false,
                editor_focus_mode: false,
                editor_focus_width: 900,
                shortcuts: {},
                shortcut_rules: [],
                environment_safety_levels: { sta: 'relaxed', pro: 'strict' },
            }),
        );
        gatewayMock.settings.setPreferences.mockResolvedValue(ok(undefined));

        await useSettingsStore.getState().save(
            new utils.Preferences({
                font_size: 16,
            }),
        );

        expect(gatewayMock.settings.setPreferences).toHaveBeenCalledTimes(1);
        expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
            expect.objectContaining({
                font_size: 16,
                environment_safety_levels: { sta: 'relaxed', pro: 'strict' },
            }),
        );
    });

    it('preserves font/theme-preset/accent/density fields when saving an unrelated preference', async () => {
        gatewayMock.settings.getPreferences.mockResolvedValue(
            ok({
                theme: 'dark',
                font_size: 14,
                font_family: 'inter',
                mono_family: 'jetbrains',
                theme_preset_light: 'solarized-light',
                theme_preset_dark: 'solarized-dark',
                accent_color: '#ff0000',
                density: 'comfortable',
                toast_placement: 'bottom-left',
                connect_timeout: 10,
                query_timeout: 60,
                view_mode: false,
                risk_highlight: true,
                minimap: false,
                editor_focus_mode: false,
                editor_focus_width: 900,
                shortcuts: {},
                shortcut_rules: [],
            }),
        );
        gatewayMock.settings.setPreferences.mockResolvedValue(ok(undefined));

        // Saving a completely unrelated field (minimap) must not wipe the
        // font/theme-preset/accent/density fields already on disk.
        await useSettingsStore.getState().save(
            new utils.Preferences({
                minimap: true,
            }),
        );

        expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
            expect.objectContaining({
                minimap: true,
                font_family: 'inter',
                mono_family: 'jetbrains',
                theme_preset_light: 'solarized-light',
                theme_preset_dark: 'solarized-dark',
                accent_color: '#ff0000',
                density: 'comfortable',
            }),
        );

        const state = useSettingsStore.getState();
        expect(state.fontFamily).toBe('inter');
        expect(state.monoFamily).toBe('jetbrains');
        expect(state.themePresetLight).toBe('solarized-light');
        expect(state.themePresetDark).toBe('solarized-dark');
    });

    it('hydrates persisted safety levels from preferences before policy fetch completes', async () => {
        gatewayMock.settings.getPreferences.mockResolvedValue(
            ok({
                theme: 'system',
                font_size: 14,
                toast_placement: 'bottom-left',
                connect_timeout: 10,
                query_timeout: 60,
                view_mode: false,
                risk_highlight: true,
                minimap: false,
                editor_focus_mode: false,
                editor_focus_width: 900,
                shortcuts: {},
                shortcut_rules: [],
                environment_safety_levels: { dev: 'strict', loc: 'relaxed', pro: 'balanced' },
            }),
        );
        gatewayMock.settings.getEnvironmentPolicies.mockImplementation(
            () => new Promise(() => undefined),
        );

        await useSettingsStore.getState().load();

        expect(useSettingsStore.getState().environmentSafetyLevels).toEqual({
            dev: 'strict',
            loc: 'relaxed',
            pro: 'balanced',
        });
    });

    describe('inline diagnostics (error lens)', () => {
        const basePrefs = {
            theme: 'system',
            font_size: 14,
            toast_placement: 'bottom-left',
            connect_timeout: 10,
            query_timeout: 60,
            view_mode: false,
            risk_highlight: true,
            minimap: false,
            editor_focus_mode: false,
            editor_focus_width: 900,
            shortcuts: {},
            shortcut_rules: [],
        };

        beforeEach(() => {
            gatewayMock.settings.getEnvironmentPolicies.mockImplementation(
                () => new Promise(() => undefined),
            );
            gatewayMock.settings.setPreferences.mockResolvedValue(ok(undefined));
        });

        it('is on when the saved config predates the setting', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(ok(basePrefs));

            await useSettingsStore.getState().load();

            expect(useSettingsStore.getState().errorLens).toBe(true);
        });

        it('honours a stored choice to turn it off', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(
                ok({ ...basePrefs, error_lens: false }),
            );

            await useSettingsStore.getState().load();

            expect(useSettingsStore.getState().errorLens).toBe(false);
        });

        it('persists turning it off and updates the store', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(ok(basePrefs));

            await useSettingsStore.getState().save(new utils.Preferences({ error_lens: false }));

            expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
                expect.objectContaining({ error_lens: false }),
            );
            expect(useSettingsStore.getState().errorLens).toBe(false);
        });

        it('keeps a stored choice when an unrelated preference is saved', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(
                ok({ ...basePrefs, error_lens: false }),
            );

            await useSettingsStore.getState().save(new utils.Preferences({ minimap: true }));

            expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
                expect.objectContaining({ minimap: true, error_lens: false }),
            );
            expect(useSettingsStore.getState().errorLens).toBe(false);
        });
    });

    describe('SQL formatting options', () => {
        const basePrefs = {
            theme: 'system',
            font_size: 14,
            toast_placement: 'bottom-left',
            connect_timeout: 10,
            query_timeout: 60,
            view_mode: false,
            risk_highlight: true,
            minimap: false,
            editor_focus_mode: false,
            editor_focus_width: 900,
            shortcuts: {},
            shortcut_rules: [],
        };

        beforeEach(() => {
            gatewayMock.settings.getEnvironmentPolicies.mockImplementation(
                () => new Promise(() => undefined),
            );
            gatewayMock.settings.setPreferences.mockResolvedValue(ok(undefined));
        });

        it('falls back to the defaults when the saved config predates the setting', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(ok(basePrefs));

            await useSettingsStore.getState().load();

            expect(useSettingsStore.getState().sqlFormat).toEqual(DEFAULT_SQL_FORMAT);
        });

        it('loads stored options', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(
                ok({ ...basePrefs, sql_format: { keyword_case: 'lower', indent_size: 4 } }),
            );

            await useSettingsStore.getState().load();

            expect(useSettingsStore.getState().sqlFormat).toEqual({
                ...DEFAULT_SQL_FORMAT,
                keywordCase: 'lower',
                indentSize: 4,
            });
        });

        it('persists a change and updates the store', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(ok(basePrefs));

            await useSettingsStore.getState().save(
                new utils.Preferences({
                    sql_format: new utils.SQLFormatPrefs({ comma_position: 'leading' }),
                }),
            );

            expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    sql_format: expect.objectContaining({ comma_position: 'leading' }),
                }),
            );
            expect(useSettingsStore.getState().sqlFormat.commaPosition).toBe('leading');
        });

        it('keeps stored options when an unrelated preference is saved', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(
                ok({ ...basePrefs, sql_format: { keyword_case: 'lower' } }),
            );

            await useSettingsStore.getState().save(new utils.Preferences({ minimap: true }));

            expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    minimap: true,
                    sql_format: expect.objectContaining({ keyword_case: 'lower' }),
                }),
            );
            expect(useSettingsStore.getState().sqlFormat.keywordCase).toBe('lower');
        });
    });

    describe('SQL editor colours', () => {
        const basePrefs = {
            theme: 'system',
            font_size: 14,
            toast_placement: 'bottom-left',
            connect_timeout: 10,
            query_timeout: 60,
            view_mode: false,
            risk_highlight: true,
            minimap: false,
            editor_focus_mode: false,
            editor_focus_width: 900,
            shortcuts: {},
            shortcut_rules: [],
        };

        beforeEach(() => {
            gatewayMock.settings.getEnvironmentPolicies.mockImplementation(
                () => new Promise(() => undefined),
            );
            gatewayMock.settings.setPreferences.mockResolvedValue(ok(undefined));
        });

        it('has no overrides when the saved config predates the setting', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(ok(basePrefs));

            await useSettingsStore.getState().load();

            expect(useSettingsStore.getState().sqlEditorStyle).toEqual(DEFAULT_SQL_EDITOR_STYLE);
        });

        it('keeps stored colours when an unrelated preference is saved', async () => {
            gatewayMock.settings.getPreferences.mockResolvedValue(
                ok({
                    ...basePrefs,
                    sql_editor_style: { light: { keyword: { color: '#0000ff', bold: true } } },
                }),
            );

            await useSettingsStore.getState().save(new utils.Preferences({ minimap: true }));

            expect(gatewayMock.settings.setPreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    sql_editor_style: expect.objectContaining({
                        light: { keyword: { color: '#0000ff', bold: true } },
                    }),
                }),
            );
            expect(useSettingsStore.getState().sqlEditorStyle.light.keyword?.color).toBe('#0000ff');
        });
    });
});
