// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import {
    buildGroupedJoinRelations,
    buildJoinConditions,
    makeExistingAliasSet,
    makeUniqueAlias,
    quoteQualifiedName,
    resolveAnchorCandidates,
    type GroupedJoinRelation,
    type ResolvedAnchor,
} from './sqlCompletionJoinSuggestions';
import { qualifyColumn } from './sqlCompletionColumnGroups';
import { generateAliasFromObjectName, normalizeIdentifier } from './sqlCompletionIdentifiers';
import { tokenizeSql } from './sqlCompletionTokenizer';
import type {
    CompletionKind,
    SqlAnalysis,
    SqlCompletionBuildOptions,
    SqlCompletionEnv,
    SqlColumnLike,
    SqlToken,
} from './sqlCompletionTypes';
import { readLineIndent } from './sqlSelectListFormat';

// Columns of tables related by a foreign key to a table already in FROM, for
// "SELECT ord|": picking one inserts the column and adds the LEFT JOIN that
// makes it valid, so the user never has to leave the select list.

export interface ForeignKeyColumnRecord {
    label: string;
    item: languages.CompletionItem;
    priority: number;
}

interface FkColumnParams {
    analysis: SqlAnalysis;
    currentWord: string;
    range: languages.CompletionItem['range'];
    env: SqlCompletionEnv;
    positionAt: NonNullable<SqlCompletionBuildOptions['positionAt']>;
    shouldAbort: () => boolean;
}

// Fewer characters would match most columns of every related table.
const MIN_TYPED_CHARACTERS = 2;
const MAX_RELATED_TABLES = 8;
const MAX_ITEMS = 30;
// Behind columns of the tables already in the query.
const FK_COLUMN_PRIORITY = 200;

const FROM_CLAUSE_TERMINATORS = new Set([
    'where',
    'group',
    'order',
    'having',
    'limit',
    'offset',
    'fetch',
    'union',
    'intersect',
    'except',
    'for',
    'option',
    'window',
    ';',
]);

interface JoinInsertionPoint {
    offset: number;
    indent: string;
}

/** True when the word being typed follows a dot ("c.ord|"): a column of that table, not ours. */
function followsDot(analysis: SqlAnalysis, currentWord: string): boolean {
    const wordStart = analysis.cursorOffset - currentWord.length;
    return analysis.fullText[wordStart - 1] === '.';
}

const tableKey = (schemaName: string, tableName: string): string =>
    `${normalizeIdentifier(schemaName)}:${normalizeIdentifier(tableName)}`;

function endsFromClause(token: SqlToken, cursorDepth: number): boolean {
    // A ")" carries the depth of what it closes; ours closes when it matches.
    if (token.value === ')') return cursorDepth > 0 && token.depth === cursorDepth;
    return token.depth === cursorDepth && FROM_CLAUSE_TERMINATORS.has(token.value.toLowerCase());
}

/** Where a new JOIN goes: right after the last thing in the FROM clause. */
function findJoinInsertionPoint(analysis: SqlAnalysis): JoinInsertionPoint | null {
    const statementText = analysis.fullText.slice(
        analysis.statementStartOffset,
        analysis.statementEndOffset,
    );
    const cursorInStatement = analysis.cursorOffset - analysis.statementStartOffset;
    const { tokens } = tokenizeSql(statementText);
    const fromIndex = tokens.findIndex(
        token =>
            token.depth === analysis.cursorDepth &&
            token.start >= cursorInStatement &&
            token.value.toLowerCase() === 'from',
    );
    if (fromIndex === -1) return null;

    let lastEnd = tokens[fromIndex].end;
    for (const token of tokens.slice(fromIndex + 1)) {
        if (endsFromClause(token, analysis.cursorDepth)) break;
        lastEnd = token.end;
    }

    const fromOffset = analysis.statementStartOffset + tokens[fromIndex].start;
    const lineStart = analysis.fullText.lastIndexOf('\n', fromOffset - 1) + 1;
    return {
        offset: analysis.statementStartOffset + lastEnd,
        indent: readLineIndent(analysis.fullText.slice(lineStart)),
    };
}

interface RelatedTable {
    anchor: ResolvedAnchor;
    relation: GroupedJoinRelation;
}

