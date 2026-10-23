// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DEFAULT_SQL_FORMAT, normalizeSqlFormat, toSqlFormatPrefs } from './sqlFormatSettings';

describe('normalizeSqlFormat', () => {
    it('resolves an unset config (older files) to the defaults', () => {
        expect(normalizeSqlFormat(undefined)).toEqual(DEFAULT_SQL_FORMAT);
        expect(normalizeSqlFormat({})).toEqual(DEFAULT_SQL_FORMAT);
    });

    it('keeps valid stored choices', () => {
        expect(
            normalizeSqlFormat({
                keyword_case: 'lower',
                indent_size: 4,
                use_tabs: true,
                comma_position: 'leading',
                and_or_position: 'trailing',
            }),
        ).toEqual({
            keywordCase: 'lower',
            indentSize: 4,
            useTabs: true,
            commaPosition: 'leading',
            andOrPosition: 'trailing',
        });
    });

    it('falls back per field when a stored value is not recognised', () => {
        expect(
            normalizeSqlFormat({ keyword_case: 'shout', indent_size: 3, comma_position: 'x' }),
        ).toEqual(DEFAULT_SQL_FORMAT);
    });
});

describe('toSqlFormatPrefs', () => {
    it('round-trips through normalizeSqlFormat', () => {
        const settings = {
            keywordCase: 'preserve' as const,
            indentSize: 8 as const,
            useTabs: false,
            commaPosition: 'leading' as const,
            andOrPosition: 'trailing' as const,
        };
        expect(normalizeSqlFormat(toSqlFormatPrefs(settings))).toEqual(settings);
    });
});
