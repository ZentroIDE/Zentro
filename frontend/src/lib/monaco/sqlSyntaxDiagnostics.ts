// SPDX-License-Identifier: GPL-3.0-only

import type { RangeWarning } from './editorSchemaWarningDecorations';

// Cheap, connection-free checks that catch typos while typing. Everything here
// is deliberately conservative: a false positive on valid SQL is worse than a
// missed diagnostic, so a check only fires on shapes that are wrong in every
// dialect (or, for the `= NULL` and no-WHERE warnings, almost never intended).

type TokKind = 'word' | 'string' | 'quoted' | 'punct' | 'op';

interface Tok {
    kind: TokKind;
    text: string;
    lower: string;
    start: number;
    end: number;
}

export const SQL_SYNTAX_MAX_CHARS = 200_000;

const CLAUSE_WORDS = new Set([
    'select',
    'from',
    'where',
    'having',
    'on',
    'set',
    'when',
    'values',
    'join',
    'group',
    'order',
]);

const AFTER_COMMA_ERROR_WORDS = new Set([
    'from',
    'where',
    'group',
    'order',
    'having',
    'union',
    'intersect',
    'except',
    'limit',
    'offset',
]);

const REPEATABLE_KEYWORDS = new Set([
    'select',
    'from',
    'where',
    'group',
    'by',
    'order',
    'having',
    'join',
    'union',
    'insert',
    'into',
    'values',
    'update',
    'delete',
]);

const MULTI_OPS = ['<>', '!=', '<=', '>=', '::', '||'];

/** T-SQL `GO` (optionally `GO 5`) alone on its line ends a batch. */
function isBatchSeparatorLine(text: string, start: number, end: number): boolean {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;
    return (
        /^\s*$/.test(text.slice(lineStart, start)) && /^\s*\d*\s*$/.test(text.slice(end, lineEnd))
    );
}