/** Tables reachable by one foreign key from the query's tables and not yet joined. */
async function findUnjoinedRelatedTables(
    anchors: ResolvedAnchor[],
    env: SqlCompletionEnv,
    shouldAbort: () => boolean,
): Promise<RelatedTable[]> {
    const knownTables = new Set(
        anchors.map(anchor => tableKey(anchor.schemaName, anchor.tableName)),
    );
    const related: RelatedTable[] = [];
    for (const anchor of anchors) {
        const relationships = await env.fetchRelationships(anchor.schemaName, anchor.tableName);
        if (shouldAbort()) return [];
        for (const relation of buildGroupedJoinRelations(
            relationships ?? [],
            anchor.schemaName,
            anchor.tableName,
        )) {
            // A second foreign key to the same table would be ambiguous: skip it.
            const key = tableKey(relation.joinSchema, relation.joinTable);
            if (knownTables.has(key)) continue;
            knownTables.add(key);
            related.push({ anchor, relation });
        }
    }
    return related.slice(0, MAX_RELATED_TABLES);
}

function buildRecord(
    { anchor, relation }: RelatedTable,
    column: SqlColumnLike,
    alias: string,
    params: FkColumnParams,
    insertion: JoinInsertionPoint,
): ForeignKeyColumnRecord {
    const { env, range, positionAt } = params;
    const anchorAlias = anchor.source.alias || anchor.source.name;
    const joinClause =
        `LEFT JOIN ${quoteQualifiedName(relation.joinSchema, relation.joinTable, env.driver)} ${alias}` +
        ` ON ${buildJoinConditions(anchorAlias, alias, relation.columnPairs, env.driver)}`;
    const position = positionAt(insertion.offset);
    const label = `${alias}.${column.Name}`;
    const via = `${relation.joinTable} via ${relation.constraintName}`;
    return {
        label,
        priority: FK_COLUMN_PRIORITY,
        item: {
            label,
            kind: env.monaco.languages.CompletionItemKind.Field as CompletionKind,
            detail: column.DataType ? `${column.DataType} - ${via}` : via,
            documentation: { value: `Adds:\n\`\`\`sql\n${joinClause}\n\`\`\`` },
            insertText: qualifyColumn(alias, column.Name, env.driver),
            range,
            additionalTextEdits: [
                {
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    },
                    text: `\n${insertion.indent}${joinClause}`,
                },
            ],
        },
    };
}

async function collectForeignKeyColumnItems(
    params: FkColumnParams,
): Promise<ForeignKeyColumnRecord[]> {
    const { analysis, currentWord, env, shouldAbort } = params;
    const typed = normalizeIdentifier(currentWord);
    if (analysis.afterDot || followsDot(analysis, currentWord)) return [];
    if (typed.length < MIN_TYPED_CHARACTERS) return [];
    const insertion = findJoinInsertionPoint(analysis);
    if (!insertion) return [];

    const anchors = resolveAnchorCandidates(analysis, env, '');
    const relatedTables = await findUnjoinedRelatedTables(anchors, env, shouldAbort);
    const takenAliases = makeExistingAliasSet(analysis.sources);
    const records: ForeignKeyColumnRecord[] = [];

    for (const related of relatedTables) {
        const columns = await env.fetchColumns(
            related.relation.joinSchema,
            related.relation.joinTable,
        );
        if (shouldAbort()) return [];
        const matching = columns.filter(column => normalizeIdentifier(column.Name).includes(typed));
        if (matching.length === 0) continue;
        const alias = makeUniqueAlias(
            generateAliasFromObjectName(related.relation.joinTable),
            takenAliases,
        );
        matching.forEach(column =>
            records.push(buildRecord(related, column, alias, params, insertion)),
        );
    }
    return records.slice(0, MAX_ITEMS);
}

/**
 * Never lets this optional extra break the completion list: if relationships
 * or columns cannot be loaded, the regular suggestions still appear.
 */
export async function buildForeignKeyColumnItems(
    params: FkColumnParams,
): Promise<ForeignKeyColumnRecord[]> {
    try {
        return await collectForeignKeyColumnItems(params);
    } catch {
        return [];
    }
}
