// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { setupExecutedLineDecorations } from './editorExecutedLineDecorations';

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
    };
}

function makeEditor() {
    const decorationsCollection = { set: vi.fn(), clear: vi.fn() };
    let contentListener: (() => void) | null = null;
    return {
        _decorationsCollection: decorationsCollection,
        _fireContentChanged: () => contentListener?.(),
        createDecorationsCollection: vi.fn(() => decorationsCollection),
        getModel: vi.fn(() => ({ getLineMaxColumn: (line: number) => line * 10 })),
        onDidChangeModelContent: vi.fn((cb: () => void) => {
            contentListener = cb;
            return { dispose: vi.fn() };
        }),
    };
}

describe('setupExecutedLineDecorations', () => {
    it('sets a whole-line decoration for the given range', () => {
        const editor = makeEditor();
        const monaco = makeMonaco();
        const manager = setupExecutedLineDecorations(editor as never, monaco as never);

        manager.set({ startLineNumber: 2, endLineNumber: 3 });

        expect(editor._decorationsCollection.set).toHaveBeenCalledWith([
            {
                range: expect.objectContaining({
                    startLineNumber: 2,
                    startColumn: 1,
                    endLineNumber: 3,
                    endColumn: 30,
                }),
                options: { isWholeLine: true, className: 'zentro-executed-statement' },
            },
        ]);
    });

    it('clears the decoration automatically on the next model edit', () => {
        const editor = makeEditor();
        const manager = setupExecutedLineDecorations(editor as never, makeMonaco() as never);

        manager.set({ startLineNumber: 1, endLineNumber: 1 });
        editor._fireContentChanged();

        expect(editor._decorationsCollection.clear).toHaveBeenCalledTimes(1);
        manager.dispose();
    });

    it('dispose() clears the decoration and unsubscribes', () => {
        const editor = makeEditor();
        const manager = setupExecutedLineDecorations(editor as never, makeMonaco() as never);

        manager.dispose();

        expect(editor._decorationsCollection.clear).toHaveBeenCalledTimes(1);
    });
});
