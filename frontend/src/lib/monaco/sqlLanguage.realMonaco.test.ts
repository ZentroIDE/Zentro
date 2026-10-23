// SPDX-License-Identifier: GPL-3.0-only

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { beforeAll, describe, expect, it } from 'vitest';
// Internal, but the only way to read the colour a token really gets from the theme.
import { TokenizationRegistry } from 'monaco-editor/esm/vs/editor/common/languages';
import { installSqlTokenizer } from './sqlLanguage';
import { buildAppMonacoThemes } from '../../app/useThemeManager';
import { registerBuiltInThemePresets } from '../theme/builtIn';
import { getThemePresets } from '../theme/themePresetRegistry';
import {
    buildSqlStyleRules,
    categoryForTokenType,
    SQL_STYLE_CATEGORIES,
    type SqlEditorStyle,
    type SqlStyleAppearance,
} from '../sqlEditorStyle';
import {
    BUILTIN_PREVIEW_BASE,
    type PreviewBase,
    resolvePreviewBase,
    resolvePreviewStyle,
    SQL_PREVIEW_LINES,
} from '../sqlStylePreview';

// These run against Monaco itself, because the whole point is to prove that what
// the settings preview draws is what the editor draws: the grammar classifies
// the sample the way its labels say, and the colour and font style the real
// token theme produces equal what the preview computes.

interface RealToken {
    start: number;
    end: number;
    type: string;
}

function tokenize(text: string): RealToken[][] {
    const lines = text.split('\n');
    return monaco.editor.tokenize(text, 'sql').map((lineTokens, lineIndex) =>
        lineTokens.map((token, index) => ({
            start: token.offset,
            end: lineTokens[index + 1]?.offset ?? lines[lineIndex].length,
            type: token.type,
        })),
    );
}

const sampleLines = SQL_PREVIEW_LINES.map(tokens => tokens.map(token => token.text).join(''));
const sampleText = sampleLines.join('\n');

beforeAll(() => {
    (window as unknown as { matchMedia?: unknown }).matchMedia ??= () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
    });
    monaco.languages.register({ id: 'sql' });
    installSqlTokenizer(monaco as never);
    registerBuiltInThemePresets();
});

describe('the SQL grammar classifies the preview sample as its labels say', () => {
    it('agrees on every labelled token', () => {
        const real = tokenize(sampleText);
        const problems: string[] = [];
        SQL_PREVIEW_LINES.forEach((tokens, lineIndex) => {
            let offset = 0;
            for (const token of tokens) {
                const start = offset;
                offset += token.text.length;
                if (!token.category) continue;
                const found = real[lineIndex].find(
                    candidate => candidate.start <= start && start < candidate.end,
                );
                const category = SQL_STYLE_CATEGORIES.find(c => c.id === token.category);
                const expected = category?.schema ? 'identifier' : token.category;
                const actual = found ? categoryForTokenType(found.type)?.id : undefined;
                if (actual !== expected) {
                    problems.push(
                        `line ${lineIndex + 1} ${JSON.stringify(token.text)}: label ${token.category} → expected ${expected}, grammar says ${found?.type}`,
                    );
                }
            }
        });
        expect(problems).toEqual([]);
    });

    it('uses every grammar category at least once in the sample', () => {
        const used = new Set(
            SQL_PREVIEW_LINES.flat()
                .map(token => token.category)
                .filter((id): id is string => Boolean(id)),
        );
        SQL_STYLE_CATEGORIES.forEach(category => expect(used.has(category.id)).toBe(true));
    });
});

