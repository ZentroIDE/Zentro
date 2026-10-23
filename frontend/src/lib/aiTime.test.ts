// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { formatMessageTime, relativeTime } from './aiTime';

const now = Date.parse('2026-10-05T12:00:00Z');

describe('relativeTime', () => {
    it('uses the smallest sensible unit', () => {
        expect(relativeTime('2026-10-05T11:59:40Z', now)).toBe('now');
        expect(relativeTime('2026-10-05T11:48:00Z', now)).toBe('12m');
        expect(relativeTime('2026-10-05T08:00:00Z', now)).toBe('4h');
        expect(relativeTime('2026-10-03T12:00:00Z', now)).toBe('2d');
        expect(relativeTime('2026-09-14T12:00:00Z', now)).toBe('3w');
    });

    it('returns nothing for a bad timestamp', () => {
        expect(relativeTime('not a date', now)).toBe('');
    });
});

describe('formatMessageTime', () => {
    const local = (y: number, m: number, d: number, h: number, min: number) =>
        new Date(y, m - 1, d, h, min).toISOString();
    const reference = new Date(2026, 9, 5, 15, 0).getTime();

    it('shows only the clock for today and adds the date before', () => {
        expect(formatMessageTime(local(2026, 10, 5, 14, 32), reference)).toBe('14:32');
        expect(formatMessageTime(local(2026, 10, 3, 9, 5), reference)).toBe('03/10 09:05');
    });

    it('returns nothing for a bad timestamp', () => {
        expect(formatMessageTime('nope', reference)).toBe('');
    });
});
