// SPDX-License-Identifier: GPL-3.0-only

import { DRIVER } from '../constants';
import { stripIdentifierQuotes } from './sqlCompletionIdentifiers';
import { isNonColumnWord, isValueEndingKeyword } from './sqlNonColumnWords';
import { normalizeDriverKey } from './sqlDriverFacade';

// Finds the column names a single, simple SELECT refers to, so they can be
// checked against the real tables. Precision beats recall: any statement
// shape or token this scanner is not sure about yields nothing, because a
// wrong "unknown column" warning costs more trust than a missed typo.

/** The clause a reference was written in. */
export type ReferenceClause = 'select' | 'on' | 'where' | 'group' | 'having' | 'order';

export interface ColumnReference {
    /** Column name without quotes. */
    name: string;
    /** Table alias / name written in front of the column ("e" in e.Name). */
    qualifier?: string;
    /** Offsets of the column token itself (not the qualifier), within the statement. */
    startOffset: number;
    endOffset: number;
    quoted: boolean;
    clause: ReferenceClause;
}

type TokenKind = 'word' | 'quoted' | 'string' | 'number' | 'punct';

interface ScanToken {
    kind: TokenKind;
    value: string;
    start: number;
    end: number;
    /** Parenthesis nesting; a parenthesis itself sits at the outer depth. */
    depth: number;
}

type Region = 'none' | 'select' | 'from' | 'on' | 'where' | 'group' | 'having' | 'order' | 'tail';

const SUPPORTED_DIALECTS = new Set<string>([
    DRIVER.POSTGRES,
    DRIVER.SQLSERVER,
    DRIVER.MYSQL,
    DRIVER.SQLITE,
]);
const SCANNED_REGIONS = new Set<Region>(['select', 'on', 'where', 'group', 'having', 'order']);
const OUTPUT_ALIAS_REGIONS = new Set<Region>(['group', 'having', 'order', 'where']);
const JOIN_PREFIXES = new Set(['inner', 'left', 'right', 'full', 'cross', 'natural', 'outer']);
// Shapes whose columns cannot be resolved with certainty from one FROM list.
const BLOCKING_WORDS = new Set([
    'union',
    'intersect',
    'except',
    'natural',
    'into',
    'using',
    'pivot',
    'unpivot',
    'apply',
    'lateral',
    'window',
    'for',
    'values',
    'exec',
    'execute',
    'merge',
    'option',
]);
const VARIABLE_PREFIXES = new Set(['@', '#', ':', '$']);

// --- Scanning ---------------------------------------------------------------

function findQuoteEnd(text: string, start: number, close: string, backslashEscapes: boolean) {
    let index = start + 1;
    while (index < text.length) {
        if (backslashEscapes && text[index] === '\\') {
            index += 2;
            continue;
        }
        if (text[index] === close) {
            if (text[index + 1] !== close) return index + 1;
            index += 2;
            continue;
        }
        index += 1;
    }
    return -1;
}

function consumeWhile(text: string, start: number, pattern: RegExp): number {
    let index = start + 1;
    while (index < text.length && pattern.test(text[index])) index += 1;
    return index;
}

/** Reads one token at `index`; null when a quote is never closed. */
function readToken(
    text: string,
    index: number,
    dialect: string,
): { kind: TokenKind; end: number } | null {
    const char = text[index];
    const mysql = dialect === DRIVER.MYSQL;
    if (char === "'" || (char === '"' && mysql)) {
        const end = findQuoteEnd(text, index, char, mysql);
        return end === -1 ? null : { kind: 'string', end };
    }
    const bracketQuoted =
        char === '[' && (dialect === DRIVER.SQLSERVER || dialect === DRIVER.SQLITE);
    if (char === '"' || char === '`' || bracketQuoted) {
        const end = findQuoteEnd(text, index, bracketQuoted ? ']' : char, false);
        return end === -1 ? null : { kind: 'quoted', end };
    }
    if (/\d/.test(char)) return { kind: 'number', end: consumeWhile(text, index, /[\w.]/) };
    if (/[\p{L}_]/u.test(char)) {
        return { kind: 'word', end: consumeWhile(text, index, /[\p{L}\p{N}_$]/u) };
    }
    return { kind: 'punct', end: index + 1 };
}

