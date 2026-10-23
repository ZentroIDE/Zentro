// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';
import { categoryForTokenType } from '../sqlEditorStyle';

type MonacoInstance = Parameters<OnMount>[1];

export const SEMIBOLD_CLASS = 'zentro-sql-semibold';

// Same bound as the other purely cosmetic scans: past this the editor keeps the
// plain bold Monaco draws for these tokens instead of paying to trim it to 600.
const MAX_CHARS = 200_000;
const MAX_DECORATIONS = 20_000;
const REFRESH_DELAY_MS = 120;

/**
 * Monaco's token theme can only draw normal or bold. For categories the user
 * set to semi-bold the theme emits bold (see buildSqlStyleRules) and this adds
 * a decoration on each of their tokens whose CSS (`!important`, see index.css)
 * trims the weight to 600. Without categories it does nothing at all.
 */
export function setupTokenWeightDecorations(
    editorInstance: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
): { update: (categoryIds: readonly string[]) => void; dispose: () => void } {
    const decorations = editorInstance.createDecorationsCollection();
    let categories = new Set<string>();
    let timer: number | null = null;

    const clear = () => decorations.clear();

    const refresh = () => {
        timer = null;
        const model = editorInstance.getModel();
        if (!model || categories.size === 0) {
            clear();
            return;
        }
        const text = model.getValue();
        if (text.length > MAX_CHARS) {
            clear();
            return;
        }

        const ranges: editor.IModelDeltaDecoration[] = [];
        const tokenLines = monaco.editor.tokenize(text, 'sql');
        for (let lineIndex = 0; lineIndex < tokenLines.length; lineIndex++) {
            const lineNumber = lineIndex + 1;
            const lineEnd = model.getLineMaxColumn(lineNumber);
            const tokens = tokenLines[lineIndex];
            for (let i = 0; i < tokens.length; i++) {
                const category = categoryForTokenType(tokens[i].type);
                if (!category || !categories.has(category.id)) continue;
                const startColumn = tokens[i].offset + 1;
                const endColumn = tokens[i + 1] ? tokens[i + 1].offset + 1 : lineEnd;
                if (endColumn <= startColumn) continue;
                ranges.push({
                    range: new monaco.Range(lineNumber, startColumn, lineNumber, endColumn),
                    options: { inlineClassName: SEMIBOLD_CLASS },
                });
                if (ranges.length >= MAX_DECORATIONS) break;
            }
            if (ranges.length >= MAX_DECORATIONS) break;
        }
        decorations.set(ranges);
    };

    const schedule = () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(refresh, REFRESH_DELAY_MS);
    };

    const contentListener = editorInstance.onDidChangeModelContent(() => {
        if (categories.size > 0) schedule();
    });

    return {
        update: categoryIds => {
            categories = new Set(categoryIds);
            if (timer !== null) window.clearTimeout(timer);
            refresh();
        },
        dispose: () => {
            if (timer !== null) window.clearTimeout(timer);
            contentListener.dispose();
            clear();
        },
    };
}
