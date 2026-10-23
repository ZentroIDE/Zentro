// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';

type MonacoInstance = Parameters<OnMount>[1];

export interface ExecutedLineRange {
    startLineNumber: number;
    endLineNumber: number;
}

/** Highlights the block of lines that was just run. Clears itself
 *  automatically on the next model edit (self-subscribed, matching
 *  `setupRiskHighlight`/`setupStatementHighlight`'s pattern), so callers
 *  only need to call `set()` right after running a statement. */
export function setupExecutedLineDecorations(
    editor: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
): { set: (range: ExecutedLineRange) => void; dispose: () => void } {
    const decorations = editor.createDecorationsCollection();

    const set = (range: ExecutedLineRange) => {
        const model = editor.getModel();
        decorations.set([
            {
                range: new monaco.Range(
                    range.startLineNumber,
                    1,
                    range.endLineNumber,
                    model?.getLineMaxColumn(range.endLineNumber) ?? 1,
                ),
                options: { isWholeLine: true, className: 'zentro-executed-statement' },
            },
        ]);
    };

    const contentDisposable = editor.onDidChangeModelContent(() => {
        decorations.clear();
    });

    return {
        set,
        dispose: () => {
            contentDisposable.dispose();
            decorations.clear();
        },
    };
}
