// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { formatBindingForDisplay, toShortcutDisplayPlatform } from './shortcutDisplay';

describe('shortcutDisplay', () => {
    it('maps runtime platform strings to display platforms, defaulting to windows', () => {
        expect(toShortcutDisplayPlatform('darwin')).toBe('mac');
        expect(toShortcutDisplayPlatform('linux')).toBe('linux');
        expect(toShortcutDisplayPlatform('windows')).toBe('windows');
        expect(toShortcutDisplayPlatform(null)).toBe('windows');
    });

    it('formats a single stroke with "+" joins on Windows and Linux', () => {
        expect(formatBindingForDisplay('ctrl+shift+p', 'windows')).toBe('Ctrl+Shift+P');
        expect(formatBindingForDisplay('ctrl+shift+p', 'linux')).toBe('Ctrl+Shift+P');
    });

    it('formats a single stroke as bare symbols with no "+" on macOS', () => {
        expect(formatBindingForDisplay('ctrl+shift+p', 'darwin')).toBe('⌘⇧P');
        expect(formatBindingForDisplay('ctrl+alt+e', 'darwin')).toBe('⌘⌥E');
    });

    it('formats a chord (space-separated strokes) per-stroke', () => {
        expect(formatBindingForDisplay('ctrl+k ctrl+b', 'windows')).toBe('Ctrl+K Ctrl+B');
        expect(formatBindingForDisplay('ctrl+k ctrl+b', 'darwin')).toBe('⌘K ⌘B');
    });

    it('keeps unmapped keys capitalized on every platform', () => {
        expect(formatBindingForDisplay('ctrl+f3', 'windows')).toBe('Ctrl+F3');
        expect(formatBindingForDisplay('ctrl+f3', 'darwin')).toBe('⌘F3');
    });
});
