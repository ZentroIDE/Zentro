// SPDX-License-Identifier: GPL-3.0-only

import { buildMonacoCustomTheme } from './theme/monacoThemeFromTokens';
import { getThemePreset } from './theme/themePresetRegistry';
import type { MonacoThemeRule } from './theme/themePresetTypes';
import {
    schemaDefaultColor,
    SQL_STYLE_CATEGORIES,
    type SqlStyleAppearance,
    type SqlStyleMap,
} from './sqlEditorStyle';

/** What the editor of one theme looks like before the user's overrides. */
export interface PreviewBase {
    background: string;
    foreground: string;
    rules: MonacoThemeRule[];
}

// The generic rules of Monaco's own `vs` / `vs-dark` themes, which every preset
// inherits. (Its `.sql`-specific rules are left out on purpose: Zentro's grammar
// uses `.zsql`, so they never match.) A test compares these with the real ones.
export const BUILTIN_PREVIEW_BASE: Record<SqlStyleAppearance, PreviewBase> = {
    light: {
        background: '#fffffe',
        foreground: '#000000',
        rules: [
            { token: 'variable', foreground: '001188' },
            { token: 'comment', foreground: '008000' },
            { token: 'number', foreground: '098658' },
            { token: 'type', foreground: '008080' },
            { token: 'delimiter', foreground: '000000' },
            { token: 'string', foreground: 'A31515' },
            { token: 'keyword', foreground: '0000FF' },
        ],
    },
    dark: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        rules: [
            { token: 'variable', foreground: '74B0DF' },
            { token: 'comment', foreground: '608B4E' },
            { token: 'number', foreground: 'B5CEA8' },
            { token: 'type', foreground: '3DC9B0' },
            { token: 'delimiter', foreground: 'DCDCDC' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'keyword', foreground: '569CD6' },
        ],
    },
};

export function resolvePreviewBase(
    presetId: string | undefined,
    appearance: SqlStyleAppearance,
): PreviewBase {
    const builtin = BUILTIN_PREVIEW_BASE[appearance];
    const preset = presetId ? getThemePreset(presetId) : undefined;
    const hasTokens = preset ? Object.keys(preset.tokens).length > 0 : false;
    const theme = preset
        ? (preset.monaco.custom ??
          (hasTokens ? buildMonacoCustomTheme(preset.tokens, preset.appearance) : undefined))
        : undefined;
    if (!theme) return builtin;
    return {
        background: theme.colors['editor.background'] ?? builtin.background,
        foreground: theme.colors['editor.foreground'] ?? builtin.foreground,
        rules: [...builtin.rules, ...theme.rules],
    };
}

interface ResolvedStyle {
    foreground?: string;
    fontStyle?: string;
}

class ThemeTrie {
    private readonly children = new Map<string, ThemeTrie>();
    constructor(
        private foreground?: string,
        private fontStyle?: string,
    ) {}

    insert(token: string, foreground?: string, fontStyle?: string): void {
        if (token === '') {
            if (foreground !== undefined) this.foreground = foreground;
            if (fontStyle !== undefined) this.fontStyle = fontStyle;
            return;
        }
        const dot = token.indexOf('.');
        const head = dot === -1 ? token : token.slice(0, dot);
        const tail = dot === -1 ? '' : token.slice(dot + 1);
        let child = this.children.get(head);
        if (!child) {
            child = new ThemeTrie(this.foreground, this.fontStyle);
            this.children.set(head, child);
        }
        child.insert(tail, foreground, fontStyle);
    }

    match(token: string): ResolvedStyle {
        if (token !== '') {
            const dot = token.indexOf('.');
            const child = this.children.get(dot === -1 ? token : token.slice(0, dot));
            if (child) return child.match(dot === -1 ? '' : token.slice(dot + 1));
        }
        return { foreground: this.foreground, fontStyle: this.fontStyle };
    }
}

/**
 * Resolves a token name against theme rules the way Monaco's token theme does:
 * a trie keyed by the dot-separated name, rules applied in sorted order, a
 * child inheriting what its parent had when it was created, and `fontStyle`
 * replacing (not merging with) the inherited one.
 */
export function resolveThemeStyle(rules: MonacoThemeRule[], token: string): ResolvedStyle {
    const root = new ThemeTrie();
    rules
        .map((rule, index) => ({ rule, index }))
        .sort((a, b) =>
            a.rule.token < b.rule.token ? -1 : a.rule.token > b.rule.token ? 1 : a.index - b.index,
        )
        .forEach(({ rule }) => root.insert(rule.token, rule.foreground, rule.fontStyle));
    return root.match(token);
}

export interface PreviewTokenStyle {
    color: string;
    fontWeight: number;
    fontStyle: 'normal' | 'italic';
}

const WEIGHT_VALUE = { normal: 400, semibold: 600, bold: 700 } as const;

/**
 * How a token category is drawn in the editor: the theme's colour and style,
 * and, where the user has an entry for the category, that entry in full (the
 * editor writes an explicit font style for it). Schema names are drawn by
 * decorations over identifiers, so without schema highlighting they look like
 * any other identifier.
 */
