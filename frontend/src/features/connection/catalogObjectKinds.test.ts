// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { catalogKindToCategoryKey, categoryKeyToCatalogKind } from './catalogObjectKinds';
import { CATEGORY_KEY } from './databaseExplorerTypes';

describe('catalogObjectKinds mapping', () => {
    it('maps the aggregate-function singular/plural pair both ways', () => {
        expect(catalogKindToCategoryKey('aggregate_function')).toBe(
            CATEGORY_KEY.AGGREGATE_FUNCTIONS,
        );
        expect(categoryKeyToCatalogKind(CATEGORY_KEY.AGGREGATE_FUNCTIONS)).toBe(
            'aggregate_function',
        );
    });

    it('passes every other vocabulary value through unchanged', () => {
        for (const key of Object.values(CATEGORY_KEY)) {
            if (key === CATEGORY_KEY.AGGREGATE_FUNCTIONS) continue;
            expect(categoryKeyToCatalogKind(key)).toBe(key);
        }
        expect(catalogKindToCategoryKey('sequences')).toBe('sequences');
        expect(catalogKindToCategoryKey('indexes')).toBe('indexes');
    });

    it('round-trips every category key', () => {
        for (const key of Object.values(CATEGORY_KEY)) {
            expect(catalogKindToCategoryKey(categoryKeyToCatalogKind(key))).toBe(key);
        }
    });
});
