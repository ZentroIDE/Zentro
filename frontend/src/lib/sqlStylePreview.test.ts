// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { resolvePreviewBase, resolvePreviewStyle, SQL_PREVIEW_LINES } from './sqlStylePreview';
import { SQL_STYLE_CATEGORIES } from './sqlEditorStyle';

const base = resolvePreviewBase(undefined, 'light');

describe('resolvePreviewBase', () => {
    it('falls back to neutral colours for an unknown preset', () => {
        expect(resolvePreviewBase('nope', 'dark').background).toBe('#1e1e1e');
        expect(resolvePreviewBase(undefined, 'light').background).toBe('#fffffe');
    });
});

describe('resolvePreviewStyle', () => {
    it('uses the theme colour when nothing is overridden', () => {
        expect(resolvePreviewStyle('keyword', base, {}, 'light', false)).toEqual({
            color: '#0000ff',
            fontWeight: 400,
            fontStyle: 'normal',
        });
    });

    it('falls back to the editor foreground for a token the theme does not colour', () => {
        expect(resolvePreviewStyle('bracket', base, {}, 'light', false).color).toBe(
            base.foreground,
        );
    });

    it('applies colour, weight and italic overrides', () => {
        const style = resolvePreviewStyle(
            'keyword',
            base,
            { keyword: { color: '#c5221f', weight: 'bold', italic: true } },
            'light',
            false,
        );
        expect(style).toEqual({ color: '#c5221f', fontWeight: 700, fontStyle: 'italic' });
    });

    it('keeps the theme colour when only the weight is overridden', () => {
        const style = resolvePreviewStyle(
            'string',
            base,
            { string: { color: '', weight: 'bold', italic: false } },
            'light',
            false,
        );
        expect(style.color).toBe('#a31515');
        expect(style.fontWeight).toBe(700);
    });

    it('draws schema names plainly until schema highlighting is on', () => {
        expect(resolvePreviewStyle('table', base, {}, 'light', false).color).toBe(base.foreground);
        expect(resolvePreviewStyle('table', base, {}, 'light', true).color).toBe('#267f99');
    });

    it('supports semi-bold for schema names', () => {
        const style = resolvePreviewStyle(
            'table',
            base,
            { table: { color: '', weight: 'semibold', italic: false } },
            'light',
            true,
        );
        expect(style.fontWeight).toBe(600);
    });
});

describe('SQL_PREVIEW_LINES', () => {
    it('only references known categories and covers every one', () => {
        const known = new Set(SQL_STYLE_CATEGORIES.map(category => category.id));
        const used = new Set(
            SQL_PREVIEW_LINES.flat()
                .map(token => token.category)
                .filter((id): id is string => Boolean(id)),
        );
        used.forEach(id => expect(known.has(id)).toBe(true));
        known.forEach(id => expect(used.has(id)).toBe(true));
    });
});
