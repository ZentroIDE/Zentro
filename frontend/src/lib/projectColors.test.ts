// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PROJECT_COLOR_KEY,
    PROJECT_COLOR_PALETTE,
    hashProjectColorKey,
    resolveProjectColor,
} from './projectColors';

describe('projectColors', () => {
    it('defaults new projects to a real teal palette key', () => {
        expect(DEFAULT_PROJECT_COLOR_KEY).toBe('teal');
        expect(PROJECT_COLOR_PALETTE.some(option => option.key === DEFAULT_PROJECT_COLOR_KEY)).toBe(
            true,
        );
    });

    it('hashes the same id to the same palette key every time', () => {
        const first = hashProjectColorKey('project-abc-123');
        const second = hashProjectColorKey('project-abc-123');
        expect(first).toBe(second);
        expect(PROJECT_COLOR_PALETTE.some(option => option.key === first)).toBe(true);
    });

    it('spreads different ids across more than one palette entry', () => {
        const keys = new Set(
            Array.from({ length: 40 }, (_, i) => hashProjectColorKey(`project-${i}`)),
        );
        expect(keys.size).toBeGreaterThan(1);
    });

    it('prefers the explicitly chosen color over the hash', () => {
        const option = resolveProjectColor({ id: 'p1', color: 'teal' });
        expect(option?.key).toBe('teal');
    });

    it('falls back to the hash color when no color is set', () => {
        const option = resolveProjectColor({ id: 'p1', color: undefined });
        expect(option?.key).toBe(hashProjectColorKey('p1'));
    });

    it('falls back to the hash color for unknown palette keys', () => {
        const option = resolveProjectColor({ id: 'p1', color: 'not-a-real-key' });
        expect(option?.key).toBe(hashProjectColorKey('p1'));
    });

    it('returns null for missing projects', () => {
        expect(resolveProjectColor(null)).toBeNull();
        expect(resolveProjectColor(undefined)).toBeNull();
        expect(resolveProjectColor({ id: '', color: 'teal' })).toBeNull();
    });
});
