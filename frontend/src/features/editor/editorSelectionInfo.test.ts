// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    computeSelectionInfo,
    formatSelectionInfo,
    selectionInfoEquals,
    EMPTY_SELECTION_INFO,
} from './editorSelectionInfo';

const model = { getValueLengthInRange: () => 7 };
const range = (l1: number, c1: number, l2: number, c2: number) => ({
    startLineNumber: l1,
    startColumn: c1,
    endLineNumber: l2,
    endColumn: c2,
});

describe('computeSelectionInfo', () => {
    it('reports zero selection for a bare caret', () => {
        const info = computeSelectionInfo(model, [range(2, 4, 2, 4)], {
            lineNumber: 2,
            column: 4,
        });
        expect(info).toEqual({
            line: 2,
            column: 4,
            selectedChars: 0,
            selectedLines: 0,
            cursorCount: 1,
        });
    });

    it('counts characters and lines of a multi-line selection', () => {
        const info = computeSelectionInfo(model, [range(1, 1, 3, 2)], {
            lineNumber: 3,
            column: 2,
        });
        expect(info.selectedChars).toBe(7);
        expect(info.selectedLines).toBe(3);
    });

    it('sums across multiple cursors and skips empty ones', () => {
        const info = computeSelectionInfo(
            model,
            [range(1, 1, 1, 5), range(2, 1, 2, 1), range(3, 1, 3, 5)],
            { lineNumber: 3, column: 5 },
        );
        expect(info.selectedChars).toBe(14);
        expect(info.cursorCount).toBe(3);
    });
});

describe('formatSelectionInfo', () => {
    it('omits the selection segment when nothing is selected', () => {
        expect(formatSelectionInfo(EMPTY_SELECTION_INFO)).toBe('Ln 1, Col 1');
    });

    it('shows selected count, lines and cursors', () => {
        expect(
            formatSelectionInfo({
                line: 3,
                column: 2,
                selectedChars: 1234,
                selectedLines: 3,
                cursorCount: 2,
            }),
        ).toBe(`Ln 3, Col 2  ·  ${(1234).toLocaleString()} selected (3 lines)  ·  2 cursors`);
    });
});

describe('selectionInfoEquals', () => {
    it('compares every field', () => {
        expect(selectionInfoEquals(EMPTY_SELECTION_INFO, { ...EMPTY_SELECTION_INFO })).toBe(true);
        expect(
            selectionInfoEquals(EMPTY_SELECTION_INFO, { ...EMPTY_SELECTION_INFO, line: 2 }),
        ).toBe(false);
    });
});
