// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

// Monaco injects `.mtkN { color: ... }` (a single class) after our stylesheet
// and paints every token with it. Decoration classes that only set a plain
// `color` lose that fight, which is how schema-name colours once failed to show.
// Read through Node's fs (the bundler hands back an empty string for CSS); vitest
// runs from the frontend folder.
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync: (path: string, encoding: 'utf8') => string;
};
const css = readFileSync('src/index.css', 'utf8');

describe('SQL decoration classes beat Monaco token colours', () => {
    for (const name of ['table', 'column', 'alias']) {
        it(`.zentro-sql-${name} is scoped to the editor and important`, () => {
            const rule = new RegExp(
                String.raw`\.monaco-editor \.zentro-sql-${name}\s*\{([^}]*)\}`,
            ).exec(css);
            expect(rule).not.toBeNull();
            const body = rule?.[1] ?? '';
            expect(body).toMatch(
                new RegExp(String.raw`color:\s*var\(--zentro-sql-${name}-color\)\s*!important`),
            );
            expect(body).toMatch(/font-weight:[^;]*!important/);
            expect(body).toMatch(/font-style:[^;]*!important/);
        });
    }

    it('the semi-bold trim is important too, or Monaco’s .mtkb bold would win', () => {
        expect(css).toMatch(
            /\.monaco-editor \.zentro-sql-semibold\s*\{[^}]*font-weight:\s*600 !important/,
        );
    });
});
