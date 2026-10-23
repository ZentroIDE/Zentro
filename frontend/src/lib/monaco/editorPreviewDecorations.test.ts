// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { setupPreviewDecorations } from './editorPreviewDecorations';

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

function makeEditor(text: string) {
    const lines = text.split('\n');
    const decorations = { set: vi.fn(), clear: vi.fn() };
    return {
        _decorations: decorations,
        createDecorationsCollection: vi.fn(() => decorations),
        getModel: vi.fn(() => ({
            getValue: () => text,
            getPositionAt: (offset: number) => {
                let remaining = offset;
                for (let i = 0; i < lines.length; i++) {
                    if (remaining <= lines[i].length) {
                        return { lineNumber: i + 1, column: remaining + 1 };
                    }
                    remaining -= lines[i].length + 1;
                }
                return { lineNumber: lines.length, column: 1 };
            },
            getLineMaxColumn: (lineNumber: number) => (lines[lineNumber - 1]?.length ?? 0) + 1,
        })),
    };
}

describe('setupPreviewDecorations', () => {
    it('highlights the matched range with top/full/bottom bands', () => {
        const editor = makeEditor('SELECT 1;\nFROM users;\nWHERE 1=1;');
        const manager = setupPreviewDecorations(editor as never, makeMonaco() as never);

        manager.update('FROM users;');

        expect(editor._decorations.set).toHaveBeenCalledWith([
            expect.objectContaining({
                options: expect.objectContaining({ className: 'zentro-preview-highlight' }),
            }),
            expect.objectContaining({
                options: expect.objectContaining({ className: 'zentro-preview-highlight-top' }),
            }),
            expect.objectContaining({
                options: expect.objectContaining({
                    className: 'zentro-preview-highlight-bottom',
                }),
            }),
        ]);
    });

    it('clears decorations when previewedSql is null', () => {
        const editor = makeEditor('SELECT 1;');
        const manager = setupPreviewDecorations(editor as never, makeMonaco() as never);

        manager.update(null);

        expect(editor._decorations.clear).toHaveBeenCalledTimes(1);
        expect(editor._decorations.set).not.toHaveBeenCalled();
    });

    it('clears decorations when the previewed text is not found in the model', () => {
        const editor = makeEditor('SELECT 1;');
        const manager = setupPreviewDecorations(editor as never, makeMonaco() as never);

        manager.update('DOES NOT EXIST');

        expect(editor._decorations.clear).toHaveBeenCalledTimes(1);
    });

    it('clear() clears the decorations collection', () => {
        const editor = makeEditor('SELECT 1;');
        const manager = setupPreviewDecorations(editor as never, makeMonaco() as never);

        manager.clear();

        expect(editor._decorations.clear).toHaveBeenCalledTimes(1);
    });
});
