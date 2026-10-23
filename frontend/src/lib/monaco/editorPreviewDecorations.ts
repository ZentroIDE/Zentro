// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';

type MonacoInstance = Parameters<OnMount>[1];

/** Highlights the range of text matching `previewedSql`, when present in
 *  the model, with a top/middle/bottom banded style. */
export function setupPreviewDecorations(
    editor: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
): { update: (previewedSql: string | null | undefined) => void; clear: () => void } {
    const decorations = editor.createDecorationsCollection();

    const update = (previewedSql: string | null | undefined) => {
        const model = editor.getModel();
        if (!previewedSql || !model) {
            decorations.clear();
            return;
        }

        const fullText = model.getValue();
        const needle = previewedSql.trim();
        const idx = fullText.indexOf(needle);
        if (idx === -1) {
            decorations.clear();
            return;
        }

        const start = model.getPositionAt(idx);
        const end = model.getPositionAt(idx + needle.length);
        decorations.set([
            {
                range: new monaco.Range(
                    start.lineNumber,
                    1,
                    end.lineNumber,
                    model.getLineMaxColumn(end.lineNumber),
                ),
                options: { isWholeLine: true, className: 'zentro-preview-highlight' },
            },
            {
                range: new monaco.Range(
                    start.lineNumber,
                    1,
                    start.lineNumber,
                    model.getLineMaxColumn(start.lineNumber),
                ),
                options: { isWholeLine: true, className: 'zentro-preview-highlight-top' },
            },
            {
                range: new monaco.Range(
                    end.lineNumber,
                    1,
                    end.lineNumber,
                    model.getLineMaxColumn(end.lineNumber),
                ),
                options: { isWholeLine: true, className: 'zentro-preview-highlight-bottom' },
            },
        ]);
    };

    return {
        update,
        clear: () => decorations.clear(),
    };
}