/** Index after a comment starting at `index`, `index` when there is none, -1 if unterminated. */
function skipComment(text: string, index: number): number {
    if (text.startsWith('--', index)) {
        const lineEnd = text.indexOf('\n', index);
        return lineEnd === -1 ? text.length : lineEnd + 1;
    }
    if (text.startsWith('/*', index)) {
        const close = text.indexOf('*/', index + 2);
        return close === -1 ? -1 : close + 2;
    }
    return index;
}

function scanTokens(text: string, dialect: string): ScanToken[] | null {
    const tokens: ScanToken[] = [];
    let depth = 0;
    let index = 0;
    while (index < text.length) {
        if (/\s/.test(text[index])) {
            index += 1;
            continue;
        }
        const afterComment = skipComment(text, index);
        if (afterComment === -1 || text.startsWith('$$', index)) return null;
        if (afterComment !== index) {
            index = afterComment;
            continue;
        }
        const read = readToken(text, index, dialect);
        if (!read) return null;
        const value = text.slice(index, read.end);
        // N'..', E'..', X'..': the prefix belongs to the string that follows.
        if (read.kind === 'word' && /^[NEXBnexb]$/.test(value) && text[read.end] === "'") {
            index = read.end;
            continue;
        }
        if (value === ')' && depth > 0) depth -= 1;
        tokens.push({ kind: read.kind, value, start: index, end: read.end, depth });
        if (value === '(') depth += 1;
        index = read.end;
    }
    return depth === 0 ? tokens : null;
}

// --- Statement shape --------------------------------------------------------

const lowerOf = (token: ScanToken | undefined): string =>
    token?.kind === 'word' ? token.value.toLowerCase() : '';

function isSimpleSelect(tokens: ScanToken[]): boolean {
    if (lowerOf(tokens[0]) !== 'select') return false;
    return tokens.every((token, index) => {
        const word = lowerOf(token);
        if (!word) return true;
        if (word === 'select') return index === 0;
        if (BLOCKING_WORDS.has(word)) return false;
        // WITH is only fine as a table hint: FROM t WITH (NOLOCK).
        if (word === 'with') return tokens[index + 1]?.value === '(';
        return !(word === 'distinct' && lowerOf(tokens[index + 1]) === 'on');
    });
}

// --- Identifier chains ------------------------------------------------------

interface Chain {
    parts: ScanToken[];
    endIndex: number;
    endsWithStar: boolean;
}

const isName = (token: ScanToken | undefined): token is ScanToken =>
    token?.kind === 'word' || token?.kind === 'quoted';

function readChain(tokens: ScanToken[], startIndex: number): Chain {
    const parts = [tokens[startIndex]];
    let index = startIndex + 1;
    while (tokens[index]?.value === '.') {
        const after = tokens[index + 1];
        if (after?.value === '*') return { parts, endIndex: index + 2, endsWithStar: true };
        if (!isName(after)) break;
        parts.push(after);
        index += 2;
    }
    return { parts, endIndex: index, endsWithStar: false };
}

function findMatchingOpen(tokens: ScanToken[], closeIndex: number): number {
    const depth = tokens[closeIndex].depth;
    for (let index = closeIndex - 1; index >= 0; index--) {
        if (tokens[index].depth === depth && tokens[index].value === '(') return index;
    }
    return -1;
}

/** True when the token at `index` is the last token of a `TOP n` / `TOP (n)` clause. */
function endsTopClause(tokens: ScanToken[], index: number): boolean {
    const token = tokens[index];
    if (token.kind === 'number') return lowerOf(tokens[index - 1]) === 'top';
    if (token.value !== ')') return false;
    const open = findMatchingOpen(tokens, index);
    return open > 0 && lowerOf(tokens[open - 1]) === 'top';
}

/** True when the token before an item finishes an expression, so the item is an alias. */
function endsExpression(tokens: ScanToken[], index: number): boolean {
    const token = tokens[index];
    if (!token) return false;
    if (endsTopClause(tokens, index)) return false;
    if (token.kind === 'word') {
        return !isNonColumnWord(token.value) || isValueEndingKeyword(token.value);
    }
    return token.kind !== 'punct' || token.value === ')';
}

/** T-SQL "alias = expression" at the start of a select item. */
function isEqualsAlias(tokens: ScanToken[], startIndex: number, chain: Chain): boolean {
    const next = tokens[chain.endIndex];
    const after = tokens[chain.endIndex + 1];
    const previous = tokens[startIndex - 1];
    const startsItem = !previous || previous.value === ',' || lowerOf(previous) === 'select';
    return startsItem && next?.value === '=' && after?.value !== '=';
}

