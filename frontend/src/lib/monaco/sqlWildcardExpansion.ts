// SPDX-License-Identifier: GPL-3.0-only

import { analyzeSqlText } from './sqlCompletionAnalysis';
import {
    buildColumnGroups,
    buildColumnReferences,
    collectSourceQualifiers,
    qualifyColumn,
    type ColumnGroupEnv,
} from './sqlCompletionColumnGroups';
import { normalizeIdentifier, stripIdentifierQuotes } from './sqlCompletionIdentifiers';
import { isIdentifierLike, tokenizeSql } from './sqlCompletionTokenizer';
import type { SqlSourceRef, SqlToken } from './sqlCompletionTypes';
import {
    formatSelectList,
    formatSelectListContinuation,
    readLineIndent,
} from './sqlSelectListFormat';

// Finds `*` / `alias.*` items in a select list and builds the text that
// replaces them with explicit columns (the "Expand * to columns" quick fix).

export interface SelectWildcard {
    /** Start of the item: the qualifier of "c.*", else the "*" itself. */
    startOffset: number;
    endOffset: number;
    qualifier?: string;
    /** Offset of the comma introducing this item when it is not the first one. */
    leadingCommaOffset?: number;
}

export interface WildcardEdit {
    startOffset: number;
    endOffset: number;
    text: string;
}

export type WildcardExpansionEnv = ColumnGroupEnv & { driver: string };

// A comma only belongs to a select list until one of these ends it.
const SELECT_LIST_TERMINATORS = new Set([
    'from',
    'where',
    'group',
    'order',
    'having',
    'union',
    'intersect',
    'except',
    'join',
    'on',
    'set',
    'values',
    'limit',
    'offset',
    'into',
]);

const keywordOf = (token: SqlToken | undefined): string => token?.value.toLowerCase() ?? '';

function findItemStartIndex(tokens: SqlToken[], starIndex: number): number {
    let start = starIndex;
    while (
        tokens[start - 1]?.value === '.' &&
        tokens[start - 2] &&
        isIdentifierLike(tokens[start - 2].value)
    ) {
        start -= 2;
    }
    return start;
}

function findOpeningParen(tokens: SqlToken[], closeIndex: number): number {
    const openDepth = tokens[closeIndex].depth - 1;
    for (let index = closeIndex - 1; index >= 0; index--) {
        if (tokens[index].value === '(' && tokens[index].depth === openDepth) return index;
    }
    return -1;
}

/** Index of the TOP keyword when the tokens up to `endIndex` end a TOP clause, else -1. */
function findTopClauseStart(tokens: SqlToken[], endIndex: number): number {
    let index = endIndex;
    if (keywordOf(tokens[index]) === 'ties' && keywordOf(tokens[index - 1]) === 'with') index -= 2;
    if (keywordOf(tokens[index]) === 'percent') index -= 1;
    const token = tokens[index];
    if (!token) return -1;
    if (/^\d+$/.test(token.value)) return keywordOf(tokens[index - 1]) === 'top' ? index - 1 : -1;
    if (token.value !== ')') return -1;
    const open = findOpeningParen(tokens, index);
    return open > 0 && keywordOf(tokens[open - 1]) === 'top' ? open - 1 : -1;
}

/** Index of the last token before any DISTINCT / ALL / TOP n modifiers. */
function skipSelectModifiers(tokens: SqlToken[], fromIndex: number): number {
    let index = fromIndex;
    while (tokens[index]) {
        const word = keywordOf(tokens[index]);
        if (word === 'distinct' || word === 'all') {
            index -= 1;
            continue;
        }
        const topStart = findTopClauseStart(tokens, index);
        if (topStart === -1) break;
        index = topStart - 1;
    }
    return index;
}

function isCommaInSelectList(tokens: SqlToken[], commaIndex: number): boolean {
    const depth = tokens[commaIndex].depth;
    for (let index = commaIndex - 1; index >= 0; index--) {
        const token = tokens[index];
        if (token.depth < depth) return false;
        if (token.depth > depth) continue;
        const word = keywordOf(token);
        if (word === 'select') return true;
        if (word === ';' || SELECT_LIST_TERMINATORS.has(word)) return false;
    }
    return false;
}

type ItemIntroducer = { kind: 'select' } | { kind: 'comma'; index: number };

