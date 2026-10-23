// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShortcutStore } from '../../stores/shortcutStore';

// Mocks for shortcut registry helpers + when-expression evaluator.
const mockCommands = [
    {
        id: 'run.query',
        label: 'Run Query',
        defaultBinding: 'ctrl+enter',
        action: vi.fn(),
    },
    {
        id: 'workspace.toggleSidebar',
        label: 'Toggle Sidebar',
        defaultBinding: 'ctrl+k ctrl+b', // chord
        action: vi.fn(),
    },
    {
        id: 'editor.contextSearch',
        label: 'Context Search',
        defaultBinding: 'ctrl+e',
        action: vi.fn(),
    },
    {
        id: 'layout.focusExplorer',
        label: 'Focus Explorer',
        defaultBinding: 'ctrl+k ctrl+e', // chord whose 2nd key collides with a single-key rule
        action: vi.fn(),
    },
    {
        id: 'layout.toggleTerminal',
        label: 'Toggle Terminal',
        defaultBinding: 'ctrl+`',
        action: vi.fn(),
    },
];

vi.mock('../../lib/shortcutRegistry', () => ({
    getCommandRegistry: () => mockCommands,
    normalizeBinding: (b: string) => b.toLowerCase(),
    eventToKeyToken: (e: KeyboardEvent) => {
        const parts: string[] = [];
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        const key = e.key.toLowerCase();
        if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key);
        return parts.join('+');
    },
}));

vi.mock('./whenExpression', () => ({
    evaluateWhenExpression: () => true,
}));

vi.mock('./shortcutContext', () => ({
    buildShortcutWhenContext: () => ({ captureFocus: false }),
}));

vi.mock('../../lib/logger', () => ({
    appLogger: { error: vi.fn() },
}));

import { useGlobalShortcuts } from './useGlobalShortcuts';

function seedRules(rules: Array<{ commandId: string; binding: string; when?: string }>) {
    useShortcutStore.setState({
        effectiveRules: rules.map((r, i) => ({
            id: `rule-${i}`,
            commandId: r.commandId,
            binding: r.binding,
            when: r.when ?? '',
            source: 'user',
            order: i,
        })),
        chordStart: null,
        chordUntil: 0,
        setChord: (token: string | null) => {
            useShortcutStore.setState({
                chordStart: token,
                chordUntil: token ? Date.now() + 1500 : 0,
            } as any);
        },
    } as any);
}

function fireKeydown(opts: Partial<KeyboardEventInit> & { key: string }) {
    // Dispatch from document.body so event.target is an HTMLElement (Window
    // doesn't expose .closest, which the hook calls on the target).
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
    document.body.dispatchEvent(ev);
    return ev;
}

const toast = { error: vi.fn() };

