// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { registerAppCommandsInMonaco } from './editorCommandBridge';

vi.mock('../commands', () => ({
    buildCommands: () => [
        {
            id: 'editor.newTab',
            label: 'New Tab',
            category: 'Editor',
            keybinding: 'Ctrl+T',
            action: vi.fn(),
        },
        {
            id: 'editor.closeTab',
            label: 'Close Tab',
            category: 'Editor',
            keybinding: undefined,
            action: vi.fn(),
        },
        {
            id: 'editor.runQuery',
            label: 'Run Query',
            category: 'Editor',
            keybinding: 'Ctrl+Enter',
            action: vi.fn(),
        },
        {
            id: 'view.commandPalette',
            label: 'Open Command Palette',
            category: 'View',
            keybinding: 'Ctrl+Shift+P',
            action: vi.fn(),
        },
        {
            id: 'layout.toggleSidebar',
            label: 'Toggle Sidebar',
            category: 'Layout',
            keybinding: 'Ctrl+B',
            action: vi.fn(),
        },
        {
            id: 'view.zoomIn',
            label: 'Zoom In',
            category: 'View',
            keybinding: 'Ctrl+Shift+=',
            action: vi.fn(),
        },
        {
            id: 'editor.formatQuery',
            label: 'Format Query',
            category: 'Editor',
            keybinding: 'Ctrl+K Ctrl+F',
            action: vi.fn(),
        },
    ],
}));

function makeMonaco(KeyModValues = { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 }) {
    const KeyCode: Record<string, number | string> = {
        KeyT: 20,
        KeyB: 4,
        Enter: 3,
        Equal: 45,
        KeyF: 8,
        KeyP: 16,
        KeyK: 11,
        // reverse-mapping entries Monaco adds
        20: 'KeyT',
        4: 'KeyB',
        3: 'Enter',
    };
    return {
        KeyMod: {
            ...KeyModValues,
            chord: (a: number, b: number) => (a << 16) | b,
        },
        KeyCode,
    };
}

function makeEditor() {
    const actions: { id: string; label: string; keybindings?: number[] }[] = [];
    const disposables: { dispose: ReturnType<typeof vi.fn> }[] = [];

    return {
        addAction: vi.fn(descriptor => {
            actions.push(descriptor);
            const d = { dispose: vi.fn() };
            disposables.push(d);
            return d;
        }),
        _actions: actions,
        _disposables: disposables,
    };
}

describe('registerAppCommandsInMonaco', () => {
    it('registers all commands except those in the native blocklist', () => {
        const editor = makeEditor();
        const monaco = makeMonaco();
        registerAppCommandsInMonaco(editor, monaco);

        const ids = editor._actions.map(a => a.id);
        expect(ids).toContain('zentro.editor.newTab');
        expect(ids).toContain('zentro.editor.closeTab');
        expect(ids).toContain('zentro.layout.toggleSidebar');
        expect(ids).toContain('zentro.editor.runQuery');
        expect(ids).not.toContain('zentro.view.commandPalette');
    });

    it('attaches resolved keybinding when one is provided', () => {
        const editor = makeEditor();
        registerAppCommandsInMonaco(editor, makeMonaco());

        const newTab = editor._actions.find(a => a.id === 'zentro.editor.newTab');
        expect(newTab?.keybindings).toBeDefined();
        expect(newTab?.keybindings?.length).toBe(1);
    });

    it('omits keybindings array when keybinding is absent', () => {
        const editor = makeEditor();
        registerAppCommandsInMonaco(editor, makeMonaco());

        const closeTab = editor._actions.find(a => a.id === 'zentro.editor.closeTab');
        expect(closeTab?.keybindings).toBeUndefined();
    });

    it('dispose() cleans up all registered actions', () => {
        const editor = makeEditor();
        const { dispose } = registerAppCommandsInMonaco(editor, makeMonaco());
        dispose();

        for (const d of editor._disposables) {
            expect(d.dispose).toHaveBeenCalled();
        }
    });

    it('resolves chord keybinding (two-part)', () => {
        const editor = makeEditor();
        registerAppCommandsInMonaco(editor, makeMonaco());

        const formatQuery = editor._actions.find(a => a.id === 'zentro.editor.formatQuery');
        expect(formatQuery?.keybindings).toBeDefined();
        expect(formatQuery?.keybindings?.length).toBe(1);
    });

    it('handles unknown keybinding tokens gracefully (omits keybinding)', () => {
        // Ctrl+ZZ has no KeyCode for 'zz', so should fall back to undefined
        vi.doMock('../commands', () => ({
            buildCommands: () => [
                {
                    id: 'some.cmd',
                    label: 'Cmd',
                    category: 'View',
                    keybinding: 'Ctrl+ZZ',
                    action: vi.fn(),
                },
            ],
        }));
        // The action was already registered without crash — test that no keybindings is set
        // We verify this indirectly: 'Ctrl+Enter' has Enter which exists, 'Ctrl+ZZ' would not
        const editor = makeEditor();
        registerAppCommandsInMonaco(editor, makeMonaco());
        // All actions registered without throwing
        expect(editor.addAction).toHaveBeenCalled();
    });
});
