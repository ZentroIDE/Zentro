// SPDX-License-Identifier: GPL-3.0-only

import { loader } from '@monaco-editor/react';
import { installSqlTokenizer } from '../../lib/monaco/sqlLanguage';

// Languages the chat colors. Everything else stays plain text.
const LANGUAGES = new Set([
    'sql',
    'json',
    'shell',
    'python',
    'javascript',
    'typescript',
    'yaml',
    'go',
]);

const ALIASES: Record<string, string> = {
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    yml: 'yaml',
    golang: 'go',
    jsonc: 'json',
    // Every SQL dialect goes through Zentro's own SQL tokenizer.
    psql: 'sql',
    pgsql: 'sql',
    postgres: 'sql',
    postgresql: 'sql',
    mysql: 'sql',
    tsql: 'sql',
    mssql: 'sql',
    sqlite: 'sql',
};

export function normalizeLanguage(lang: string): string {
    const value = lang.trim().toLowerCase();
    const mapped = ALIASES[value] ?? value;
    return LANGUAGES.has(mapped) ? mapped : '';
}

// highlightCode colors code with the editor's own tokenizer and the active app
// theme, so a block in the chat matches the SQL editor and follows the user's
// SQL colors. It returns Monaco's markup (token spans, Monaco escapes the
// text), or null when the language is unknown or Monaco is not available.
//
// The markup refers to theme colors by class, so it must be made again when the
// theme or the SQL color settings change. It is not cached for that reason.
export async function highlightCode(
    code: string,
    lang: string,
    themeId: string,
): Promise<string | null> {
    const language = normalizeLanguage(lang);
    if (!language) return null;
    try {
        const monaco = await loader.init();
        // Let a theme redefinition that is already queued finish first.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        if (language === 'sql') installSqlTokenizer(monaco);
        monaco.editor.setTheme(themeId);
        return await monaco.editor.colorize(code, language, { tabSize: 4 });
    } catch {
        return null;
    }
}
