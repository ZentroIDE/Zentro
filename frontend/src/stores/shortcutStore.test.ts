// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShortcutStore } from './shortcutStore';

vi.mock('../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        settings: {
            getPreferences: vi.fn(async () => ({
                ok: true,
                data: { shortcuts: {}, shortcut_rules: [] },
            })),
            setPreferences: vi.fn(async () => ({ ok: true, data: undefined })),
        },
    }),
}));

describe('shortcutStore migration', () => {
    beforeEach(() => {
        useShortcutStore.setState({
            userRules: [],
            effectiveRules: [],
            bindings: {} as any,
            chordStart: null,
            chordUntil: 0,
        } as any);
    });

    it('migrates legacy shortcuts map when shortcut_rules is missing', () => {
        useShortcutStore.getState().loadFromPreferences(
            {
                'editor.newTab': 'Ctrl+Alt+T',
                'layout.toggleSidebar': 'Ctrl+B',
            },
            undefined,
        );

        const state = useShortcutStore.getState();
        expect(state.userRules.some(rule => rule.commandId === 'editor.newTab')).toBe(true);
        expect(state.userRules.some(rule => rule.commandId === 'layout.toggleSidebar')).toBe(false);
    });

    it('uses shortcut_rules as source of truth when provided', () => {
        useShortcutStore.getState().loadFromPreferences(
            {
                'editor.newTab': 'Ctrl+T',
            },
            [
                {
                    id: 'u1',
                    command_id: 'editor.newTab',
                    binding: 'Ctrl+Shift+T',
                    when: '',
                    source: 'user',
                    order: 0,
                },
            ] as any,
        );

        const state = useShortcutStore.getState();
        expect(state.bindings['editor.newTab']).toBe('ctrl+shift+t');
        expect(state.userRules).toHaveLength(1);
    });
});
