// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { resolvePreferredSchemaName } from './schemaContext';

describe('resolvePreferredSchemaName', () => {
    it('keeps the saved schema when it still exists', () => {
        expect(resolvePreferredSchemaName(['audit', 'public'], 'audit')).toBe('audit');
    });

    it('matches the saved schema case-insensitively', () => {
        expect(resolvePreferredSchemaName(['Audit', 'Public'], 'public')).toBe('Public');
    });

    it('falls back to public when the saved schema is missing', () => {
        expect(resolvePreferredSchemaName(['audit', 'public'], 'missing')).toBe('public');
    });

    it('falls back to the first schema when public is unavailable', () => {
        expect(resolvePreferredSchemaName(['app', 'audit'], '')).toBe('app');
    });

    it('returns empty when no schemas are available', () => {
        expect(resolvePreferredSchemaName([], 'public')).toBe('');
    });
});
