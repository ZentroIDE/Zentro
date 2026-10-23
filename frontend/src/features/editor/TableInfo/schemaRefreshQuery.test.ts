// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { applySchemaRefreshRevision } from './schemaRefreshQuery';

describe('applySchemaRefreshRevision', () => {
    it('appends a schema revision marker to the query', () => {
        expect(applySchemaRefreshRevision('SELECT * FROM "public"."users"', 3)).toBe(
            'SELECT * FROM "public"."users" /* zentro:schema-rev:3 */',
        );
    });

    it('replaces an existing schema revision marker instead of stacking comments', () => {
        expect(
            applySchemaRefreshRevision(
                'SELECT * FROM "public"."users" /* zentro:schema-rev:1 */',
                4,
            ),
        ).toBe('SELECT * FROM "public"."users" /* zentro:schema-rev:4 */');
    });
});
