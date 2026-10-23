// SPDX-License-Identifier: GPL-3.0-only

import type { SchemaNode } from '../../stores/schemaStore';
import { findMatchingParenFrom, findTokenIndexAfterOffset } from './sqlCompletionProjection';
import { normalizeIdentifier, stripIdentifierQuotes } from './sqlCompletionIdentifiers';
import { extractCtes } from './sqlCompletionSources';
import { type SqlToken } from './sqlCompletionTypes';
import { isClauseBoundary, isIdentifierLike, tokenizeSql } from './sqlCompletionTokenizer';

export interface SqlSchemaWarning {
    objectName: string;
    schemaName: string;
    startOffset: number;
    endOffset: number;
    message: string;
}

export interface StatementSlice {
    text: string;
    startOffset: number;
}

interface SqlObjectReference {
    objectName: string;
    schemaName?: string;
    objectStartOffset: number;
    objectEndOffset: number;
}

const STATEMENT_START_KEYWORDS = new Set([
    'alter',
    'create',
    'delete',
    'describe',
    'drop',
    'explain',
    'insert',
    'merge',
    'replace',
    'select',
    'show',
    'truncate',
    'update',
    'with',
]);

export function collectSqlSchemaWarnings(
    sqlText: string,
    schemas: SchemaNode[],
    currentSchema: string,
): SqlSchemaWarning[] {
    const normalizedSchema = normalizeIdentifier(currentSchema);
    if (!normalizedSchema || !sqlText.trim() || schemas.length === 0) return [];

    const currentSchemaNode = schemas.find(
        schema => normalizeIdentifier(schema.Name || '') === normalizedSchema,
    );
    if (!currentSchemaNode) return [];

    const knownObjects = collectSchemaObjectNames(currentSchemaNode);

    const warnings: SqlSchemaWarning[] = [];
    const seen = new Set<string>();

    splitSqlStatements(sqlText).forEach(statement => {
        const ctes = extractCtes(statement.text);
        collectStatementObjectReferences(statement.text).forEach(reference => {
            if (reference.schemaName) return;

            const normalizedObject = normalizeIdentifier(reference.objectName);
            if (!normalizedObject) return;
            if (ctes.has(normalizedObject)) return;
            if (knownObjects.has(normalizedObject)) return;

            const key = `${reference.objectStartOffset}:${reference.objectEndOffset}:${normalizedObject}`;
            if (seen.has(key)) return;
            seen.add(key);

            warnings.push({
                objectName: reference.objectName,
                schemaName: currentSchemaNode.Name,
                startOffset: statement.startOffset + reference.objectStartOffset,
                endOffset: statement.startOffset + reference.objectEndOffset,
                message: `Object "${reference.objectName}" was not found in schema "${currentSchemaNode.Name}". Add a schema prefix or switch schema context.`,
            });
        });
    });

    return warnings;
}

function collectStatementObjectReferences(statementText: string): SqlObjectReference[] {
    const { tokens } = tokenizeSql(statementText);
    const references: SqlObjectReference[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const word = normalizeIdentifier(token.value);
        const nextWord = normalizeIdentifier(tokens[i + 1]?.value || '');

        if (word === 'from' || isJoinClause(word, nextWord)) {
            const nextIndex = word === 'join' || word === 'from' ? i + 1 : i + 2;
            const parsed = parseObjectReference(tokens, statementText, nextIndex, token.depth, {
                treatTrailingParenAsFunctionCall: true,
            });
            if (parsed?.reference) {
                references.push(parsed.reference);
            }
            if (parsed) {
                i = Math.max(i, parsed.nextIndex - 1);
            }
            continue;
        }

        if (word === 'update') {
            const parsed = parseObjectReference(tokens, statementText, i + 1, token.depth, {
                treatTrailingParenAsFunctionCall: false,
            });
            if (parsed?.reference) {
                references.push(parsed.reference);
            }
            if (parsed) {
                i = Math.max(i, parsed.nextIndex - 1);
            }
            continue;
        }

        if (word === 'insert' && nextWord === 'into') {
            const parsed = parseObjectReference(tokens, statementText, i + 2, token.depth, {
                treatTrailingParenAsFunctionCall: false,
            });
            if (parsed?.reference) {
                references.push(parsed.reference);
            }
            if (parsed) {
                i = Math.max(i, parsed.nextIndex - 1);
            }
        }
    }

    return references;
}

