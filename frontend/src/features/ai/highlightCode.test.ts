// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const colorize = vi.fn(
    async (code: string, language: string) => `<span data-lang="${language}">${code}</span>`,
);
const setTheme = vi.fn();
const setMonarchTokensProvider = vi.fn();
const init = vi.fn(async () => ({
    editor: { colorize, setTheme },
    languages: { setMonarchTokensProvider },
}));

vi.mock('@monaco-editor/react', () => ({ loader: { init: () => init() } }));

import { highlightCode, normalizeLanguage } from './highlightCode';

describe('highlightCode', () => {
    beforeEach(() => {
        colorize.mockClear();
        setTheme.mockClear();
        init.mockClear();
    });
    afterEach(() => vi.restoreAllMocks());

    it('maps fence names onto the languages the editor knows', () => {
        expect(normalizeLanguage('SQL')).toBe('sql');
        expect(normalizeLanguage('postgres')).toBe('sql');
        expect(normalizeLanguage('sh')).toBe('shell');
        expect(normalizeLanguage('ruby')).toBe('');
    });

    it('colors SQL with the editor tokenizer under the active app theme', async () => {
        const html = await highlightCode('SELECT 1', 'sql', 'zentro-dark-2026');

        expect(html).toBe('<span data-lang="sql">SELECT 1</span>');
        expect(setMonarchTokensProvider).toHaveBeenCalledWith('sql', expect.anything());
        expect(setTheme).toHaveBeenCalledWith('zentro-dark-2026');
        expect(colorize).toHaveBeenCalledWith('SELECT 1', 'sql', { tabSize: 4 });
    });

    it('does not touch Monaco for a language it does not color', async () => {
        expect(await highlightCode('puts 1', 'ruby', 'vs')).toBeNull();
        expect(init).not.toHaveBeenCalled();
    });

    it('falls back to plain text when Monaco cannot load', async () => {
        init.mockRejectedValueOnce(new Error('offline'));
        expect(await highlightCode('SELECT 1', 'sql', 'vs')).toBeNull();
    });
});
