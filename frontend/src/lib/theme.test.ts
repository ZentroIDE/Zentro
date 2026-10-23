// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
    normalizeThemePreference,
    resolveEffectiveTheme,
    resolveMonacoTheme,
    useMonacoTheme,
} from './theme';
import { useSettingsStore } from '../stores/settingsStore';
import { registerThemePreset, unregisterThemePreset } from './theme/themePresetRegistry';

describe('theme helpers', () => {
    it('normalizes unknown preference to system', () => {
        expect(normalizeThemePreference(undefined)).toBe('system');
        expect(normalizeThemePreference('custom')).toBe('system');
    });

    it('resolves effective theme from explicit preference', () => {
        expect(resolveEffectiveTheme('dark', false)).toBe('dark');
        expect(resolveEffectiveTheme('light', true)).toBe('light');
    });

    it('resolves system preference from OS theme', () => {
        expect(resolveEffectiveTheme('system', true)).toBe('dark');
        expect(resolveEffectiveTheme('system', false)).toBe('light');
    });

    it('maps resolved themes to monaco themes', () => {
        expect(resolveMonacoTheme('dark', false)).toBe('vs-dark');
        expect(resolveMonacoTheme('light', true)).toBe('vs');
        expect(resolveMonacoTheme('system', true)).toBe('vs-dark');
        expect(resolveMonacoTheme('system', false)).toBe('vs');
    });

    it('useMonacoTheme resolves the active theme preset for the current appearance', () => {
        registerThemePreset({
            id: 'test.theme.monaco-dark',
            label: 'Test Dark',
            appearance: 'dark',
            builtIn: false,
            tokens: {},
            monaco: { id: 'zentro-sql-test-dark' },
        });
        registerThemePreset({
            id: 'test.theme.monaco-light',
            label: 'Test Light',
            appearance: 'light',
            builtIn: false,
            tokens: {},
            monaco: { id: 'zentro-sql-test-light' },
        });

        useSettingsStore.setState({
            themePresetDark: 'test.theme.monaco-dark',
            themePresetLight: 'test.theme.monaco-light',
        });

        const { result: darkResult } = renderHook(() => useMonacoTheme('dark'));
        expect(darkResult.current).toBe('zentro-sql-test-dark');

        const { result: lightResult } = renderHook(() => useMonacoTheme('light'));
        expect(lightResult.current).toBe('zentro-sql-test-light');

        unregisterThemePreset('test.theme.monaco-dark');
        unregisterThemePreset('test.theme.monaco-light');
    });

    it('useMonacoTheme falls back to vs/vs-dark when the preset is not registered', () => {
        useSettingsStore.setState({
            themePresetDark: 'test.theme.missing-dark',
            themePresetLight: 'test.theme.missing-light',
        });

        const { result: darkResult } = renderHook(() => useMonacoTheme('dark'));
        expect(darkResult.current).toBe('vs-dark');

        const { result: lightResult } = renderHook(() => useMonacoTheme('light'));
        expect(lightResult.current).toBe('vs');
    });
});