export function resolvePreviewStyle(
    categoryId: string,
    base: PreviewBase,
    overrides: SqlStyleMap,
    appearance: SqlStyleAppearance,
    schemaHighlight: boolean,
): PreviewTokenStyle {
    const category = SQL_STYLE_CATEGORIES.find(candidate => candidate.id === categoryId);
    if (!category) return { color: base.foreground, fontWeight: 400, fontStyle: 'normal' };

    if (category.schema) {
        if (!schemaHighlight) {
            return resolvePreviewStyle('identifier', base, overrides, appearance, false);
        }
        const entry = overrides[categoryId];
        return {
            color: entry?.color || schemaDefaultColor(categoryId, appearance),
            fontWeight: WEIGHT_VALUE[entry?.weight ?? 'normal'],
            fontStyle: entry?.italic ? 'italic' : 'normal',
        };
    }

    const themed = resolveThemeStyle(base.rules, category.tokens[0]);
    const themeBold = themed.fontStyle?.includes('bold') ?? false;
    const themeItalic = themed.fontStyle?.includes('italic') ?? false;
    const entry = overrides[categoryId];
    return {
        color:
            entry?.color ||
            (themed.foreground ? `#${themed.foreground.toLowerCase()}` : base.foreground),
        fontWeight: entry ? WEIGHT_VALUE[entry.weight] : themeBold ? 700 : 400,
        fontStyle: (entry ? entry.italic : themeItalic) ? 'italic' : 'normal',
    };
}

export interface PreviewToken {
    text: string;
    /**
     * A category id from SQL_STYLE_CATEGORIES. Grammar categories must match
     * how the real tokenizer classifies the text (a test checks this against
     * Monaco); schema categories (table, column, alias) sit on identifiers.
     */
    category?: string;
}

// Each line is written as text or [text, category] pairs so the sample stays readable.
const line = (...parts: (string | [string, string])[]): PreviewToken[] =>
    parts.map(part =>
        typeof part === 'string' ? { text: part } : { text: part[0], category: part[1] },
    );

/** One realistic query that touches every category. */
export const SQL_PREVIEW_LINES: readonly (readonly PreviewToken[])[] = [
    line(['-- Best customers per country', 'comment']),
    line(['WITH', 'keyword'], ' ', ['top_orders', 'alias'], ' ', ['AS', 'keyword'], ' ', [
        '(',
        'bracket',
    ]),
    line(
        '  ',
        ['SELECT', 'keyword'],
        ' ',
        ['o', 'alias'],
        ['.', 'delimiter'],
        ['customer_id', 'column'],
        [',', 'delimiter'],
        ' ',
        ['SUM', 'function'],
        ['(', 'bracket'],
        ['o', 'alias'],
        ['.', 'delimiter'],
        ['freight', 'column'],
        [')', 'bracket'],
        ' ',
        ['AS', 'keyword'],
        ' ',
        ['total', 'identifier'],
    ),
    line('  ', ['FROM', 'keyword'], ' ', ['orders', 'table'], ' ', ['o', 'alias']),
    line(
        '  ',
        ['WHERE', 'keyword'],
        ' ',
        ['o', 'alias'],
        ['.', 'delimiter'],
        ['ship_country', 'column'],
        ' ',
        ['=', 'operator'],
        ' ',
        ["'Germany'", 'string'],
        ' ',
        ['AND', 'operator'],
        ' ',
        ['o', 'alias'],
        ['.', 'delimiter'],
        ['freight', 'column'],
        ' ',
        ['>', 'operator'],
        ' ',
        ['10.5', 'number'],
    ),
    line(
        '    ',
        ['AND', 'operator'],
        ' ',
        ['o', 'alias'],
        ['.', 'delimiter'],
        ['employee_id', 'column'],
        ' ',
        ['=', 'operator'],
        ' ',
        ['@emp_id', 'variable'],
    ),
    line(
        '  ',
        ['GROUP', 'keyword'],
        ' ',
        ['BY', 'keyword'],
        ' ',
        ['o', 'alias'],
        ['.', 'delimiter'],
        ['customer_id', 'column'],
    ),
    line([')', 'bracket']),
    line(
        ['SELECT', 'keyword'],
        ' ',
        ['[Company Name]', 'quotedIdentifier'],
        [',', 'delimiter'],
        ' ',
        ['CAST', 'function'],
        ['(', 'bracket'],
        ['total', 'identifier'],
        ' ',
        ['AS', 'keyword'],
        ' ',
        ['DECIMAL', 'type'],
        ['(', 'bracket'],
        ['10', 'number'],
        [',', 'delimiter'],
        ' ',
        ['2', 'number'],
        [')', 'bracket'],
        [')', 'bracket'],
    ),
    line(
        ['FROM', 'keyword'],
        ' ',
        ['top_orders', 'alias'],
        ' ',
        ['JOIN', 'keyword'],
        ' ',
        ['customers', 'table'],
        ' ',
        ['c', 'alias'],
        ' ',
        ['ON', 'keyword'],
        ' ',
        ['c', 'alias'],
        ['.', 'delimiter'],
        ['customer_id', 'column'],
        ' ',
        ['=', 'operator'],
        ' ',
        ['top_orders', 'alias'],
        ['.', 'delimiter'],
        ['customer_id', 'column'],
        [';', 'delimiter'],
    ),
];
