// SPDX-License-Identifier: GPL-3.0-only

import { utils } from '../../wailsjs/go/models';
import type { MonacoThemeRule } from './theme/themePresetTypes';

export type SqlStyleAppearance = 'light' | 'dark';

export type SqlFontWeight = 'normal' | 'semibold' | 'bold';

export const SQL_FONT_WEIGHTS: readonly SqlFontWeight[] = ['normal', 'semibold', 'bold'];

export interface SqlTokenStyle {
    /** "#RRGGBB"; empty keeps the theme colour. */
    color: string;
    weight: SqlFontWeight;
    italic: boolean;
}

export const EMPTY_SQL_TOKEN_STYLE: SqlTokenStyle = { color: '', weight: 'normal', italic: false };

export function isDefaultTokenStyle(style: SqlTokenStyle): boolean {
    return !style.color && style.weight === 'normal' && !style.italic;
}

export interface SqlPaletteColor {
    name: string;
    value: string;
}

/**
 * Six colours per appearance, picked to stay readable on that theme's editor
 * background (the dark set is lighter and less saturated than the light one).
 */
export const SQL_COLOR_PALETTE: Record<SqlStyleAppearance, readonly SqlPaletteColor[]> = {
    light: [
        { name: 'Blue', value: '#0b57d0' },
        { name: 'Teal', value: '#0e7490' },
        { name: 'Green', value: '#188038' },
        { name: 'Orange', value: '#b06000' },
        { name: 'Red', value: '#c5221f' },
        { name: 'Purple', value: '#8430ce' },
    ],
    dark: [
        { name: 'Blue', value: '#8ab4f8' },
        { name: 'Cyan', value: '#78d9ec' },
        { name: 'Green', value: '#81c995' },
        { name: 'Yellow', value: '#fdd663' },
        { name: 'Red', value: '#f28b82' },
        { name: 'Purple', value: '#c58af9' },
    ],
};

export interface SqlStyleCategory {
    id: string;
    label: string;
    hint: string;
    /**
     * Monaco token names produced by Zentro's SQL grammar (see sqlLanguage.ts).
     * All end in `.zsql`, so an override never recolours the JSON/log/filter
     * editors that share the same global theme.
     */
    tokens: readonly string[];
    /**
     * Schema-aware names (tables, columns, aliases) can't be told apart by the
     * grammar, so they are drawn by decorations from CSS variables instead of
     * Monaco theme rules.
     */
    schema?: boolean;
}

export const SQL_STYLE_CATEGORIES: readonly SqlStyleCategory[] = [
    {
        id: 'keyword',
        label: 'Keywords',
        hint: 'SELECT, FROM, JOIN, WHERE',
        tokens: ['keyword.zsql'],
    },
    {
        id: 'function',
        label: 'Functions',
        hint: 'COUNT, GETDATE, ISNULL',
        tokens: ['predefined.zsql'],
    },
    { id: 'type', label: 'Data types', hint: 'INT, VARCHAR, DATETIME', tokens: ['type.zsql'] },
    { id: 'string', label: 'Strings', hint: "'text', N'text'", tokens: ['string.zsql'] },
    { id: 'number', label: 'Numbers', hint: '42, 3.14, 0xFF', tokens: ['number.zsql'] },
    {
        id: 'comment',
        label: 'Comments',
        hint: '-- line and /* block */',
        tokens: ['comment.zsql'],
    },
    { id: 'operator', label: 'Operators', hint: '=, <>, +, AND, OR', tokens: ['operator.zsql'] },
    {
        id: 'variable',
        label: 'Variables',
        hint: '@id, @@ROWCOUNT, :name, $1',
        tokens: ['variable.zsql'],
    },
    { id: 'identifier', label: 'Identifiers', hint: 'Unquoted names', tokens: ['identifier.zsql'] },
    {
        id: 'quotedIdentifier',
        label: 'Quoted names',
        hint: '[bracketed] and "quoted"',
        tokens: ['identifier.quote.zsql'],
    },
    { id: 'bracket', label: 'Parentheses', hint: '( )', tokens: ['delimiter.parenthesis.zsql'] },
    { id: 'delimiter', label: 'Delimiters', hint: '; , .', tokens: ['delimiter.zsql'] },
    {
        id: 'table',
        label: 'Table names',
        hint: 'Tables and views found in the schema',
        tokens: [],
        schema: true,
    },
    {
        id: 'column',
        label: 'Column names',
        hint: 'alias.column, and columns of loaded tables',
        tokens: [],
        schema: true,
    },
    {
        id: 'alias',
        label: 'Aliases & CTEs',
        hint: 'u in "users u", WITH x AS (...)',
        tokens: [],
        schema: true,
    },
];

/** The style category a Monaco token type (as tokenized by the SQL grammar) belongs to. */
export function categoryForTokenType(tokenType: string): SqlStyleCategory | undefined {
    return SQL_STYLE_CATEGORIES.find(category => category.tokens.includes(tokenType));
}

/** Colours used for schema-aware names until the user picks their own. */
const SCHEMA_DEFAULT_COLORS: Record<SqlStyleAppearance, Record<string, string>> = {
    light: { table: '#267f99', column: '#001080', alias: '#795e26' },
    dark: { table: '#4ec9b0', column: '#9cdcfe', alias: '#dcdcaa' },
};

const CSS_WEIGHT: Record<SqlFontWeight, string> = {
    normal: 'inherit',
    semibold: '600',
    bold: '700',
};