interface ChainOutcome {
    reference?: ReferenceWithoutRegion;
    alias?: string;
}

function interpretChain(
    tokens: ScanToken[],
    startIndex: number,
    chain: Chain,
    region: Region,
): ChainOutcome {
    const previous = tokens[startIndex - 1];
    const next = tokens[chain.endIndex];
    const last = chain.parts[chain.parts.length - 1];
    const single = chain.parts.length === 1;

    if (chain.endsWithStar || chain.parts.length > 2) return {};
    if (previous && previous.kind === 'punct' && VARIABLE_PREFIXES.has(previous.value)) return {};
    if (next?.value === '(' || lowerOf(previous) === 'collate') return {};
    if (lowerOf(previous) === 'as') return region === 'select' ? { alias: last.value } : {};
    if (single && region === 'select') {
        if (isEqualsAlias(tokens, startIndex, chain)) return { alias: last.value };
        if (endsExpression(tokens, startIndex - 1)) return { alias: last.value };
    }
    if (single && last.kind === 'word' && isNonColumnWord(last.value)) return {};

    return {
        reference: {
            name: stripIdentifierQuotes(last.value),
            qualifier: single ? undefined : stripIdentifierQuotes(chain.parts[0].value),
            startOffset: last.start,
            endOffset: last.end,
            quoted: last.kind === 'quoted',
        },
    };
}

// --- Walking the statement --------------------------------------------------

// A Map, not an object literal: a column called "constructor" must not hit Object.prototype.
const CLAUSE_REGIONS = new Map<string, Region>([
    ['select', 'select'],
    ['from', 'from'],
    ['join', 'from'],
    ['where', 'where'],
    ['having', 'having'],
    ['group', 'group'],
    ['order', 'order'],
    ['limit', 'tail'],
    ['offset', 'tail'],
    ['fetch', 'tail'],
]);

/** The region a depth-0 keyword opens, or null when it opens none. */
function regionOpenedBy(word: string, current: Region, next: ScanToken | undefined): Region | null {
    if (word === 'on') return current === 'from' ? 'on' : null;
    if (JOIN_PREFIXES.has(word)) {
        const inJoinPart = current === 'from' || current === 'on';
        return inJoinPart && next?.value !== '(' ? 'from' : null;
    }
    return CLAUSE_REGIONS.get(word) ?? null;
}

type ReferenceWithoutRegion = Omit<ColumnReference, 'clause'>;

interface RegionalReference extends ReferenceWithoutRegion {
    region: Region;
}

function walkStatement(tokens: ScanToken[]): ColumnReference[] {
    let region: Region = 'none';
    const references: RegionalReference[] = [];
    const outputAliases = new Set<string>();

    let index = 0;
    while (index < tokens.length) {
        const token = tokens[index];
        const opened: Region | null =
            token.depth === 0 && token.kind === 'word'
                ? regionOpenedBy(token.value.toLowerCase(), region, tokens[index + 1])
                : null;
        if (opened) {
            region = opened;
            index += 1;
            continue;
        }
        if (!SCANNED_REGIONS.has(region) || !isName(token)) {
            index += 1;
            continue;
        }
        const chain = readChain(tokens, index);
        const outcome = interpretChain(tokens, index, chain, region);
        if (outcome.alias) outputAliases.add(stripIdentifierQuotes(outcome.alias).toLowerCase());
        if (outcome.reference) references.push({ ...outcome.reference, region });
        index = chain.endIndex;
    }

    return references
        .filter(
            reference =>
                !(
                    OUTPUT_ALIAS_REGIONS.has(reference.region) &&
                    !reference.qualifier &&
                    outputAliases.has(reference.name.toLowerCase())
                ),
        )
        .map(({ name, qualifier, startOffset, endOffset, quoted, region }) => ({
            name,
            qualifier,
            startOffset,
            endOffset,
            quoted,
            // References are only collected inside SCANNED_REGIONS, all of which are clauses.
            clause: region as ReferenceClause,
        }));
}

/**
 * Column references of `statementText`, or null when the statement is not a
 * plain single SELECT this scanner can read with certainty.
 */
export function collectColumnReferences(
    statementText: string,
    driver: string,
): ColumnReference[] | null {
    const dialect = normalizeDriverKey(driver);
    if (!SUPPORTED_DIALECTS.has(dialect)) return null;
    const tokens = scanTokens(statementText, dialect);
    if (!tokens || !isSimpleSelect(tokens)) return null;
    return walkStatement(tokens);
}
