// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { escapeCsvField, matrixToCsv } from './csv';

describe('escapeCsvField', () => {
    it('returns plain values unchanged', () => {
        expect(escapeCsvField('hello')).toBe('hello');
    });

    it('wraps in quotes and doubles quotes when value contains a quote', () => {
        expect(escapeCsvField('he said "hi"')).toBe('"he said ""hi"""');
    });

    it('wraps in quotes when value contains a comma', () => {
        expect(escapeCsvField('a,b')).toBe('"a,b"');
    });

    it('wraps in quotes when value contains a newline', () => {
        expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('wraps in quotes when value contains a carriage return', () => {
        expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
    });

    it('treats empty string as plain (no wrap)', () => {
        expect(escapeCsvField('')).toBe('');
    });
});

describe('matrixToCsv', () => {
    it('joins cells with comma and rows with newline', () => {
        expect(
            matrixToCsv([
                ['a', 'b', 'c'],
                ['1', '2', '3'],
            ]),
        ).toBe('a,b,c\n1,2,3');
    });

    it('escapes cells containing comma / quote / newline', () => {
        expect(
            matrixToCsv([
                ['name', 'comment'],
                ['Jane', 'she said "hi, there"'],
            ]),
        ).toBe('name,comment\nJane,"she said ""hi, there"""');
    });

    it('treats nullish cells as empty string', () => {
        expect(matrixToCsv([[null as unknown as string, 'b']])).toBe(',b');
    });

    it('returns empty string for empty matrix', () => {
        expect(matrixToCsv([])).toBe('');
    });
});
