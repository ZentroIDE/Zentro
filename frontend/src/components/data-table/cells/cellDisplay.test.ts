// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { formatCellDisplayValue, isNullValue, splitTemporalDisplay } from './cellDisplay';

describe('splitTemporalDisplay', () => {
    it('peels a trailing numeric offset off a timestamptz value', () => {
        expect(splitTemporalDisplay('2026-08-01 14:56:48.055 +0700')).toEqual({
            main: '2026-08-01 14:56:48.055',
            tz: '+0700',
        });
        expect(splitTemporalDisplay('2026-08-01 14:56:48 +07:00')).toEqual({
            main: '2026-08-01 14:56:48',
            tz: '+07:00',
        });
        expect(splitTemporalDisplay('2026-08-01 07:56:48 Z')).toEqual({
            main: '2026-08-01 07:56:48',
            tz: 'Z',
        });
    });

    it('returns the whole value when there is no offset', () => {
        expect(splitTemporalDisplay('2026-08-01 14:56:48.055')).toEqual({
            main: '2026-08-01 14:56:48.055',
            tz: '',
        });
        expect(splitTemporalDisplay('hello world')).toEqual({ main: 'hello world', tz: '' });
    });

    it('does not treat the doubled legacy Go artifact as a clean split', () => {
        // "+0700 +07" should not pass — only a single well-formed offset does.
        expect(splitTemporalDisplay('2026-08-01 14:56:48.055 +0700 +07').tz).toBe('');
    });
});

describe('formatCellDisplayValue', () => {
    it('renders null/undefined as the literal "null"', () => {
        expect(formatCellDisplayValue(null)).toBe('null');
        expect(formatCellDisplayValue(undefined)).toBe('null');
    });

    it('passes strings through untouched', () => {
        expect(formatCellDisplayValue('2026-08-01 14:56:48.055 +0700')).toBe(
            '2026-08-01 14:56:48.055 +0700',
        );
    });
});

describe('isNullValue', () => {
    it('detects null and undefined', () => {
        expect(isNullValue(null)).toBe(true);
        expect(isNullValue(undefined)).toBe(true);
    });

    it('returns false for concrete values', () => {
        expect(isNullValue('')).toBe(false);
        expect(isNullValue(0)).toBe(false);
        expect(isNullValue(false)).toBe(false);
        expect(isNullValue('null')).toBe(false);
    });
});