describe('useGlobalShortcuts', () => {
    beforeEach(() => {
        mockCommands.forEach(c => c.action.mockReset());
        toast.error.mockReset();
        seedRules([{ commandId: 'run.query', binding: 'ctrl+enter' }]);
    });

    it('fires the command action for a single-key match', () => {
        renderHook(() => useGlobalShortcuts(toast));

        fireKeydown({ key: 'Enter', ctrlKey: true });

        expect(mockCommands[0].action).toHaveBeenCalledTimes(1);
    });

    describe('with a focused terminal', () => {
        function keydownInsideTerminal(opts: Partial<KeyboardEventInit> & { key: string }) {
            const host = document.createElement('div');
            host.className = 'zentro-terminal';
            const target = document.createElement('textarea'); // xterm's hidden input
            host.appendChild(target);
            document.body.appendChild(host);

            const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
            Object.defineProperty(ev, 'target', { value: target });
            window.dispatchEvent(ev);
            document.body.removeChild(host);
            return ev;
        }

        beforeEach(() => {
            seedRules([
                { commandId: 'editor.contextSearch', binding: 'ctrl+e' },
                { commandId: 'layout.toggleTerminal', binding: 'ctrl+`' },
            ]);
        });

        it('leaves readline keys like Ctrl+E to the shell', () => {
            renderHook(() => useGlobalShortcuts(toast));

            const ev = keydownInsideTerminal({ key: 'e', ctrlKey: true });

            expect(mockCommands[2].action).not.toHaveBeenCalled();
            expect(ev.defaultPrevented).toBe(false);
        });

        it('still runs the same key everywhere else', () => {
            renderHook(() => useGlobalShortcuts(toast));

            fireKeydown({ key: 'e', ctrlKey: true });

            expect(mockCommands[2].action).toHaveBeenCalledTimes(1);
        });

        it('keeps the terminal toggle global, so there is a way back out', () => {
            renderHook(() => useGlobalShortcuts(toast));

            keydownInsideTerminal({ key: '`', ctrlKey: true });

            expect(mockCommands[4].action).toHaveBeenCalledTimes(1);
        });
    });

    it('fires Ctrl+Enter when focus is inside Monaco editor chrome', () => {
        renderHook(() => useGlobalShortcuts(toast));

        const editorNode = document.createElement('div');
        editorNode.className = 'zentro-sql-editor';
        const monacoNode = document.createElement('div');
        monacoNode.className = 'monaco-editor';
        const target = document.createElement('div');
        monacoNode.appendChild(target);
        editorNode.appendChild(monacoNode);
        document.body.appendChild(editorNode);

        const ev = new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(ev, 'target', { value: target });
        window.dispatchEvent(ev);

        expect(mockCommands[0].action).toHaveBeenCalledTimes(1);
        document.body.removeChild(editorNode);
    });

    it('does not fire Ctrl+Enter from filter Monaco', () => {
        renderHook(() => useGlobalShortcuts(toast));

        const editorNode = document.createElement('div');
        editorNode.className = 'zentro-filter-monaco';
        const monacoNode = document.createElement('div');
        monacoNode.className = 'monaco-editor';
        const target = document.createElement('div');
        monacoNode.appendChild(target);
        editorNode.appendChild(monacoNode);
        document.body.appendChild(editorNode);

        const ev = new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(ev, 'target', { value: target });
        window.dispatchEvent(ev);

        expect(mockCommands[0].action).not.toHaveBeenCalled();
        document.body.removeChild(editorNode);
    });

    it('fires a matching shortcut when focus is in an input', () => {
        renderHook(() => useGlobalShortcuts(toast));

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        const ev = new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(ev, 'target', { value: input });
        window.dispatchEvent(ev);

        expect(mockCommands[0].action).toHaveBeenCalledTimes(1);
        expect(ev.defaultPrevented).toBe(true);
        document.body.removeChild(input);
    });

    it('leaves unmatched keys for the focused input', () => {
        renderHook(() => useGlobalShortcuts(toast));

        const input = document.createElement('input');
        document.body.appendChild(input);

        const ev = new KeyboardEvent('keydown', {
            key: 'a',
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(ev, 'target', { value: input });
        window.dispatchEvent(ev);

        expect(mockCommands[0].action).not.toHaveBeenCalled();
        expect(ev.defaultPrevented).toBe(false);
        document.body.removeChild(input);
    });

    it('chord shortcut: first key sets chord state without firing action', () => {
        seedRules([{ commandId: 'workspace.toggleSidebar', binding: 'ctrl+k ctrl+b' }]);
        renderHook(() => useGlobalShortcuts(toast));

        // First key — should set chord state, not fire action.
        act(() => {
            fireKeydown({ key: 'k', ctrlKey: true });
        });
        expect(mockCommands[1].action).not.toHaveBeenCalled();
        expect(useShortcutStore.getState().chordStart).toBe('ctrl+k');

        // The second-key completion is exercised via the React lifecycle when the
        // effect re-runs on chord state change; assert the wiring (deps + setChord)
        // is in place via the first-key-set behaviour above.
    });

    it('chord completion beats a single-key rule that uses the same second key', () => {
        seedRules([
            { commandId: 'editor.contextSearch', binding: 'ctrl+e' },
            { commandId: 'layout.focusExplorer', binding: 'ctrl+k ctrl+e' },
        ]);
        renderHook(() => useGlobalShortcuts(toast));

        act(() => {
            fireKeydown({ key: 'k', ctrlKey: true });
        });
        act(() => {
            fireKeydown({ key: 'e', ctrlKey: true });
        });

        expect(mockCommands[3].action).toHaveBeenCalledTimes(1);
        expect(mockCommands[2].action).not.toHaveBeenCalled();
        expect(useShortcutStore.getState().chordStart).toBeNull();
    });

    it('a non-matching second key cancels the pending chord', () => {
        seedRules([
            { commandId: 'editor.contextSearch', binding: 'ctrl+e' },
            { commandId: 'layout.focusExplorer', binding: 'ctrl+k ctrl+e' },
        ]);
        renderHook(() => useGlobalShortcuts(toast));

        act(() => {
            fireKeydown({ key: 'k', ctrlKey: true });
        });
        act(() => {
            fireKeydown({ key: 'x', ctrlKey: true });
        });

        expect(mockCommands[3].action).not.toHaveBeenCalled();
        expect(mockCommands[2].action).not.toHaveBeenCalled();
        expect(useShortcutStore.getState().chordStart).toBeNull();
    });

    it('removes the global keydown listener on unmount', () => {
        const { unmount } = renderHook(() => useGlobalShortcuts(toast));
        unmount();

        fireKeydown({ key: 'Enter', ctrlKey: true });
        expect(mockCommands[0].action).not.toHaveBeenCalled();
    });

    it('surfaces action errors via the toast.error callback', async () => {
        mockCommands[0].action.mockRejectedValue(new Error('boom'));
        renderHook(() => useGlobalShortcuts(toast));

        fireKeydown({ key: 'Enter', ctrlKey: true });
        // Async rejection — wait a tick.
        await Promise.resolve();
        await Promise.resolve();

        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toContain('Run Query');
    });
});