describe('the SQL grammar', () => {
    const types = (sql: string) =>
        tokenize(sql)[0]
            .filter(token => token.type !== 'white.zsql')
            .map(token => [sql.slice(token.start, token.end), token.type]);

    it('treats JOIN as a keyword and DECIMAL as a type', () => {
        expect(types('a JOIN b')).toEqual([
            ['a', 'identifier.zsql'],
            ['JOIN', 'keyword.zsql'],
            ['b', 'identifier.zsql'],
        ]);
        expect(types('DECIMAL(10)')[0]).toEqual(['DECIMAL', 'type.zsql']);
    });

    it('keeps a quoted identifier as one token, delimiters included', () => {
        expect(types('[Company Name]')).toEqual([['[Company Name]', 'identifier.quote.zsql']]);
        expect(types('"a b"')).toEqual([['"a b"', 'identifier.quote.zsql']]);
        expect(types('`a b`')).toEqual([['`a b`', 'identifier.quote.zsql']]);
    });

    it('recognises variables, parameters and casts', () => {
        expect(types('@id')[0][1]).toBe('variable.zsql');
        expect(types('@@ROWCOUNT')[0][1]).toBe('variable.zsql');
        expect(types(':name')[0][1]).toBe('variable.zsql');
        expect(types('$1')[0][1]).toBe('variable.zsql');
        expect(types('x::int')).toEqual([
            ['x', 'identifier.zsql'],
            ['::', 'operator.zsql'],
            ['int', 'type.zsql'],
        ]);
    });

    it('only calls a name a function when it is one and is called', () => {
        expect(types('count(*)')[0][1]).toBe('predefined.zsql');
        expect(types('count')[0][1]).toBe('identifier.zsql');
        expect(types('date')[0][1]).toBe('identifier.zsql');
    });

    it('treats word operators as operators and other words as keywords', () => {
        expect(types('a AND b OR NOT c').map(([, type]) => type)).toEqual([
            'identifier.zsql',
            'operator.zsql',
            'identifier.zsql',
            'operator.zsql',
            'operator.zsql',
            'identifier.zsql',
        ]);
    });

    it('keeps strings and comments whole across escapes and lines', () => {
        expect(types("'it''s'")).toEqual([["'it''s'", 'string.zsql']]);
        expect(types("N'x'")).toEqual([["N'x'", 'string.zsql']]);
        const lines = tokenize('/* a\nb */ select');
        expect(lines[0][0].type).toBe('comment.zsql');
        expect(lines[1][0].type).toBe('comment.zsql');
    });

    it('does not use any .sql token, so Monaco’s SQL-specific theme rules never apply', () => {
        tokenize(sampleText)
            .flat()
            .forEach(token => expect(token.type.endsWith('.zsql')).toBe(true));
    });
});

// --- colours ---------------------------------------------------------------

const FONT_ITALIC = 1;
const FONT_BOLD = 2;

interface RealStyle {
    color: string;
    bold: boolean;
    italic: boolean;
}

/** The colour and font style Monaco's token theme really gives each token of the sample. */
function realStyles(): RealStyle[][] {
    const registry = TokenizationRegistry as unknown as {
        get: (id: string) => {
            getInitialState: () => unknown;
            tokenizeEncoded: (
                line: string,
                hasEOL: boolean,
                state: unknown,
            ) => { tokens: Uint32Array; endState: unknown };
        };
        getColorMap: () => { toString: () => string }[];
    };
    const support = registry.get('sql');
    const colorMap = registry.getColorMap();
    let state = support.getInitialState();
    return sampleLines.map(lineText => {
        const result = support.tokenizeEncoded(lineText, true, state);
        state = result.endState;
        const styles: RealStyle[] = [];
        for (let i = 0; i < lineText.length; i++)
            styles.push({ color: '', bold: false, italic: false });
        const tokens = result.tokens;
        for (let t = 0; t < tokens.length; t += 2) {
            const start = tokens[t];
            const end = t + 2 < tokens.length ? tokens[t + 2] : lineText.length;
            const metadata = tokens[t + 1];
            const style = {
                color: String(colorMap[(metadata & 0x00ff8000) >>> 15]).toLowerCase(),
                italic: (((metadata & 0x00007800) >>> 11) & FONT_ITALIC) !== 0,
                bold: (((metadata & 0x00007800) >>> 11) & FONT_BOLD) !== 0,
            };
            for (let i = start; i < end; i++) styles[i] = style;
        }
        return styles;
    });
}

function expectPreviewToMatchEditor(
    theme: { id: string; data: monaco.editor.IStandaloneThemeData },
    base: PreviewBase,
    appearance: SqlStyleAppearance,
    style: SqlEditorStyle,
) {
    monaco.editor.defineTheme('parity-test', theme.data);
    monaco.editor.setTheme('parity-test');
    const real = realStyles();
    const problems: string[] = [];

    SQL_PREVIEW_LINES.forEach((tokens, lineIndex) => {
        let offset = 0;
        for (const token of tokens) {
            const start = offset;
            offset += token.text.length;
            if (!token.category) continue;
            const category = SQL_STYLE_CATEGORIES.find(c => c.id === token.category);
            if (category?.schema) continue; // drawn by decorations, not the theme
            const expected = resolvePreviewStyle(
                token.category,
                base,
                style[appearance],
                appearance,
                false,
            );
            const actual = real[lineIndex][start];
            const expectedColor = expected.color.toLowerCase();
            const expectedBold = expected.fontWeight >= 600;
            const expectedItalic = expected.fontStyle === 'italic';
            if (
                actual.color !== expectedColor ||
                actual.bold !== expectedBold ||
                actual.italic !== expectedItalic
            ) {
                problems.push(
                    `${theme.id} line ${lineIndex + 1} ${JSON.stringify(token.text)} (${token.category}): preview ${expectedColor} b=${expectedBold} i=${expectedItalic}, editor ${actual.color} b=${actual.bold} i=${actual.italic}`,
                );
            }
        }
    });
    expect(problems).toEqual([]);
}

