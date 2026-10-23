// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    resolveRunnableQueryTarget,
    type RunTargetModelLike,
    type RunTargetSelectionLike,
} from './monacoRunTarget';

function createModel(text: string): RunTargetModelLike {
    const lines = text.split('\n');
    return {
        getValueInRange: range => {
            const collected: string[] = [];
            for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
                const content = lines[line - 1] ?? '';
                const start = line === range.startLineNumber ? range.startColumn - 1 : 0;
                const end = line === range.endLineNumber ? range.endColumn - 1 : content.length;
                collected.push(content.slice(start, end));
            }
            return collected.join('\n');
        },
        getLineContent: lineNumber => lines[lineNumber - 1] ?? '',
        getLineCount: () => lines.length,
        getLineMaxColumn: lineNumber => (lines[lineNumber - 1]?.length ?? 0) + 1,
    };
}

function makeSelection(range: Omit<RunTargetSelectionLike, 'isEmpty'>): RunTargetSelectionLike {
    const isEmpty =
        range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
    return { ...range, isEmpty: () => isEmpty };
}

describe('resolveRunnableQueryTarget', () => {
    it('returns null when there is no model', () => {
        expect(resolveRunnableQueryTarget(null, null, { lineNumber: 1, column: 1 })).toBeNull();
    });

    it('returns the non-empty selection verbatim', () => {
        const model = createModel('SELECT 1;\nSELECT 2;');
        const selection = makeSelection({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 10,
        });

        const result = resolveRunnableQueryTarget(model, selection, { lineNumber: 1, column: 1 });

        expect(result).toEqual({ query: 'SELECT 1;', range: selection });
    });

    it('falls back to cursor position when selection is empty', () => {
        const model = createModel('SELECT 1;');
        const emptySelection = makeSelection({
            startLineNumber: 1,
            startColumn: 5,
            endLineNumber: 1,
            endColumn: 5,
        });

        const result = resolveRunnableQueryTarget(model, emptySelection, {
            lineNumber: 1,
            column: 5,
        });

        expect(result?.query).toBe('SELECT 1;');
    });

    it('returns null when a whitespace-only selection is non-empty', () => {
        const model = createModel('SELECT 1;');
        const selection = makeSelection({
            startLineNumber: 1,
            startColumn: 10,
            endLineNumber: 1,
            endColumn: 10,
        });
        // Force isEmpty() to report false to exercise the whitespace-trim guard.
        selection.isEmpty = () => false;

        expect(resolveRunnableQueryTarget(model, selection, null)).toBeNull();
    });

    it('expands to the contiguous non-blank block around the cursor', () => {
        const model = createModel('SELECT 1;\nFROM users\n\nSELECT 2;');

        const result = resolveRunnableQueryTarget(model, null, { lineNumber: 2, column: 1 });

        expect(result?.query).toBe('SELECT 1;\nFROM users');
        expect(result?.range).toEqual({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 11,
        });
    });

    it('returns null when the cursor sits on a blank line', () => {
        const model = createModel('SELECT 1;\n\nSELECT 2;');

        expect(resolveRunnableQueryTarget(model, null, { lineNumber: 2, column: 1 })).toBeNull();
    });

    it('returns null when there is no position and the selection is empty', () => {
        const model = createModel('SELECT 1;');
        const selection = makeSelection({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
        });

        expect(resolveRunnableQueryTarget(model, selection, null)).toBeNull();
    });

    it('expands across the full file when there are no blank-line boundaries', () => {
        const model = createModel('SELECT 1\nFROM users\nWHERE id = 1');

        const result = resolveRunnableQueryTarget(model, null, { lineNumber: 2, column: 3 });

        expect(result?.range).toEqual({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 3,
            endColumn: 13,
        });
    });
});
