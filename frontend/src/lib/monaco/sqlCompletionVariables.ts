// SPDX-License-Identifier: GPL-3.0-only

// T-SQL @variables and #temp tables are not part of the schema catalog, so they
// are offered from what the script itself already mentions.

const SYSTEM_VARIABLES = [
    '@@ROWCOUNT',
    '@@IDENTITY',
    '@@ERROR',
    '@@TRANCOUNT',
    '@@VERSION',
    '@@SERVERNAME',
    '@@FETCH_STATUS',
    '@@SPID',
];

export type SqlSigil = '@' | '#';

/** '@' or '#' when the word being typed starts with one, else null. */
export function sigilOf(currentWord: string): SqlSigil | null {
    return currentWord.startsWith('@') ? '@' : currentWord.startsWith('#') ? '#' : null;
}

/**
 * Distinct `@name` (or `#name`) tokens in `text`, in first-seen order, with the
 * word under the cursor removed so it never suggests itself.
 */
export function collectSigilNames(
    text: string,
    sigil: SqlSigil,
    cursorOffset: number,
    currentWord: string,
): string[] {
    const withoutCurrent =
        text.slice(0, Math.max(0, cursorOffset - currentWord.length)) + text.slice(cursorOffset);
    const pattern = sigil === '@' ? /@{1,2}[A-Za-z_][\w$@#]*/g : /#{1,2}[A-Za-z_][\w$]*/g;
    const seen = new Map<string, string>();
    for (const match of withoutCurrent.matchAll(pattern)) {
        const key = match[0].toLowerCase();
        if (!seen.has(key)) seen.set(key, match[0]);
    }
    const names = [...seen.values()];
    if (sigil === '@') {
        for (const system of SYSTEM_VARIABLES) {
            if (!seen.has(system.toLowerCase())) names.push(system);
        }
    }
    return names;
}
