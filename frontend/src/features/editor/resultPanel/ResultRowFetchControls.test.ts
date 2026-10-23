// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
    FETCH_ALL_CONFIRM_THRESHOLD,
    parseFetchRowCount,
    shouldConfirmFetchAll,
} from './ResultRowFetchControls';

describe('parseFetchRowCount', () => {
    it('accepts positive integers and ignores surrounding whitespace', () => {
        expect(parseFetchRowCount('500')).toBe(500);
        expect(parseFetchRowCount('  250 ')).toBe(250);
    });

    it('rejects empty, zero, negative and fractional input', () => {
        ['', ' ', '0', '-5', '1.5', 'abc'].forEach(raw => {
            expect(parseFetchRowCount(raw)).toBeNull();
        });
    });
});

describe('shouldConfirmFetchAll', () => {
    it('confirms when the total is unknown or above the threshold', () => {
        expect(shouldConfirmFetchAll(undefined)).toBe(true);
        expect(shouldConfirmFetchAll(FETCH_ALL_CONFIRM_THRESHOLD + 1)).toBe(true);
    });

    it('does not confirm for results at or below the threshold', () => {
        expect(shouldConfirmFetchAll(FETCH_ALL_CONFIRM_THRESHOLD)).toBe(false);
        expect(shouldConfirmFetchAll(120)).toBe(false);
    });
});