function parseObjectReference(
    tokens: SqlToken[],
    statementText: string,
    startIndex: number,
    depth: number,
    options?: {
        treatTrailingParenAsFunctionCall?: boolean;
    },
): { reference: SqlObjectReference | null; nextIndex: number } | null {
    const token = tokens[startIndex];
    if (!token) return null;

    if (token.depth !== depth) {
        return { reference: null, nextIndex: startIndex + 1 };
    }

    if (token.value === '(') {
        const closeOffset = findMatchingParenFrom(statementText, token.start);
        const nextIndex = findTokenIndexAfterOffset(tokens, closeOffset + 1);
        return {
            reference: null,
            nextIndex: nextIndex >= 0 ? nextIndex : tokens.length,
        };
    }

    if (
        !isIdentifierLike(token.value) ||
        (isUnquotedIdentifier(token.value) &&
            STATEMENT_START_KEYWORDS.has(normalizeIdentifier(token.value)))
    ) {
        return { reference: null, nextIndex: startIndex + 1 };
    }

    const firstValue = stripIdentifierQuotes(token.value);
    const firstStart = token.start;
    const firstEnd = token.end;
    let objectName = firstValue;
    let schemaName: string | undefined;
    let objectStartOffset = firstStart;
    let objectEndOffset = firstEnd;
    let nextIndex = startIndex + 1;

    if (
        tokens[nextIndex]?.depth === depth &&
        tokens[nextIndex]?.value === '.' &&
        isIdentifierLike(tokens[nextIndex + 1]?.value || '')
    ) {
        schemaName = firstValue;
        objectName = stripIdentifierQuotes(tokens[nextIndex + 1].value);
        objectStartOffset = tokens[nextIndex + 1].start;
        objectEndOffset = tokens[nextIndex + 1].end;
        nextIndex += 2;
    }

    if (
        options?.treatTrailingParenAsFunctionCall !== false &&
        tokens[nextIndex]?.depth === depth &&
        tokens[nextIndex]?.value === '('
    ) {
        const closeOffset = findMatchingParenFrom(statementText, tokens[nextIndex].start);
        const afterCallIndex = findTokenIndexAfterOffset(tokens, closeOffset + 1);
        return {
            reference: null,
            nextIndex: afterCallIndex >= 0 ? afterCallIndex : tokens.length,
        };
    }

    if (
        tokens[nextIndex]?.depth === depth &&
        normalizeIdentifier(tokens[nextIndex]?.value || '') === 'as' &&
        isIdentifierLike(tokens[nextIndex + 1]?.value || '')
    ) {
        nextIndex += 2;
    } else if (
        tokens[nextIndex]?.depth === depth &&
        isIdentifierLike(tokens[nextIndex]?.value || '') &&
        !isClauseBoundary(normalizeIdentifier(tokens[nextIndex].value))
    ) {
        nextIndex += 1;
    }

    return {
        reference: {
            objectName,
            schemaName,
            objectStartOffset,
            objectEndOffset,
        },
        nextIndex,
    };
}

export function splitSqlStatements(text: string): StatementSlice[] {
    const statements: StatementSlice[] = [];
    let start = 0;
    let depth = 0;
    let inSingle = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i++) {
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
        if (ch === '(') {
            depth++;
            continue;
        }
        if (ch === ')' && depth > 0) {
            depth--;
            continue;
        }
        if (ch === '\n' && depth === 0) {
            const nextStatementStart = findStartAfterBlankLines(text, i);
            if (nextStatementStart !== null) {
                pushStatementSlice(statements, text, start, i);
                start = nextStatementStart;
                i = nextStatementStart - 1;
                continue;
            }
        }
        if (ch === ';' && depth === 0) {
            pushStatementSlice(statements, text, start, i);
            start = i + 1;
        }
    }

    pushStatementSlice(statements, text, start, text.length);
    return statements;
}

function findStartAfterBlankLines(text: string, firstNewlineOffset: number): number | null {
    let newlineCount = 0;
    let offset = firstNewlineOffset;

    while (offset < text.length && /\s/.test(text[offset])) {
        if (text[offset] === '\n') newlineCount++;
        offset++;
    }

    return newlineCount >= 2 ? offset : null;
}

function isUnquotedIdentifier(value: string): boolean {
    return /^[A-Za-z_][\w$]*$/.test(value);
}

function pushStatementSlice(
    statements: StatementSlice[],
    fullText: string,
    rawStart: number,
    rawEnd: number,
): void {
    const text = fullText.slice(rawStart, rawEnd);
    const leadingWhitespace = text.match(/^\s*/)?.[0].length || 0;
    const trailingWhitespace = text.match(/\s*$/)?.[0].length || 0;
    const startOffset = rawStart + leadingWhitespace;
    const endOffset = rawEnd - trailingWhitespace;
    if (endOffset <= startOffset) return;
    statements.push({
        text: fullText.slice(startOffset, endOffset),
        startOffset,
    });
}

function collectSchemaObjectNames(schemaNode: SchemaNode): Set<string> {
    const names = new Set<string>();
    [
        schemaNode.Tables,
        schemaNode.Views,
        schemaNode.MaterializedViews,
        schemaNode.ForeignTables,
        schemaNode.Functions,
    ].forEach(list => {
        (list || []).forEach(name => {
            const normalized = normalizeIdentifier(name || '');
            if (normalized) names.add(normalized);
        });
    });
    return names;
}

function isJoinClause(word: string, nextWord: string): boolean {
    if (word === 'join') return true;
    return ['inner', 'left', 'right', 'full', 'cross'].includes(word) && nextWord === 'join';
}
