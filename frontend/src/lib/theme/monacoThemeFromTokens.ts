// SPDX-License-Identifier: GPL-3.0-only

import type { MonacoCustomTheme, MonacoThemeRule, ThemeToken } from './themePresetTypes';

type TokenMap = Partial<Record<ThemeToken, string>>;

// Monaco editor colors are CSS color strings; token-rule foregrounds are bare
// hex (matching the existing Solarized rules). CSS `var()`/`color-mix()` can't
// resolve inside Monaco's canvas renderer, so only literal colors are usable.
function literal(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.includes('color-mix') || value.includes('var(')) return undefined;
    return value;
}

function bareHex(value: string | undefined): string | undefined {
    return literal(value)?.replace(/^#/, '');
}

/**
 * Builds a Monaco editor theme from a preset's seed tokens so a palette-only
 * theme can omit `monaco.custom`. SQL syntax rules and editor chrome colors
 * derive from the same tokens the CSS layer consumes; non-literal values
 * (`color-mix()`/`var()`) fall back to a literal surface token.
 */
export function buildMonacoCustomTheme(
    tokens: TokenMap,
    appearance: 'light' | 'dark',
): MonacoCustomTheme {
    const color = (primary: ThemeToken, fallback?: ThemeToken): string | undefined =>
        literal(tokens[primary]) ?? (fallback ? literal(tokens[fallback]) : undefined);

    const colors: Record<string, string> = {};
    const setColor = (name: string, value: string | undefined) => {
        if (value) colors[name] = value;
    };

    setColor('editor.background', color('--surface-app'));
    setColor('editor.foreground', color('--content-primary'));
    setColor('editor.selectionBackground', color('--state-selected-bg', '--surface-elevated'));
    setColor('editor.lineHighlightBackground', color('--state-hover-bg', '--surface-panel'));
    setColor('editorLineNumber.foreground', color('--content-muted'));
    setColor(
        'editorLineNumber.activeForeground',
        color('--content-emphasized', '--content-primary'),
    );
    setColor('editorCursor.foreground', color('--content-primary'));
    setColor('editorIndentGuide.background', color('--surface-elevated'));

    const rules: MonacoThemeRule[] = [];
    const rule = (token: string, value: string | undefined, fontStyle?: string) => {
        const hex = bareHex(value);
        if (hex) rules.push({ token, foreground: hex, ...(fontStyle ? { fontStyle } : {}) });
    };

    rule('keyword', tokens['--syntax-key']);
    rule('operator', tokens['--syntax-key']);
    rule('string', tokens['--syntax-string']);
    rule('number', tokens['--syntax-number']);
    rule('boolean', tokens['--syntax-boolean']);
    rule('comment', tokens['--content-muted'], 'italic');
    rule('identifier', tokens['--content-primary']);
    rule('predefined', tokens['--user-accent']);

    return {
        base: appearance === 'dark' ? 'vs-dark' : 'vs',
        inherit: true,
        rules,
        colors,
    };
}
