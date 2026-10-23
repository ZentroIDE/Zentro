// SPDX-License-Identifier: GPL-3.0-only

import { describe, it, expect } from 'vitest';
import {
    getThemePreset,
    getThemePresets,
    registerThemePreset,
    unregisterThemePreset,
} from './themePresetRegistry';
import type { ThemePreset } from './themePresetTypes';

function makePreset(overrides: Partial<ThemePreset>): ThemePreset {
    return {
        id: 'test.theme.default',
        label: 'Test',
        appearance: 'dark',
        builtIn: false,
        tokens: {},
        monaco: { id: 'vs-dark' },
        ...overrides,
    };
}

function cleanupTestPresets() {
    getThemePresets()
        .filter(preset => preset.id.startsWith('test.theme.'))
        .forEach(preset => unregisterThemePreset(preset.id));
}

describe('themePresetRegistry', () => {
    it('registers presets and returns them sorted light-before-dark, then by id', () => {
        cleanupTestPresets();

        registerThemePreset(makePreset({ id: 'test.theme.dark-b', appearance: 'dark' }));
        registerThemePreset(makePreset({ id: 'test.theme.light-b', appearance: 'light' }));
        registerThemePreset(makePreset({ id: 'test.theme.dark-a', appearance: 'dark' }));
        registerThemePreset(makePreset({ id: 'test.theme.light-a', appearance: 'light' }));

        const ids = getThemePresets()
            .filter(preset => preset.id.startsWith('test.theme.'))
            .map(preset => preset.id);

        expect(ids).toEqual([
            'test.theme.light-a',
            'test.theme.light-b',
            'test.theme.dark-a',
            'test.theme.dark-b',
        ]);

        cleanupTestPresets();
    });

    it('deduplicates same id unless replace is true', () => {
        cleanupTestPresets();

        registerThemePreset(makePreset({ id: 'test.theme.replace', label: 'Old' }));
        registerThemePreset(makePreset({ id: 'test.theme.replace', label: 'Ignored' }));

        expect(getThemePreset('test.theme.replace')?.label).toBe('Old');

        registerThemePreset(makePreset({ id: 'test.theme.replace', label: 'New' }), {
            replace: true,
        });

        expect(getThemePreset('test.theme.replace')?.label).toBe('New');

        cleanupTestPresets();
    });

    it('unregisters a preset by id', () => {
        cleanupTestPresets();

        registerThemePreset(makePreset({ id: 'test.theme.removable' }));
        expect(getThemePreset('test.theme.removable')).toBeDefined();

        unregisterThemePreset('test.theme.removable');
        expect(getThemePreset('test.theme.removable')).toBeUndefined();
    });
});
