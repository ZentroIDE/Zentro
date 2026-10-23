// SPDX-License-Identifier: GPL-3.0-only

import type { SchemaNode } from '../../stores/schemaStore';
import { extractCtes } from './sqlCompletionSources';
import { normalizeIdentifier } from './sqlCompletionIdentifiers';
import { SQL_KEYWORDS } from './sqlCompletionConstants';
import { type SqlToken } from './sqlCompletionTypes';
import { isClauseBoundary, isIdentifierLike, tokenizeSql } from './sqlCompletionTokenizer';
import { splitSqlStatements } from './sqlSchemaWarnings';

export type SchemaTokenKind = 'table' | 'column' | 'alias';

export interface SchemaTokenSpan {
    kind: SchemaTokenKind;
    startOffset: number;
    endOffset: number;
}

export interface SchemaTokenOptions {
    schemas: SchemaNode[];
    currentSchema: string;
    /** Cached column names only; returning undefined skips unqualified column colouring for that table. */
    getColumns?: (schemaName: string, tableName: string) => string[] | undefined;
}

// Scanning every keystroke of a huge script would be wasted work for a purely
// cosmetic feature; past this size the editor simply keeps the base colours.
export const SCHEMA_TOKENS_MAX_CHARS = 200_000;

const KEYWORDS = new Set(
    SQL_KEYWORDS.flatMap(entry => entry.toLowerCase().split(/\s+/)).concat([
        'as',
        'in',
        'is',
        'not',
        'null',
        'like',
        'between',
        'exists',
        'case',
        'when',
        'then',
        'else',
        'end',
        'distinct',
        'top',
        'asc',
        'desc',
        'by',
        'all',
        'any',
        'true',
        'false',
    ]),
);

interface TableSource {
    schemaName: string;
    tableName: string;
}

const TABLE_KEYWORDS = new Set(['from', 'join', 'update', 'into']);

export function collectSqlSchemaTokens(
    sqlText: string,
    options: SchemaTokenOptions,
): SchemaTokenSpan[] {
    if (!sqlText.trim() || sqlText.length > SCHEMA_TOKENS_MAX_CHARS) return [];
    const catalog = buildCatalog(options.schemas);
    if (catalog.tables.size === 0) return [];
    const currentSchema = normalizeIdentifier(options.currentSchema);

    const spans = new Map<number, SchemaTokenSpan>();
    for (const statement of splitSqlStatements(sqlText)) {
        const { tokens } = tokenizeSql(statement.text);
        const ctes = extractCtes(statement.text);
        const mark = (token: SqlToken, kind: SchemaTokenKind) => {
            const startOffset = statement.startOffset + token.start;
            if (!spans.has(startOffset)) {
                spans.set(startOffset, {
                    kind,
                    startOffset,
                    endOffset: statement.startOffset + token.end,
                });
            }
        };

        // alias (or bare table name) -> the table it stands for
        const sources = new Map<string, TableSource | null>();

        for (let i = 0; i < tokens.length; i++) {
            if (!TABLE_KEYWORDS.has(normalizeIdentifier(tokens[i].value))) continue;
            let j = i + 1;
            const isFromList = normalizeIdentifier(tokens[i].value) === 'from';
            for (;;) {
                const parsed = parseTableRef(tokens, j);
                if (!parsed) break;
                const objectToken = tokens[parsed.lastIndex];
                const objectName = normalizeIdentifier(objectToken.value);
                const explicitSchema = parsed.schemaIndex >= 0 ? tokens[parsed.schemaIndex] : null;
                const schemaKey = resolveSchemaKey(
                    catalog,
                    explicitSchema ? normalizeIdentifier(explicitSchema.value) : null,
                    currentSchema,
                    objectName,
                );

                let source: TableSource | null = null;
                if (!explicitSchema && ctes.has(objectName)) {
                    mark(objectToken, 'alias');
                } else if (catalog.tables.get(schemaKey)?.has(objectName)) {
                    mark(objectToken, 'table');
                    source = {
                        schemaName: catalog.schemaNames.get(schemaKey) ?? schemaKey,
                        tableName: catalog.tables.get(schemaKey)?.get(objectName) ?? objectName,
                    };
                }

                let next = parsed.lastIndex + 1;
                const nextWord = normalizeIdentifier(tokens[next]?.value ?? '');
                let aliasIndex = -1;
                if (nextWord === 'as' && isAliasToken(tokens[next + 1])) aliasIndex = next + 1;
                else if (isAliasToken(tokens[next]) && !isClauseBoundary(nextWord))
                    aliasIndex = next;

                if (aliasIndex >= 0) {
                    mark(tokens[aliasIndex], 'alias');
                    sources.set(normalizeIdentifier(tokens[aliasIndex].value), source);
                    next = aliasIndex + 1;
                } else {
                    sources.set(objectName, source);
                }

                if (isFromList && tokens[next]?.value === ',') {
                    j = next + 1;
                    continue;
                }
                break;
            }
        }
        for (const cteName of ctes.keys()) sources.set(cteName, null);

        const columnNames = new Set<string>();
        if (options.getColumns) {
            for (const source of sources.values()) {
                if (!source) continue;
                options.getColumns(source.schemaName, source.tableName)?.forEach(name => {
                    columnNames.add(normalizeIdentifier(name));
                });
            }
        }

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (!isIdentifierLike(token.value)) continue;
            const word = normalizeIdentifier(token.value);
            const prev = tokens[i - 1]?.value;
            const next = tokens[i + 1]?.value;

            if (next === '.' && prev !== '.' && isIdentifierLike(tokens[i + 2]?.value ?? '')) {
                if (sources.has(word)) {
                    const source = sources.get(word);
                    mark(token, source && source.tableName === word ? 'table' : 'alias');
                    // `alias.col` — but not `alias.col.field`, where col is a struct/schema part.
                    if (tokens[i + 3]?.value !== '.' && tokens[i + 3]?.value !== '(') {
                        mark(tokens[i + 2], 'column');
                    }
                }
                continue;
            }

            if (prev === '.' || next === '.' || next === '(') continue;
            if (columnNames.has(word) && !KEYWORDS.has(word)) mark(token, 'column');
        }
    }
    return [...spans.values()].sort((a, b) => a.startOffset - b.startOffset);
}

