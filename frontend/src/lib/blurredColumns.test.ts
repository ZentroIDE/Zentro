// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getBlurredColumnNames } from './blurredColumns';

describe('getBlurredColumnNames', () => {
    it('returns nothing when no column is blurred', () => {
        expect(getBlurredColumnNames(['id', 'email'], undefined).size).toBe(0);
        expect(getBlurredColumnNames(['id', 'email'], new Set()).size).toBe(0);
    });

    it('maps blurred indexes to column names', () => {
        const names = getBlurredColumnNames(['id', 'email', 'phone'], new Set([1, 2]));
        expect(Array.from(names)).toEqual(['email', 'phone']);
    });

    it('treats a name as blurred when any same-named column is blurred', () => {
        const names = getBlurredColumnNames(['id', 'name', 'name'], new Set([2]));
        expect(names.has('name')).toBe(true);
        expect(names.has('id')).toBe(false);
    });
});