export function schemaDefaultColor(categoryId: string, appearance: SqlStyleAppearance): string {
    return SCHEMA_DEFAULT_COLORS[appearance][categoryId] ?? '';
}

export const SCHEMA_TOKEN_CSS_PREFIX = '--zentro-sql-';

/**
 * CSS custom properties consumed by the `.zentro-sql-table|column|alias`
 * decoration classes (see index.css). Empty when schema highlighting is off.
 */
export function schemaTokenCssVars(
    style: SqlEditorStyle,
    appearance: SqlStyleAppearance,
): Record<string, string> {
    if (!style.schemaHighlight) return {};
    const vars: Record<string, string> = {};
    for (const category of SQL_STYLE_CATEGORIES) {
        if (!category.schema) continue;
        const entry = style[appearance][category.id];
        vars[`${SCHEMA_TOKEN_CSS_PREFIX}${category.id}-color`] =
            entry?.color || SCHEMA_DEFAULT_COLORS[appearance][category.id];
        vars[`${SCHEMA_TOKEN_CSS_PREFIX}${category.id}-weight`] =
            CSS_WEIGHT[entry?.weight ?? 'normal'];
        vars[`${SCHEMA_TOKEN_CSS_PREFIX}${category.id}-style`] = entry?.italic
            ? 'italic'
            : 'inherit';
    }
    return vars;
}

export type SqlStyleMap = Record<string, SqlTokenStyle>;

export interface SqlEditorStyle {
    light: SqlStyleMap;
    dark: SqlStyleMap;
    schemaHighlight: boolean;
}

export const DEFAULT_SQL_EDITOR_STYLE: SqlEditorStyle = {
    light: {},
    dark: {},
    schemaHighlight: false,
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
    return HEX_COLOR.test(value.trim());
}

function normalizeWeight(entry: Partial<utils.SQLTokenStyle>): SqlFontWeight {
    if ((SQL_FONT_WEIGHTS as readonly string[]).includes(entry.weight ?? '')) {
        return entry.weight as SqlFontWeight;
    }
    return entry.bold === true ? 'bold' : 'normal'; // pre-weight configs
}

function normalizeMap(raw: Record<string, Partial<utils.SQLTokenStyle>> | undefined): SqlStyleMap {
    const out: SqlStyleMap = {};
    for (const [id, entry] of Object.entries(raw ?? {})) {
        const category = SQL_STYLE_CATEGORIES.find(candidate => candidate.id === id);
        if (!category || !entry) continue;
        const style: SqlTokenStyle = {
            color:
                typeof entry.color === 'string' && isHexColor(entry.color)
                    ? entry.color.trim()
                    : '',
            weight: normalizeWeight(entry),
            italic: entry.italic === true,
        };
        if (!isDefaultTokenStyle(style)) out[id] = style;
    }
    return out;
}

/** Resolves whatever the backend stored (nothing, on older configs) into a clean value. */
export function normalizeSqlEditorStyle(
    raw?: Partial<utils.SQLEditorStyle> | null,
): SqlEditorStyle {
    return {
        light: normalizeMap(raw?.light),
        dark: normalizeMap(raw?.dark),
        schemaHighlight: raw?.schema_highlight === true,
    };
}

function mapToPrefs(map: SqlStyleMap): Record<string, utils.SQLTokenStyle> {
    const out: Record<string, utils.SQLTokenStyle> = {};
    for (const [id, style] of Object.entries(map)) {
        out[id] = new utils.SQLTokenStyle({
            color: style.color,
            weight: style.weight === 'normal' ? '' : style.weight,
            italic: style.italic,
        });
    }
    return out;
}

export function toSqlEditorStylePrefs(style: SqlEditorStyle): utils.SQLEditorStyle {
    return new utils.SQLEditorStyle({
        light: mapToPrefs(style.light),
        dark: mapToPrefs(style.dark),
        schema_highlight: style.schemaHighlight,
    });
}

/**
 * Monaco theme rules for the user's overrides on one appearance. An entry
 * defines the whole look, so its font style is always written: an empty string
 * turns off a bold or italic the theme would otherwise have added. Semi-bold is
 * emitted as bold (Monaco has no other weight) and trimmed to 600 by a
 * decoration, see editorTokenWeightDecorations.ts.
 */
export function buildSqlStyleRules(
    style: SqlEditorStyle,
    appearance: SqlStyleAppearance,
): MonacoThemeRule[] {
    const rules: MonacoThemeRule[] = [];
    const overrides = style[appearance];
    for (const category of SQL_STYLE_CATEGORIES) {
        const entry = overrides[category.id];
        if (!entry) continue;
        const fontStyle = [entry.weight !== 'normal' ? 'bold' : '', entry.italic ? 'italic' : '']
            .filter(Boolean)
            .join(' ');
        for (const token of category.tokens) {
            rules.push({
                token,
                ...(entry.color ? { foreground: entry.color.replace(/^#/, '') } : {}),
                fontStyle,
            });
        }
    }
    return rules;
}

/**
 * Grammar categories set to semi-bold. Monaco's theme can only draw normal or
 * bold, so these get a bold rule (the fallback) plus a decoration that trims
 * the weight to 600 (see editorTokenWeightDecorations.ts).
 */
export function semiboldGrammarCategories(
    style: SqlEditorStyle,
    appearance: SqlStyleAppearance,
): string[] {
    return SQL_STYLE_CATEGORIES.filter(
        category => !category.schema && style[appearance][category.id]?.weight === 'semibold',
    ).map(category => category.id);
}
