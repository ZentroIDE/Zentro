// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import { findCatalogMatches } from './sqlCompletionCatalog';
import {
    generateAliasFromObjectName,
    normalizeIdentifier,
    quoteIdentifierForDriver,
} from './sqlCompletionIdentifiers';
import {
    CompletionKind,
    SqlAnalysis,
    SqlCompletionEnv,
    SqlSourceRef,
    SqlTableRelationshipLike,
} from './sqlCompletionTypes';

type JoinSuggestionRecord = {
    label: string;
    item: languages.CompletionItem;
    priority: number;
};
export type ResolvedAnchor = {
    schemaName: string;
    tableName: string;
    source: SqlSourceRef;
};

export interface GroupedJoinRelation {
    constraintName: string;
    joinSchema: string;
    joinTable: string;
    columnPairs: Array<{ anchorColumn: string; joinColumn: string }>;
}

const JOIN_PREFIXES = ['jo', 'joi', 'join'];

const JOIN_TYPE_SNIPPETS: Array<{
    label: string;
    insertText: string;
    detail: string;
}> = [
    { label: 'INNER JOIN', insertText: 'INNER JOIN ', detail: 'Inner join' },
    { label: 'LEFT JOIN', insertText: 'LEFT JOIN ', detail: 'Left join' },
    {
        label: 'LEFT OUTER JOIN',
        insertText: 'LEFT OUTER JOIN ',
        detail: 'Left outer join',
    },
    { label: 'RIGHT JOIN', insertText: 'RIGHT JOIN ', detail: 'Right join' },
    {
        label: 'RIGHT OUTER JOIN',
        insertText: 'RIGHT OUTER JOIN ',
        detail: 'Right outer join',
    },
    { label: 'FULL JOIN', insertText: 'FULL JOIN ', detail: 'Full outer join' },
    {
        label: 'FULL OUTER JOIN',
        insertText: 'FULL OUTER JOIN ',
        detail: 'Full outer join',
    },
    {
        label: 'CROSS JOIN',
        insertText: 'CROSS JOIN ',
        detail: 'Cross join — cartesian product',
    },
];

function getTrailingIdentifierBeforeCursor(analysis: SqlAnalysis): string {
    const cursorInStatement = Math.max(0, analysis.cursorOffset - analysis.statementStartOffset);
    const typedSegment = analysis.statementText.slice(0, cursorInStatement);
    const match = typedSegment.match(/([A-Za-z_][\w$]*)$/);
    return normalizeIdentifier(match?.[1] || '');
}

function shouldSuggestJoinSnippets(
    clause: string,
    currentWord: string,
    analysis: SqlAnalysis,
): boolean {
    if (analysis.afterDot) return false;
    if (!(clause === 'from' || clause === 'join' || clause === 'on')) return false;
    const normWord =
        normalizeIdentifier(currentWord) || getTrailingIdentifierBeforeCursor(analysis);
    if (!normWord) return false;
    if (normWord.startsWith('j')) return true;
    return JOIN_PREFIXES.some(prefix => prefix.startsWith(normWord) || normWord.startsWith(prefix));
}

function resolveAnchorTable(source: SqlSourceRef, env: SqlCompletionEnv): ResolvedAnchor | null {
    if (source.schemaName) {
        return { schemaName: source.schemaName, tableName: source.name, source };
    }
    const matches = findCatalogMatches(env.schemas, source.name);
    if (matches.length === 0) return null;
    const preferredKind = source.kind === 'view' ? 'view' : 'table';
    const preferredMatches = matches.filter(match => match.kind === preferredKind);
    if (preferredMatches.length === 1) {
        const preferred = preferredMatches[0];
        return {
            schemaName: preferred.schemaName,
            tableName: preferred.name,
            source,
        };
    }
    if (preferredMatches.length > 1) {
        return null;
    }
    if (matches.length === 1) {
        const fallback = matches[0];
        return {
            schemaName: fallback.schemaName,
            tableName: fallback.name,
            source,
        };
    }
    return null;
}

