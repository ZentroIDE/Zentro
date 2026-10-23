// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    buildSqlStyleRules,
    DEFAULT_SQL_EDITOR_STYLE,
    isHexColor,
    normalizeSqlEditorStyle,
    schemaTokenCssVars,
    SQL_COLOR_PALETTE,
    categoryForTokenType,
    semiboldGrammarCategories,
    toSqlEditorStylePrefs,
} from './sqlEditorStyle';

describe('normalizeSqlEditorStyle', () => {
    it('resolves an unset config to no overrides', () => {
        expect(normalizeSqlEditorStyle(undefined)).toEqual(DEFAULT_SQL_EDITOR_STYLE);
        expect(normalizeSqlEditorStyle({})).toEqual(DEFAULT_SQL_EDITOR_STYLE);
    });

    it('drops unknown categories, bad colours and empty entries', () => {
        const style = normalizeSqlEditorStyle({
            light: {
                keyword: { color: '#0000ff', weight: 'bold' },
                string: { color: 'red' },
                bogus: { color: '#ffffff' },
                number: {},
            },
        });
        expect(style.light).toEqual({
            keyword: { color: '#0000ff', weight: 'bold', italic: false },
        });
    });

    it('round-trips through the backend shape', () => {
        const style = {
            light: { keyword: { color: '#0000ff', weight: 'bold' as const, italic: false } },
            dark: { comment: { color: '', weight: 'normal' as const, italic: true } },
            schemaHighlight: true,
        };
        expect(normalizeSqlEditorStyle(toSqlEditorStylePrefs(style))).toEqual(style);
    });
});

describe('buildSqlStyleRules', () => {
    it('emits SQL-scoped rules for the requested appearance only', () => {
        const rules = buildSqlStyleRules(
            {
                light: { keyword: { color: '#0000ff', weight: 'bold' as const, italic: false } },
                dark: { string: { color: '#ce9178', weight: 'normal' as const, italic: false } },
                schemaHighlight: false,
            },
            'light',
        );
        expect(rules).toEqual([{ token: 'keyword.zsql', foreground: '0000ff', fontStyle: 'bold' }]);
    });

    it('lets an entry restyle weight without a colour', () => {
        const rules = buildSqlStyleRules(
            {
                light: {},
                dark: { comment: { color: '', weight: 'normal' as const, italic: true } },
                schemaHighlight: false,
            },
            'dark',
        );
        expect(rules).toEqual([{ token: 'comment.zsql', fontStyle: 'italic' }]);
    });

    it('always writes a font style, so an entry can switch off what the theme adds', () => {
        const rules = buildSqlStyleRules(
            {
                light: { comment: { color: '#188038', weight: 'normal' as const, italic: false } },
                dark: {},
                schemaHighlight: false,
            },
            'light',
        );
        expect(rules).toEqual([{ token: 'comment.zsql', foreground: '188038', fontStyle: '' }]);
    });
});

describe('isHexColor', () => {
    it('accepts only #RRGGBB', () => {
        expect(isHexColor('#a1B2c3')).toBe(true);
        expect(isHexColor('a1b2c3')).toBe(false);
        expect(isHexColor('#abc')).toBe(false);
    });
});

describe('schemaTokenCssVars', () => {
    it('is empty while schema highlighting is off', () => {
        expect(schemaTokenCssVars(DEFAULT_SQL_EDITOR_STYLE, 'dark')).toEqual({});
    });

    it('falls back to per-appearance defaults and honours overrides', () => {
        const vars = schemaTokenCssVars(
            {
                light: {},
                dark: { table: { color: '#ff0000', weight: 'bold' as const, italic: false } },
                schemaHighlight: true,
            },
            'dark',
        );
        expect(vars['--zentro-sql-table-color']).toBe('#ff0000');
        expect(vars['--zentro-sql-table-weight']).toBe('700');
        expect(vars['--zentro-sql-column-color']).toBe('#9cdcfe');
        expect(vars['--zentro-sql-alias-style']).toBe('inherit');
    });

    it('never emits monaco rules for schema categories', () => {
        expect(
            buildSqlStyleRules(
                {
                    light: {
                        table: { color: '#ff0000', weight: 'normal' as const, italic: false },
                    },
                    dark: {},
                    schemaHighlight: true,
                },
                'light',
            ),
        ).toEqual([]);
    });
});

describe('font weight', () => {
    it('reads the pre-weight `bold` flag of an older config', () => {
        expect(
            normalizeSqlEditorStyle({ light: { keyword: { bold: true } } }).light.keyword,
        ).toEqual({
            color: '',
            weight: 'bold',
            italic: false,
        });
    });

    it('keeps semi-bold for every category', () => {
        const style = normalizeSqlEditorStyle({
            light: { keyword: { weight: 'semibold' }, table: { weight: 'semibold' } },
        });
        expect(style.light.keyword?.weight).toBe('semibold');
        expect(style.light.table?.weight).toBe('semibold');
    });

    it('draws a semi-bold grammar token as bold in the theme (a decoration trims it to 600)', () => {
        const style = {
            light: { keyword: { color: '', weight: 'semibold' as const, italic: false } },
            dark: {},
            schemaHighlight: false,
        };
        expect(buildSqlStyleRules(style, 'light')).toEqual([
            { token: 'keyword.zsql', fontStyle: 'bold' },
        ]);
        expect(semiboldGrammarCategories(style, 'light')).toEqual(['keyword']);
        expect(semiboldGrammarCategories(style, 'dark')).toEqual([]);
    });

    it('does not ask for a semi-bold decoration on schema names, which have their own CSS', () => {
        expect(
            semiboldGrammarCategories(
                {
                    light: { table: { color: '', weight: 'semibold' as const, italic: false } },
                    dark: {},
                    schemaHighlight: true,
                },
                'light',
            ),
        ).toEqual([]);
    });

    it('maps a token type back to its category', () => {
        expect(categoryForTokenType('keyword.zsql')?.id).toBe('keyword');
        expect(categoryForTokenType('identifier.quote.zsql')?.id).toBe('quotedIdentifier');
        expect(categoryForTokenType('white.zsql')).toBeUndefined();
    });

    it('maps semi-bold schema names to 600 and bold grammar tokens to a bold rule', () => {
        const vars = schemaTokenCssVars(
            {
                light: { table: { color: '', weight: 'semibold', italic: false } },
                dark: {},
                schemaHighlight: true,
            },
            'light',
        );
        expect(vars['--zentro-sql-table-weight']).toBe('600');
        expect(vars['--zentro-sql-column-weight']).toBe('inherit');
    });
});

describe('SQL_COLOR_PALETTE', () => {
    it('has six valid colours per appearance', () => {
        for (const appearance of ['light', 'dark'] as const) {
            expect(SQL_COLOR_PALETTE[appearance]).toHaveLength(6);
            SQL_COLOR_PALETTE[appearance].forEach(entry =>
                expect(isHexColor(entry.value)).toBe(true),
            );
        }
    });
});