function isWordStart(ch: string): boolean {
    return /[A-Za-z_@#$]/.test(ch);
}

function isWordChar(ch: string): boolean {
    return /[\w@#$]/.test(ch);
}

/** End of the first line of the span, so an unterminated token never underlines the rest of the file. */
function firstLineEnd(text: string, start: number, end: number): number {
    const newline = text.indexOf('\n', start);
    return newline === -1 || newline > end ? end : newline;
}

export function collectSqlSyntaxWarnings(sqlText: string, driver = ''): RangeWarning[] {
    if (!sqlText.trim() || sqlText.length > SQL_SYNTAX_MAX_CHARS) return [];
    const dialect = driver.toLowerCase();
    const bracketIdent = dialect === '' || dialect === 'sqlserver' || dialect === 'sqlite';
    const backticks = dialect === 'mysql';
    const backslashEscapes = dialect === 'mysql';

    const warnings: RangeWarning[] = [];
    const statements: Tok[][] = [[]];
    const parens: number[][] = [[]];
    const current = () => statements[statements.length - 1];
    const currentParens = () => parens[parens.length - 1];

    const fail = (start: number, end: number, message: string, severity: 'error' | 'warning') => {
        warnings.push({
            startOffset: start,
            endOffset: Math.max(end, start + 1),
            message,
            severity,
        });
    };
    const closeStatement = () => {
        currentParens().forEach(open =>
            fail(open, open + 1, 'Unclosed parenthesis: this "(" is never closed.', 'error'),
        );
        statements.push([]);
        parens.push([]);
    };

    const n = sqlText.length;
    let i = 0;
    while (i < n) {
        const ch = sqlText[i];
        const next = sqlText[i + 1];

        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === '-' && next === '-') {
            while (i < n && sqlText[i] !== '\n') i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            const close = sqlText.indexOf('*/', i + 2);
            if (close === -1) {
                fail(
                    i,
                    firstLineEnd(sqlText, i, n),
                    'Unterminated block comment: missing "*/".',
                    'error',
                );
                i = n;
            } else {
                i = close + 2;
            }
            continue;
        }

        const start = i;
        if (ch === "'" || ch === '"' || (ch === '`' && backticks) || (ch === '[' && bracketIdent)) {
            const closeChar = ch === '[' ? ']' : ch;
            i++;
            let closed = false;
            while (i < n) {
                if (backslashEscapes && ch === "'" && sqlText[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (sqlText[i] === closeChar) {
                    if (sqlText[i + 1] === closeChar) {
                        i += 2;
                        continue;
                    }
                    closed = true;
                    i++;
                    break;
                }
                i++;
            }
            if (!closed) {
                const what = ch === "'" ? 'string' : 'quoted identifier';
                fail(
                    start,
                    firstLineEnd(sqlText, start, n),
                    `Unterminated ${what}: missing closing ${closeChar}.`,
                    'error',
                );
            }
            current().push({
                kind: ch === "'" ? 'string' : 'quoted',
                text: sqlText.slice(start, i),
                lower: '',
                start,
                end: i,
            });
            continue;
        }
        if (ch === '$' && /^\$[A-Za-z_]*\$/.test(sqlText.slice(i, i + 40))) {
            const tag = /^\$[A-Za-z_]*\$/.exec(sqlText.slice(i, i + 40))![0];
            const close = sqlText.indexOf(tag, i + tag.length);
            i = close === -1 ? n : close + tag.length;
            current().push({ kind: 'string', text: '', lower: '', start, end: i });
            continue;
        }
        if (isWordStart(ch) || /\d/.test(ch)) {
            i++;
            while (i < n && isWordChar(sqlText[i])) i++;
            const text = sqlText.slice(start, i);
            if (text.toLowerCase() === 'go' && isBatchSeparatorLine(sqlText, start, i)) {
                closeStatement();
                continue;
            }
            current().push({ kind: 'word', text, lower: text.toLowerCase(), start, end: i });
            continue;
        }
        if (ch === ';') {
            i++;
            closeStatement();
            continue;
        }
        if (ch === '(') {
            currentParens().push(start);
            current().push({ kind: 'punct', text: '(', lower: '(', start, end: start + 1 });
            i++;
            continue;
        }
        if (ch === ')') {
            if (currentParens().length === 0) {
                fail(start, start + 1, 'Unmatched closing parenthesis: no "(" to close.', 'error');
            } else {
                currentParens().pop();
            }
            current().push({ kind: 'punct', text: ')', lower: ')', start, end: start + 1 });
            i++;
            continue;
        }
        if (ch === ',' || ch === '.' || ch === '[' || ch === ']') {
            current().push({ kind: 'punct', text: ch, lower: ch, start, end: start + 1 });
            i++;
            continue;
        }
        const multi = MULTI_OPS.find(op => sqlText.startsWith(op, i));
        const text = multi ?? ch;
        i += text.length;
        current().push({ kind: 'op', text, lower: text, start, end: i });
    }
    closeStatement();

    statements.forEach(tokens => checkStatement(tokens, sqlText, fail));
    return warnings.sort((a, b) => a.startOffset - b.startOffset);
}

type Fail = (start: number, end: number, message: string, severity: 'error' | 'warning') => void;

function checkStatement(tokens: Tok[], sqlText: string, fail: Fail): void {
    if (tokens.length === 0) return;

    let depth = 0;
    let lastClause = '';
    let hasWhere = false;
    const first = tokens[0];

    for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        const prev = tokens[t - 1];
        const next = tokens[t + 1];

        if (tok.kind === 'punct' && tok.text === '(') depth++;
        else if (tok.kind === 'punct' && tok.text === ')') depth = Math.max(0, depth - 1);

        if (tok.kind === 'word' && depth === 0) {
            if (CLAUSE_WORDS.has(tok.lower)) lastClause = tok.lower;
            if (tok.lower === 'where') hasWhere = true;
        }

        if (tok.kind === 'punct' && tok.text === ',') {
            const bad =
                !next ||
                (next.kind === 'word' && AFTER_COMMA_ERROR_WORDS.has(next.lower)) ||
                (next.kind === 'punct' && next.text === ')');
            if (bad && next) {
                fail(
                    tok.start,
                    tok.end,
                    'Trailing comma: nothing follows it in the list.',
                    'error',
                );
            }
        }

        if (
            tok.kind === 'op' &&
            (tok.text === '=' || tok.text === '<>' || tok.text === '!=') &&
            next?.kind === 'word' &&
            next.lower === 'null' &&
            lastClause !== 'set' &&
            first.lower !== 'set' &&
            first.lower !== 'declare' &&
            !(prev?.kind === 'word' && prev.text.startsWith('@'))
        ) {
            fail(
                tok.start,
                next.end,
                'Comparing with NULL never matches. Use IS NULL / IS NOT NULL.',
                'warning',
            );
        }

        if (
            tok.kind === 'word' &&
            prev?.kind === 'word' &&
            prev.lower === tok.lower &&
            REPEATABLE_KEYWORDS.has(tok.lower) &&
            /^\s+$/.test(sqlText.slice(prev.end, tok.start))
        ) {
            fail(tok.start, tok.end, `Repeated keyword "${tok.text}".`, 'warning');
        }
    }

    if (
        (first.lower === 'update' || first.lower === 'delete') &&
        first.kind === 'word' &&
        tokens[1]?.lower !== 'statistics' &&
        !hasWhere
    ) {
        const verb = first.lower.toUpperCase();
        fail(
            first.start,
            first.end,
            `${verb} without a WHERE clause affects every row of the table.`,
            'warning',
        );
    }
}