export function resolveAnchorCandidates(
    analysis: SqlAnalysis,
    env: SqlCompletionEnv,
    currentWord: string,
): ResolvedAnchor[] {
    const normWord = normalizeIdentifier(currentWord);
    const candidates: ResolvedAnchor[] = [];
    const seen = new Set<string>();
    for (let i = analysis.sources.length - 1; i >= 0; i--) {
        const source = analysis.sources[i];
        if (!(source.kind === 'table' || source.kind === 'view')) continue;
        const sourceNameNorm = normalizeIdentifier(source.name);
        const sourceAliasNorm = normalizeIdentifier(source.alias || '');
        const matchesCurrentWord =
            Boolean(normWord) && (sourceNameNorm === normWord || sourceAliasNorm === normWord);
        if (matchesCurrentWord) continue;
        const resolved = resolveAnchorTable(source, env);
        if (!resolved) continue;
        const key = `${normalizeIdentifier(resolved.schemaName)}:${normalizeIdentifier(resolved.tableName)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(resolved);
    }
    return candidates;
}

export function makeExistingAliasSet(sources: SqlSourceRef[]): Set<string> {
    const aliases = new Set<string>();
    sources.forEach(source => {
        const alias = normalizeIdentifier(source.alias || source.name);
        if (alias) aliases.add(alias);
    });
    return aliases;
}

export function makeUniqueAlias(baseAlias: string, existingAliases: Set<string>): string {
    const normalizedBase = normalizeIdentifier(baseAlias || 't') || 't';
    if (!existingAliases.has(normalizedBase)) {
        existingAliases.add(normalizedBase);
        return normalizedBase;
    }
    let suffix = 2;
    while (existingAliases.has(`${normalizedBase}${suffix}`)) suffix++;
    const resolved = `${normalizedBase}${suffix}`;
    existingAliases.add(resolved);
    return resolved;
}

function normalizeConstraintName(value: string, index: number): string {
    const cleaned = value.trim();
    return cleaned || `fk_${index + 1}`;
}

export function buildGroupedJoinRelations(
    relationships: SqlTableRelationshipLike[],
    anchorSchema: string,
    anchorTable: string,
): GroupedJoinRelation[] {
    const anchorSchemaNorm = normalizeIdentifier(anchorSchema);
    const anchorTableNorm = normalizeIdentifier(anchorTable);
    const grouped = new Map<string, GroupedJoinRelation>();

    relationships.forEach((relationship, index) => {
        const sourceMatchesAnchor =
            normalizeIdentifier(relationship.SourceSchema) === anchorSchemaNorm &&
            normalizeIdentifier(relationship.SourceTable) === anchorTableNorm;
        const targetMatchesAnchor =
            normalizeIdentifier(relationship.TargetSchema) === anchorSchemaNorm &&
            normalizeIdentifier(relationship.TargetTable) === anchorTableNorm;
        if (!sourceMatchesAnchor && !targetMatchesAnchor) return;

        const joinSchema = sourceMatchesAnchor
            ? relationship.TargetSchema
            : relationship.SourceSchema;
        const joinTable = sourceMatchesAnchor ? relationship.TargetTable : relationship.SourceTable;
        const anchorColumn = sourceMatchesAnchor
            ? relationship.SourceColumn
            : relationship.TargetColumn;
        const joinColumn = sourceMatchesAnchor
            ? relationship.TargetColumn
            : relationship.SourceColumn;
        const constraintName = normalizeConstraintName(relationship.ConstraintName, index);
        const key = [
            normalizeIdentifier(constraintName),
            normalizeIdentifier(joinSchema),
            normalizeIdentifier(joinTable),
        ].join(':');
        const existing = grouped.get(key);
        if (existing) {
            existing.columnPairs.push({ anchorColumn, joinColumn });
            return;
        }
        grouped.set(key, {
            constraintName,
            joinSchema,
            joinTable,
            columnPairs: [{ anchorColumn, joinColumn }],
        });
    });

    return Array.from(grouped.values());
}

export function quoteQualifiedName(schemaName: string, tableName: string, driver: string): string {
    return `${quoteIdentifierForDriver(schemaName, driver)}.${quoteIdentifierForDriver(tableName, driver)}`;
}

/** "a.x = j.x AND a.y = j.y" for the column pairs of one foreign key. */
export function buildJoinConditions(
    anchorAlias: string,
    joinAlias: string,
    columnPairs: GroupedJoinRelation['columnPairs'],
    driver: string,
): string {
    const anchor = quoteIdentifierForDriver(anchorAlias, driver);
    const join = quoteIdentifierForDriver(joinAlias, driver);
    return columnPairs
        .map(
            pair =>
                `${anchor}.${quoteIdentifierForDriver(pair.anchorColumn, driver)} = ${join}.${quoteIdentifierForDriver(pair.joinColumn, driver)}`,
        )
        .join(' AND ');
}

export async function buildJoinSuggestionItems(
    analysis: SqlAnalysis,
    clause: string,
    currentWord: string,
    range: {
        startLineNumber: number;
        endLineNumber: number;
        startColumn: number;
        endColumn: number;
    },
    env: SqlCompletionEnv,
    shouldAbort: () => boolean,
): Promise<JoinSuggestionRecord[]> {
    if (!shouldSuggestJoinSnippets(clause, currentWord, analysis) || shouldAbort()) return [];

    const typeItems: JoinSuggestionRecord[] = JOIN_TYPE_SNIPPETS.map(snippet => ({
        label: snippet.label,
        priority: -200,
        item: {
            label: snippet.label,
            kind: env.monaco.languages.CompletionItemKind.Keyword as CompletionKind,
            detail: snippet.detail,
            insertText: snippet.insertText,
            range,
        },
    }));

    const anchors = resolveAnchorCandidates(analysis, env, currentWord);
    const existingAliases = makeExistingAliasSet(analysis.sources);
    const seenJoinKeys = new Set<string>();
    const fkItems: JoinSuggestionRecord[] = [];

    for (const anchor of anchors) {
        if (shouldAbort()) break;
        const relationships = await env.fetchRelationships(anchor.schemaName, anchor.tableName);
        if (shouldAbort() || !relationships || relationships.length === 0) continue;

        const grouped = buildGroupedJoinRelations(
            relationships,
            anchor.schemaName,
            anchor.tableName,
        );
        if (grouped.length === 0) continue;

        const anchorAliasRaw = anchor.source.alias || anchor.source.name;

        grouped.forEach(group => {
            const dedupeKey = [
                normalizeIdentifier(anchor.schemaName),
                normalizeIdentifier(anchor.tableName),
                normalizeIdentifier(group.constraintName),
                normalizeIdentifier(group.joinSchema),
                normalizeIdentifier(group.joinTable),
            ].join(':');
            if (seenJoinKeys.has(dedupeKey)) return;
            seenJoinKeys.add(dedupeKey);

            const joinAlias = makeUniqueAlias(
                generateAliasFromObjectName(group.joinTable),
                existingAliases,
            );
            const conditions = buildJoinConditions(
                anchorAliasRaw,
                joinAlias,
                group.columnPairs,
                env.driver,
            );
            const conditionSummary = group.columnPairs
                .map(
                    pair =>
                        `${anchorAliasRaw}.${pair.anchorColumn} = ${joinAlias}.${pair.joinColumn}`,
                )
                .join(' AND ');
            const qualifiedJoinTable = quoteQualifiedName(
                group.joinSchema,
                group.joinTable,
                env.driver,
            );
            const label = `JOIN ${group.joinSchema}.${group.joinTable} (${group.constraintName})`;
            fkItems.push({
                label,
                priority: -300,
                item: {
                    label,
                    kind: env.monaco.languages.CompletionItemKind.Snippet as CompletionKind,
                    detail: `FK: ${conditionSummary}`,
                    insertText: `INNER JOIN ${qualifiedJoinTable} ${joinAlias} ON ${conditions}`,
                    insertTextRules:
                        env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                },
            });
        });
    }

    // FK snippets (priority -300) appear above join type items (priority -200)
    return [...fkItems, ...typeItems];
}