/**
 * The schema an object lives in: the one written in the SQL, else the current
 * schema, else any schema that has an object of that name (so colouring still
 * works before a current schema is known, or for a table outside it).
 */
function resolveSchemaKey(
    catalog: Catalog,
    explicit: string | null,
    current: string,
    objectName: string,
): string {
    if (explicit) return explicit;
    if (current && catalog.tables.get(current)?.has(objectName)) return current;
    for (const [schemaKey, names] of catalog.tables) {
        if (names.has(objectName)) return schemaKey;
    }
    return current;
}

function isAliasToken(token: SqlToken | undefined): boolean {
    if (!token || !isIdentifierLike(token.value)) return false;
    return !KEYWORDS.has(normalizeIdentifier(token.value));
}

interface ParsedTableRef {
    schemaIndex: number;
    lastIndex: number;
}

function parseTableRef(tokens: SqlToken[], index: number): ParsedTableRef | null {
    const first = tokens[index];
    if (!first || !isIdentifierLike(first.value)) return null;
    if (KEYWORDS.has(normalizeIdentifier(first.value))) return null;
    let lastIndex = index;
    let schemaIndex = -1;
    while (
        tokens[lastIndex + 1]?.value === '.' &&
        isIdentifierLike(tokens[lastIndex + 2]?.value ?? '')
    ) {
        schemaIndex = lastIndex;
        lastIndex += 2;
    }
    // f(...) is a table-valued function call, not a table.
    if (tokens[lastIndex + 1]?.value === '(') return null;
    return { schemaIndex, lastIndex };
}

interface Catalog {
    /** normalised schema -> normalised object name -> object name as stored */
    tables: Map<string, Map<string, string>>;
    /** normalised schema -> schema name as stored (cache keys are case-sensitive) */
    schemaNames: Map<string, string>;
}

function buildCatalog(schemas: SchemaNode[]): Catalog {
    const catalog: Catalog = { tables: new Map(), schemaNames: new Map() };
    for (const schema of schemas) {
        const key = normalizeIdentifier(schema.Name || '');
        if (!key) continue;
        const names = new Map<string, string>();
        for (const list of [
            schema.Tables,
            schema.Views,
            schema.MaterializedViews,
            schema.ForeignTables,
        ]) {
            list?.forEach(name => names.set(normalizeIdentifier(name), name));
        }
        catalog.tables.set(key, names);
        catalog.schemaNames.set(key, schema.Name);
    }
    return catalog;
}