/** Every theme the app really defines, each with the base the settings preview would use for it. */
function appThemes(style: SqlEditorStyle) {
    const presets = getThemePresets();
    return buildAppMonacoThemes(style).map(theme => {
        const preset = presets.find(candidate => candidate.monaco.id === theme.id);
        const appearance: SqlStyleAppearance =
            preset?.appearance ?? (theme.data.base === 'vs-dark' ? 'dark' : 'light');
        return { theme, appearance, base: resolvePreviewBase(preset?.id, appearance) };
    });
}

const NO_OVERRIDES: SqlEditorStyle = { light: {}, dark: {}, schemaHighlight: false };

const OVERRIDES: SqlEditorStyle = {
    light: {
        keyword: { color: '#c5221f', weight: 'bold', italic: true },
        string: { color: '#188038', weight: 'normal', italic: false },
        operator: { color: '', weight: 'bold', italic: false },
        identifier: { color: '#8430ce', weight: 'normal', italic: true },
        comment: { color: '', weight: 'normal', italic: false },
    },
    dark: {
        function: { color: '#fdd663', weight: 'semibold', italic: false },
        comment: { color: '', weight: 'normal', italic: false },
        bracket: { color: '#78d9ec', weight: 'bold', italic: false },
        variable: { color: '#c58af9', weight: 'normal', italic: true },
    },
    schemaHighlight: false,
};

describe('preview colours equal the editor’s real colours', () => {
    it('for Monaco’s plain vs and vs-dark themes', () => {
        for (const appearance of ['light', 'dark'] as const) {
            for (const style of [NO_OVERRIDES, OVERRIDES]) {
                expectPreviewToMatchEditor(
                    {
                        id: appearance,
                        data: {
                            base: appearance === 'dark' ? 'vs-dark' : 'vs',
                            inherit: true,
                            rules: buildSqlStyleRules(style, appearance),
                            colors: {},
                        },
                    },
                    resolvePreviewBase(undefined, appearance),
                    appearance,
                    style,
                );
            }
        }
    });

    it('for every theme the app defines, with and without the user’s overrides', () => {
        for (const style of [NO_OVERRIDES, OVERRIDES]) {
            const themes = appThemes(style);
            expect(themes.length).toBeGreaterThanOrEqual(4);
            for (const { theme, appearance, base } of themes) {
                expectPreviewToMatchEditor(theme, base, appearance, style);
            }
        }
    });

    it('keeps the 2026 presets’ own colours instead of replacing them with plain vs / vs-dark', () => {
        const ids = buildAppMonacoThemes(NO_OVERRIDES).map(theme => theme.id);
        expect(ids.filter(id => id === 'vs')).toHaveLength(1);
        expect(ids.filter(id => id === 'vs-dark')).toHaveLength(1);
        const light = buildAppMonacoThemes(NO_OVERRIDES).find(theme => theme.id === 'vs');
        expect(light?.data.rules.some(rule => rule.token === 'keyword')).toBe(true);
    });

    it('checks the built-in rules the preview assumes against Monaco’s own', async () => {
        const { vs, vs_dark } =
            (await import('monaco-editor/esm/vs/editor/standalone/common/themes')) as {
                vs: { rules: { token: string; foreground?: string }[] };
                vs_dark: { rules: { token: string; foreground?: string }[] };
            };
        for (const [appearance, theme] of [
            ['light', vs],
            ['dark', vs_dark],
        ] as const) {
            for (const rule of BUILTIN_PREVIEW_BASE[appearance].rules) {
                const real = theme.rules.find(candidate => candidate.token === rule.token);
                expect(real?.foreground?.toLowerCase()).toBe(rule.foreground?.toLowerCase());
            }
        }
    });
});
