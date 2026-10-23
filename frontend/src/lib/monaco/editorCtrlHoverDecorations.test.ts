// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupCtrlHoverDecorations } from './editorCtrlHoverDecorations';
import type { SchemaNode } from '../../stores/schemaStore';

function makeMonaco() {
    return {
        Range: class {
            constructor(
                public startLineNumber: number,
                public startColumn: number,
                public endLineNumber: number,
                public endColumn: number,
            ) {}
        },
        editor: { MouseTargetType: { CONTENT_TEXT: 6 } },
    };
}

function makeEditor(model: unknown) {
    const listeners: Record<string, ((...args: never[]) => void) | undefined> = {};
    return {
        _fire: (event: string, ...args: unknown[]) =>
            (listeners[event] as ((...a: unknown[]) => void) | undefined)?.(...args),
        deltaDecorations: vi.fn((_prev: string[], next: unknown[]) => next.map((_, i) => `d-${i}`)),
        getModel: vi.fn(() => model),
        onMouseMove: vi.fn(cb => {
            listeners.mouseMove = cb;
            return { dispose: vi.fn() };
        }),
        onMouseLeave: vi.fn(cb => {
            listeners.mouseLeave = cb;
            return { dispose: vi.fn() };
        }),
        onDidBlurEditorWidget: vi.fn(cb => {
            listeners.blur = cb;
            return { dispose: vi.fn() };
        }),
    };
}

const schemas: SchemaNode[] = [{ Name: 'public', Tables: ['users'], Views: [] }];

function makeModel(text: string) {
    return {
        getValue: () => text,
        getOffsetAt: (position: { lineNumber: number; column: number }) => position.column - 1,
        getWordAtPosition: () => ({ word: 'users', startColumn: 1, endColumn: 6 }),
    };
}

function fireMouseMoveOverText(
    editor: ReturnType<typeof makeEditor>,
    monaco: ReturnType<typeof makeMonaco>,
    position: { lineNumber: number; column: number },
    ctrlKey = true,
) {
    editor._fire('mouseMove', {
        target: { type: monaco.editor.MouseTargetType.CONTENT_TEXT, position },
        event: { browserEvent: { ctrlKey } },
    });
}

describe('setupCtrlHoverDecorations', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('underlines a navigable identifier when hovering with the modifier held', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => schemas);

        fireMouseMoveOverText(editor, monaco, { lineNumber: 1, column: 1 });

        expect(editor.deltaDecorations).toHaveBeenCalledWith(
            [],
            [
                expect.objectContaining({
                    options: { inlineClassName: 'zentro-table-nav-hover' },
                }),
            ],
        );
        manager.dispose();
    });

    it('clears the decoration when hovering without the modifier held', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => schemas);

        fireMouseMoveOverText(editor, monaco, { lineNumber: 1, column: 1 }, false);

        expect(editor.deltaDecorations).toHaveBeenCalledWith([], []);
        manager.dispose();
    });

    it('clears the decoration when there is no active connection (getSchemas returns null)', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => null);

        fireMouseMoveOverText(editor, monaco, { lineNumber: 1, column: 1 });

        expect(editor.deltaDecorations).toHaveBeenCalledWith([], []);
        manager.dispose();
    });

    it('clears the decoration on mouse leave', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => schemas);

        fireMouseMoveOverText(editor, monaco, { lineNumber: 1, column: 1 });
        editor._fire('mouseLeave');

        expect(editor.deltaDecorations).toHaveBeenLastCalledWith(['d-0'], []);
        manager.dispose();
    });

    it('clears the decoration when the editor loses focus', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => schemas);

        fireMouseMoveOverText(editor, monaco, { lineNumber: 1, column: 1 });
        editor._fire('blur');

        expect(editor.deltaDecorations).toHaveBeenLastCalledWith(['d-0'], []);
        manager.dispose();
    });

    it('re-applies the decoration on keydown when the pointer is already hovering', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => schemas);

        // Hover without the modifier first (no decoration), then press Ctrl.
        fireMouseMoveOverText(editor, monaco, { lineNumber: 1, column: 1 }, false);
        window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true }));

        expect(editor.deltaDecorations).toHaveBeenLastCalledWith(
            [],
            [expect.objectContaining({ options: { inlineClassName: 'zentro-table-nav-hover' } })],
        );
        manager.dispose();
    });

    it('dispose() clears the decoration and removes window listeners', () => {
        const model = makeModel('users');
        const editor = makeEditor(model);
        const monaco = makeMonaco();
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        const manager = setupCtrlHoverDecorations(editor as never, monaco as never, () => schemas);

        manager.dispose();

        expect(editor.deltaDecorations).toHaveBeenLastCalledWith([], []);
        expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
        expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function), true);
    });
});
