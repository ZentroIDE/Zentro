// SPDX-License-Identifier: GPL-3.0-only

import { isIdentifierLike, tokenizeSql } from './sqlCompletionTokenizer';
import { normalizeIdentifier, stripIdentifierQuotes } from './sqlCompletionIdentifiers';
import { SqlToken } from './sqlCompletionTypes';

// SELECT [ALL|DISTINCT] [TOP n | TOP (n)] [PERCENT] [WITH TIES] — the leading
// modifiers are not part of the first projected item.
const SELECT_MODIFIERS =
    /^(?:(?:distinct|all)\s+)?(?:top\s*(?:\(\s*[^)]*\)|[\w@]+)(?:\s+percent)?(?:\s+with\s+ties)?\s+)?/i;

const PROJECTION_END_WORDS = new Set(['from', 'union', 'intersect', 'except', 'into']);

/**
 * Index of the first top-level (outside parens, strings, quoted identifiers
 * and comments) keyword from `words`, or -1.
 */
function findTopLevelWordIndex(text: string, words: Set<string>): number {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '-' && next === '-') {
            while (i < text.length && text[i] !== '\n') i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? text.length : end + 1;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
            const close = ch === '[' ? ']' : ch;
            i++;
            while (i < text.length && text[i] !== close) i++;
            continue;
        }
        if (ch === '(') {
            depth++;
            continue;
        }
        if (ch === ')') {
            if (depth === 0) return -1;
            depth--;
            continue;
        }
        if (depth !== 0 || !/[A-Za-z]/.test(ch) || (i > 0 && /[\w$@#]/.test(text[i - 1]))) continue;
        let end = i + 1;
        while (end < text.length && /[\w$]/.test(text[end])) end++;
        if (words.has(text.slice(i, end).toLowerCase())) return i;
        i = end - 1;
    }
    return -1;
}

/** Output column names of the projection that follows `select` in `body`. */
function projectionNames(body: string): string[] {
    const trimmed = body.trim().replace(SELECT_MODIFIERS, '');
    const end = findTopLevelWordIndex(trimmed, PROJECTION_END_WORDS);
    const projection = end === -1 ? trimmed : trimmed.slice(0, end);
    const result: string[] = [];
    splitTopLevelItems(projection).forEach(item => {
        const inferred = inferProjectionName(item);
        if (inferred) result.push(inferred);
    });
    return result;
}

export function extractProjectedColumns(bodyText: string): string[] {
    const selectMatch = bodyText.trim().match(/^select\s+([\s\S]+)$/i);
    return selectMatch ? projectionNames(selectMatch[1]) : [];
}

/**
 * Output names of the SELECT that encloses the cursor (for ORDER BY / GROUP BY,
 * where a select-list alias is a valid reference). `spanText` is the whole
 * statement, so the projection is found even though it precedes the cursor.
 */
export function extractOutputColumnsAtCursor(
    spanText: string,
    cursorInSpan: number,
    cursorDepth: number,
): string[] {
    const { tokens } = tokenizeSql(spanText);
    let selectIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.start >= cursorInSpan) break;
        if (token.depth === cursorDepth && normalizeIdentifier(token.value) === 'select') {
            selectIndex = i;
        }
    }
    if (selectIndex === -1) return [];
    return projectionNames(spanText.slice(tokens[selectIndex].end));
}

function splitTopLevelItems(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inSingle = false;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (inSingle) {
            if (ch === "'" && next === "'") {
                i++;
                continue;
            }
            if (ch === "'") inSingle = false;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')' && depth > 0) depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    const tail = text.slice(start).trim();
    if (tail) parts.push(tail);
    return parts;
}

function inferProjectionName(item: string): string | null {
    const asMatch = item.match(/\bas\s+([A-Za-z_][\w$]*|"[^"]+"|`[^`]+`|\[[^\]]+\])\s*$/i);
    if (asMatch) return stripIdentifierQuotes(asMatch[1]);
    const bareAliasMatch = item.match(/([A-Za-z_][\w$]*|"[^"]+"|`[^`]+`|\[[^\]]+\])\s*$/);
    if (!bareAliasMatch) return null;
    const candidate = bareAliasMatch[1];
    if (item.includes('.') && candidate === item.split('.').slice(-1)[0].trim())
        return stripIdentifierQuotes(candidate);
    if (isIdentifierLike(candidate)) {
        // A trailing identifier is the alias unless the text before it is an
        // unfinished expression (`a +`, `f(x,`), where it is an operand.
        const prefix = item.slice(0, item.lastIndexOf(candidate)).trimEnd();
        if (!prefix || !/[+\-*/%(,|&^~<>=!:]$/.test(prefix))
            return stripIdentifierQuotes(candidate);
    }
    return null;
}

export function findMatchingParenFrom(text: string, openIndex: number): number {
    let depth = 0;
    let inSingle = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = openIndex; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inSingle) {
            if (ch === "'" && next === "'") {
                i++;
                continue;
            }
            if (ch === "'") inSingle = false;
            continue;
        }
        if (ch === '-' && next === '-') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return text.length;
}

export function findTokenIndexAfterOffset(tokens: SqlToken[], offset: number): number {
    return tokens.findIndex(token => token.start >= offset);
}

export function hasIdentifierToken(tokens: SqlToken[], value: string): boolean {
    const norm = normalizeIdentifier(value);
    return tokens.some(token => normalizeIdentifier(token.value) === norm);
}
