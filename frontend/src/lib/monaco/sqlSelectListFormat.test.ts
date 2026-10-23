// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    formatSelectList,
    formatSelectListContinuation,
    readLineIndent,
} from './sqlSelectListFormat';

const cols = (count: number) => Array.from({ length: count }, (_, index) => `c${index + 1}`);

describe('readLineIndent', () => {
    it('returns the leading spaces and tabs only', () => {
        expect(readLineIndent('SELECT 1')).toBe('');
        expect(readLineIndent('    SELECT 1')).toBe('    ');
        expect(readLineIndent('\t  SELECT 1')).toBe('\t  ');
        expect(readLineIndent('   ')).toBe('   ');
        expect(readLineIndent('')).toBe('');
    });
});

describe('formatSelectListContinuation', () => {
    it('returns nothing for no columns', () => {
        expect(formatSelectListContinuation([])).toBe('');
    });

    it('appends a short list on the same line, each column after its comma', () => {
        expect(formatSelectListContinuation(cols(2))).toBe(', c1, c2');
    });

    it('puts every column of a long list on its own comma-first line', () => {
        expect(formatSelectListContinuation(cols(5), { lineIndent: '  ' })).toBe(
            '\n      , c1\n      , c2\n      , c3\n      , c4\n      , c5',
        );
    });
});

describe('formatSelectList', () => {
    it('returns an empty string for no columns', () => {
        expect(formatSelectList([])).toBe('');
    });

    it('keeps a short list on one line', () => {
        expect(formatSelectList(cols(1))).toBe('c1');
        expect(formatSelectList(cols(4))).toBe('c1, c2, c3, c4');
    });

    it('writes a long list comma-first, one column per line', () => {
        expect(formatSelectList(cols(5))).toBe(
            '\n      c1\n    , c2\n    , c3\n    , c4\n    , c5',
        );
    });

    it('never leaves a trailing comma', () => {
        const text = formatSelectList(cols(12));
        expect(text.trimEnd().endsWith(',')).toBe(false);
        expect(text.split('\n').every(line => !line.trimEnd().endsWith(','))).toBe(true);
    });

    it('indents relative to the line the list is inserted into', () => {
        expect(formatSelectList(cols(5), { lineIndent: '  ' })).toBe(
            '\n        c1\n      , c2\n      , c3\n      , c4\n      , c5',
        );
        expect(formatSelectList(cols(5), { lineIndent: '\t' })).toBe(
            '\n\t      c1\n\t    , c2\n\t    , c3\n\t    , c4\n\t    , c5',
        );
    });

    it('keeps the first column on the current line when asked', () => {
        expect(formatSelectList(cols(5), { firstColumnInline: true })).toBe(
            'c1\n    , c2\n    , c3\n    , c4\n    , c5',
        );
    });

    it('ignores firstColumnInline for a short list', () => {
        expect(formatSelectList(cols(2), { firstColumnInline: true })).toBe('c1, c2');
    });
});
