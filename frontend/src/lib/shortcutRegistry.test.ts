// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    type CommandId,
    eventToKeyToken,
    getCommandById,
    getCommandRegistry,
    getDefaultShortcutMap,
    normalizeBinding,
    registerCommandContribution,
} from './shortcutRegistry';

describe('shortcutRegistry contributions', () => {
    it('registers and unregisters command contributions', () => {
        const commandId: CommandId = 'ext.test.command';
        const contribution = {
            id: commandId,
            label: 'Test Contribution',
            category: 'App' as const,
            defaultBinding: 'Ctrl+Alt+Y',
            action: () => undefined,
        };

        const unregister = registerCommandContribution(contribution);
        expect(getCommandById(commandId)?.label).toBe('Test Contribution');
        expect(getCommandRegistry().some(item => item.id === commandId)).toBe(true);
        expect(getDefaultShortcutMap()[commandId]).toBe('Ctrl+Alt+Y');

        unregister();
        expect(getCommandById(commandId)).toBeUndefined();
    });

    it('normalizes modifier ordering before primary key while preserving chord sequence', () => {
        expect(normalizeBinding('alt+ctrl+e')).toBe('ctrl+alt+e');
        expect(normalizeBinding('shift+e+ctrl')).toBe('ctrl+shift+e');
        expect(normalizeBinding('ctrl+k ctrl+b')).toBe('ctrl+k ctrl+b');
    });

    it('emits key token with modifier-first ordering', () => {
        const event = new KeyboardEvent('keydown', {
            key: 'E',
            ctrlKey: true,
            shiftKey: true,
            altKey: true,
        });
        expect(eventToKeyToken(event)).toBe('ctrl+shift+alt+e');
    });

    it('falls back to the physical key (e.code) when Alt is held, since macOS remaps e.key to a dead-key/accented character for Option combos', () => {
        const macOptionE = new KeyboardEvent('keydown', {
            key: '´', // what macOS actually reports for Option+E (acute accent dead key)
            code: 'KeyE',
            altKey: true,
        });
        expect(eventToKeyToken(macOptionE)).toBe('alt+e');

        const macCtrlOptionB = new KeyboardEvent('keydown', {
            key: '∫', // macOS reports the integral sign for Option+B
            code: 'KeyB',
            ctrlKey: true,
            altKey: true,
        });
        expect(eventToKeyToken(macCtrlOptionB)).toBe('ctrl+alt+b');
    });
});

describe('assistant question shortcuts', () => {
    it('registers Alt+Up and Alt+Down, limited to focus inside the assistant', () => {
        const previous = getCommandById('assistant.previousQuestion');
        const next = getCommandById('assistant.nextQuestion');
        expect(previous?.defaultBinding).toBe('Alt+ArrowUp');
        expect(next?.defaultBinding).toBe('Alt+ArrowDown');
        // Alt+Up also moves a line in the SQL editor, so these only apply
        // where the assistant has focus.
        expect(previous?.defaultWhen).toBe('assistantFocus');
        expect(next?.defaultWhen).toBe('assistantFocus');
    });
});

describe('arrow key bindings', () => {
    it('match what a key event reports, whichever way the binding is written', () => {
        const press = (key: string, code: string) =>
            eventToKeyToken(new KeyboardEvent('keydown', { key, code, altKey: true }));
        expect(press('ArrowUp', 'ArrowUp')).toBe(normalizeBinding('Alt+ArrowUp'));
        expect(press('ArrowDown', 'ArrowDown')).toBe(normalizeBinding('Alt+Down'));
        expect(normalizeBinding('Alt+Up')).toBe(normalizeBinding('Alt+ArrowUp'));
    });

    it('the assistant shortcuts are reachable by a real Alt+Up key event', () => {
        const token = eventToKeyToken(
            new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', altKey: true }),
        );
        const command = getCommandById('assistant.previousQuestion');
        expect(normalizeBinding(command?.defaultBinding ?? '')).toBe(token);
    });
});

describe('tab shortcuts', () => {
    it('leaves Ctrl+Tab to the most-recently-used tab switcher', () => {
        // A global rule on Ctrl+Tab is consumed in the capture phase, before the
        // switcher's own listener, and degrades it to left-to-right cycling.
        for (const command of getCommandRegistry()) {
            const binding = normalizeBinding(command.defaultBinding);
            expect(binding, command.id).not.toBe('ctrl+tab');
            expect(binding, command.id).not.toBe('ctrl+shift+tab');
        }
    });

    it('binds next/previous tab to Ctrl+PageDown / Ctrl+PageUp', () => {
        const press = (key: string) =>
            eventToKeyToken(new KeyboardEvent('keydown', { key, code: key, ctrlKey: true }));
        expect(normalizeBinding(getCommandById('editor.nextTab')?.defaultBinding ?? '')).toBe(
            press('PageDown'),
        );
        expect(normalizeBinding(getCommandById('editor.prevTab')?.defaultBinding ?? '')).toBe(
            press('PageUp'),
        );
    });
});
