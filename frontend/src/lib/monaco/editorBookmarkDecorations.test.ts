// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { setupBookmarkDecorations } from './editorBookmarkDecorations';

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
    return {
        deltaDecorations: vi.fn((_prevIds: string[], next: unknown[]) =>
            next.map((_, i) => `deco-${i}`),
        ),
    };
}

describe('setupBookmarkDecorations', () => {
    it('renders one whole-line decoration per bookmark', () => {
        const editor = makeEditor();
        const manager = setupBookmarkDecorations(editor as never, makeMonaco() as never);

        manager.update([{ line: 3 }, { line: 7 }]);

        expect(editor.deltaDecorations).toHaveBeenCalledWith(
            [],
            [
                expect.objectContaining({
                    range: expect.objectContaining({ startLineNumber: 3, endLineNumber: 3 }),
                    options: expect.objectContaining({ className: 'zentro-bookmark-line' }),
                }),
                expect.objectContaining({
                    range: expect.objectContaining({ startLineNumber: 7, endLineNumber: 7 }),
                }),
            ],
        );
    });

    it('passes the previous decoration ids to deltaDecorations on the next update', () => {
        const editor = makeEditor();
        const manager = setupBookmarkDecorations(editor as never, makeMonaco() as never);

        manager.update([{ line: 1 }]);
        manager.update([{ line: 1 }, { line: 2 }]);

        expect(editor.deltaDecorations).toHaveBeenNthCalledWith(2, ['deco-0'], expect.any(Array));
    });

    it('clear() removes all decorations', () => {
        const editor = makeEditor();
        const manager = setupBookmarkDecorations(editor as never, makeMonaco() as never);

        manager.update([{ line: 1 }]);
        manager.clear();

        expect(editor.deltaDecorations).toHaveBeenLastCalledWith(['deco-0'], []);
    });
});