function findItemIntroducer(tokens: SqlToken[], itemStartIndex: number): ItemIntroducer | null {
    const previousIndex = skipSelectModifiers(tokens, itemStartIndex - 1);
    const previous = tokens[previousIndex];
    if (keywordOf(previous) === 'select') return { kind: 'select' };
    if (previous?.value === ',' && isCommaInSelectList(tokens, previousIndex)) {
        return { kind: 'comma', index: previousIndex };
    }
    return null;
}

export function findSelectWildcards(sqlText: string): SelectWildcard[] {
    const { tokens } = tokenizeSql(sqlText);
    const wildcards: SelectWildcard[] = [];
    tokens.forEach((token, starIndex) => {
        if (token.value !== '*') return;
        const itemStartIndex = findItemStartIndex(tokens, starIndex);
        const introducer = findItemIntroducer(tokens, itemStartIndex);
        if (!introducer) return;
        wildcards.push({
            startOffset: tokens[itemStartIndex].start,
            endOffset: token.end,
            qualifier:
                itemStartIndex < starIndex
                    ? stripIdentifierQuotes(tokens[starIndex - 2].value)
                    : undefined,
            leadingCommaOffset:
                introducer.kind === 'comma' ? tokens[introducer.index].start : undefined,
        });
    });
    return wildcards;
}

async function resolveWildcardColumns(
    wildcard: SelectWildcard,
    sources: SqlSourceRef[],
    env: WildcardExpansionEnv,
): Promise<string[] | null> {
    const groups = await buildColumnGroups(sources, env);
    if (wildcard.qualifier) {
        const wanted = normalizeIdentifier(wildcard.qualifier);
        const group = groups.find(candidate => normalizeIdentifier(candidate.qualifier) === wanted);
        return group
            ? group.columns.map(column => qualifyColumn(group.qualifier, column, env.driver))
            : null;
    }
    // A source whose columns are unknown (CTE, subquery, unknown table) would be
    // silently dropped from the expansion, changing what the query returns.
    if (groups.length === 0 || groups.length !== collectSourceQualifiers(sources).length) {
        return null;
    }
    return buildColumnReferences(groups, env.driver);
}

/**
 * The edit that replaces `wildcard` (found in `sqlText`) with explicit
 * columns, or null when its columns cannot be resolved with certainty.
 */
export async function buildWildcardEdit(
    sqlText: string,
    wildcard: SelectWildcard,
    env: WildcardExpansionEnv,
    lineIndent: string,
): Promise<WildcardEdit | null> {
    const analysis = analyzeSqlText(sqlText, wildcard.endOffset);
    if (analysis.isInCommentOrString) return null;
    const columns = await resolveWildcardColumns(wildcard, analysis.sources, env);
    if (!columns || columns.length === 0) return null;

    if (wildcard.leadingCommaOffset !== undefined) {
        return {
            startOffset: wildcard.leadingCommaOffset,
            endOffset: wildcard.endOffset,
            text: formatSelectListContinuation(columns, { lineIndent }),
        };
    }
    return {
        startOffset: wildcard.startOffset,
        endOffset: wildcard.endOffset,
        text: formatSelectList(columns, { lineIndent }),
    };
}

export type QueryWildcardExpansion =
    | { status: 'none' }
    | { status: 'unresolved' }
    | { status: 'expanded'; query: string };

function indentOfLineAt(sqlText: string, offset: number): string {
    const lineStart = sqlText.lastIndexOf('\n', offset - 1) + 1;
    return readLineIndent(sqlText.slice(lineStart));
}

/**
 * Expands every select-list wildcard of `query`. All or nothing: if any
 * wildcard cannot be resolved (or no environment is available) the query is
 * left untouched, because a half-expanded statement would return different
 * columns than the user asked for.
 */
export async function expandAllWildcards(
    query: string,
    env: WildcardExpansionEnv | null,
): Promise<QueryWildcardExpansion> {
    const wildcards = findSelectWildcards(query);
    if (wildcards.length === 0) return { status: 'none' };
    if (!env) return { status: 'unresolved' };

    const edits: WildcardEdit[] = [];
    for (const wildcard of wildcards) {
        const lineIndent = indentOfLineAt(query, wildcard.startOffset);
        const edit = await buildWildcardEdit(query, wildcard, env, lineIndent);
        if (!edit) return { status: 'unresolved' };
        edits.push(edit);
    }
    // Apply back to front so earlier offsets stay valid.
    const expanded = edits
        .sort((left, right) => right.startOffset - left.startOffset)
        .reduce(
            (text, edit) =>
                `${text.slice(0, edit.startOffset)}${edit.text}${text.slice(edit.endOffset)}`,
            query,
        );
    return { status: 'expanded', query: expanded };
}
