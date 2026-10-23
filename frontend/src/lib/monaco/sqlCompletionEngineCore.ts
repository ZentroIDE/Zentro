// SPDX-License-Identifier: GPL-3.0-only

import { analyzeSqlText } from './sqlCompletionAnalysis';
import { buildSqlCompletionItems } from './sqlCompletionBuilder';
import { normalizeDriverKey, normalizeIdentifier } from './sqlCompletionIdentifiers';
import { isTableTargetCompletionContext } from './sqlCompletionBuilderUtils';
import type {
    SqlCatalogSchema,
    SqlColumnLike,
    SqlTableRelationshipLike,
    SqlTemplateLike,
} from './sqlCompletionTypes';
import {
    getCompletionMemoryBoost,
    type SqlCompletionAcceptance,
    type SqlCompletionSuggestionKind,
} from './sqlCompletionMemory';

export type SqlCompletionEditorFlavor = 'main' | 'filter';

export interface SqlCompletionRange {
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
}

export interface SqlCompletionRequest {
    sqlText: string;
    cursorOffset: number;
    currentWord: string;
    range: SqlCompletionRange;
    quotedIdentifier?: { range: SqlCompletionRange; opener: string };
    lineIndent?: string;
    positionAt?: (offset: number) => { lineNumber: number; column: number };
    editorFlavor: SqlCompletionEditorFlavor;
    driver: string;
    currentSchema?: string;
    profileKey?: string;
    dbName?: string;
    catalogSnapshot: SqlCatalogSchema[];
    templates: SqlTemplateLike[];
    baseQuery?: string;
    filterColumns?: string[];
    triggerKind?: string;
}

export interface SqlCompletionServices {
    fetchColumns: (schemaName: string, tableName: string) => Promise<SqlColumnLike[]>;
    fetchRelationships: (
        schemaName: string,
        tableName: string,
    ) => Promise<SqlTableRelationshipLike[]>;
    shouldAbort?: () => boolean;
}

export interface SqlCompletionRanking {
    baseScore: number;
    semanticBoost: number;
    prefixBoost: number;
    adaptiveBoost: number;
    finalScore: number;
    reasons: string[];
}

export interface SqlCompletionCandidateItem {
    label: unknown;
    insertText: string;
    detail?: string;
    documentation?: string | { value: string; [key: string]: unknown };
    insertTextRules?: number;
    range: SqlCompletionRange;
    commitCharacters?: string[];
    filterText?: string;
    sortText?: string;
    /** Edits elsewhere in the document applied together with the insertion. */
    additionalTextEdits?: Array<{ range: SqlCompletionRange; text: string }>;
    __zentroTableMeta?: unknown;
}

export interface SqlCompletionCandidate {
    label: string;
    kind: SqlCompletionSuggestionKind;
    item: SqlCompletionCandidateItem;
    ranking: SqlCompletionRanking;
    acceptance: Omit<SqlCompletionAcceptance, 'acceptedAt'>;
}

export interface SqlCompletionResult {
    candidates: SqlCompletionCandidate[];
    context: {
        clause: string;
        editorFlavor: SqlCompletionEditorFlavor;
        contextBucket: string;
        sourceSignature: string;
    };
    suppressedReason?: 'comment-or-string' | 'cancelled';
}

const INTERNAL_KINDS = {
    Field: 1,
    Module: 2,
    Class: 3,
    Keyword: 4,
    Function: 5,
    Text: 6,
    Operator: 7,
    Snippet: 8,
};

const INTERNAL_LANGUAGE_API = {
    languages: {
        CompletionItemKind: INTERNAL_KINDS,
        CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
    },
};

const FILTER_SCHEMA = '__result_filter__';
const FILTER_TABLE = '__result_filter_table__';
const FILTER_PREFIX = `SELECT * FROM ${FILTER_SCHEMA}.${FILTER_TABLE} WHERE `;

function stripTrailingOrderLimitOffset(sql: string): string {
    return sql
        .replace(/;\s*$/, '')
        .replace(/\s+(?:order\s+by|limit|offset)\b[\s\S]*$/i, '')
        .trim();
}

function buildAnalyzedText(request: SqlCompletionRequest): {
    text: string;
    cursorOffset: number;
    catalog: SqlCatalogSchema[];
    fetchColumns: SqlCompletionServices['fetchColumns'];
} {
    if (request.editorFlavor !== 'filter') {
        return {
            text: request.sqlText,
            cursorOffset: request.cursorOffset,
            catalog: request.catalogSnapshot,
            fetchColumns: async () => [],
        };
    }

    if (request.baseQuery && request.catalogSnapshot.length > 0) {
        const stripped = stripTrailingOrderLimitOffset(request.baseQuery);
        const connector = /\bwhere\b/i.test(stripped) ? ' AND ' : ' WHERE ';
        const prefix = `${stripped}${connector}`;
        return {
            text: `${prefix}${request.sqlText}`,
            cursorOffset:
                prefix.length + Math.max(0, Math.min(request.cursorOffset, request.sqlText.length)),
            catalog: request.catalogSnapshot,
            fetchColumns: async () => [],
        };
    }

    const columns = (request.filterColumns ?? [])
        .map(Name => Name.trim())
        .filter(Boolean)
        .map(Name => ({ Name }));
    return {
        text: `${FILTER_PREFIX}${request.sqlText}`,
        cursorOffset:
            FILTER_PREFIX.length +
            Math.max(0, Math.min(request.cursorOffset, request.sqlText.length)),
        catalog: [{ Name: FILTER_SCHEMA, Tables: [FILTER_TABLE], Views: [] }],
        fetchColumns: async (schemaName, tableName) =>
            schemaName === FILTER_SCHEMA && tableName === FILTER_TABLE ? columns : [],
    };
}

function resolveKind(kind: number, detail: string): SqlCompletionSuggestionKind {
    if (kind === INTERNAL_KINDS.Field) return 'column';
    if (kind === INTERNAL_KINDS.Module) return 'table';
    if (kind === INTERNAL_KINDS.Class) return 'view';
    if (kind === INTERNAL_KINDS.Keyword) return 'keyword';
    if (kind === INTERNAL_KINDS.Function) return 'function';
    if (kind === INTERNAL_KINDS.Operator) return 'operator';
    if (kind === INTERNAL_KINDS.Snippet) return 'snippet';
    if (detail === 'Alias') return 'alias';
    return 'text';
}

function parseBaseScore(sortText: unknown): number {
    const priority = Number.parseInt(String(sortText ?? '').slice(0, 5), 10);
    return Number.isFinite(priority) ? 2000 - priority : 0;
}

function calculatePrefixBoost(label: string, currentWord: string): number {
    const normalizedLabel = normalizeIdentifier(label).toLowerCase();
    const normalizedWord = normalizeIdentifier(currentWord).toLowerCase();
    if (!normalizedWord) return 0;
    if (normalizedLabel === normalizedWord) return 240;
    if (normalizedLabel.startsWith(normalizedWord)) return 160;
    if (normalizedLabel.includes(normalizedWord)) return 60;

    let wordIndex = 0;
    for (const character of normalizedLabel) {
        if (character === normalizedWord[wordIndex]) wordIndex += 1;
        if (wordIndex === normalizedWord.length) return 30;
    }
    return 0;
}

function buildSourceSignature(
    sources: Array<{ schemaName?: string; name: string; alias?: string }>,
): string {
    return sources
        .map(source =>
            [
                normalizeIdentifier(source.schemaName || ''),
                normalizeIdentifier(source.name),
                normalizeIdentifier(source.alias || ''),
            ].join('.'),
        )
        .sort()
        .slice(0, 4)
        .join(',');
}

function normalizeSuggestionKey(label: string): string {
    return normalizeIdentifier(label).toLowerCase();
}

export async function buildCompletionPlan(
    request: SqlCompletionRequest,
    services: SqlCompletionServices,
    memoryState?: unknown,
): Promise<SqlCompletionResult> {
    const prepared = buildAnalyzedText(request);
    const analysis = analyzeSqlText(prepared.text, prepared.cursorOffset);
    const sourceSignature = buildSourceSignature(analysis.sources);
    const contextBucket = [
        analysis.clause,
        request.editorFlavor,
        normalizeDriverKey(request.driver),
        normalizeIdentifier(request.currentSchema || ''),
        sourceSignature,
    ].join('|');
    const context = {
        clause: analysis.clause,
        editorFlavor: request.editorFlavor,
        contextBucket,
        sourceSignature,
    };

    if (analysis.isInCommentOrString) {
        return { candidates: [], context, suppressedReason: 'comment-or-string' };
    }
    if (services.shouldAbort?.()) {
        return { candidates: [], context, suppressedReason: 'cancelled' };
    }

    const fetchColumns =
        request.editorFlavor === 'filter' &&
        (!request.baseQuery || request.catalogSnapshot.length === 0)
            ? prepared.fetchColumns
            : services.fetchColumns;
    const generated = await buildSqlCompletionItems(
        analysis,
        request.currentWord,
        request.range,
        {
            monaco: INTERNAL_LANGUAGE_API,
            schemas: prepared.catalog,
            driver: request.driver,
            profileKey: request.profileKey,
            dbName: request.dbName,
            currentSchema: request.currentSchema,
            fetchColumns,
            fetchRelationships: services.fetchRelationships,
            templates: request.templates,
        },
        {
            shouldAbort: services.shouldAbort,
            quotedIdentifier: request.quotedIdentifier,
            lineIndent: request.lineIndent,
            positionAt: request.positionAt,
        },
    );

    if (services.shouldAbort?.()) {
        return { candidates: [], context, suppressedReason: 'cancelled' };
    }

    const filterColumnNames = new Set(
        (request.filterColumns ?? []).map(column => normalizeIdentifier(column).toLowerCase()),
    );
    const tableTargetContext = isTableTargetCompletionContext(analysis);
    const candidates = generated.map(item => {
        const label = typeof item.label === 'string' ? item.label : String(item.label?.label ?? '');
        const kind = resolveKind(Number(item.kind), String(item.detail ?? ''));
        const acceptance = {
            suggestionKey: normalizeSuggestionKey(label),
            suggestionKind: kind,
            contextBucket,
        };
        const baseScore = parseBaseScore(item.sortText);
        const resultColumnBoost =
            request.editorFlavor === 'filter' &&
            kind === 'column' &&
            filterColumnNames.has(normalizeSuggestionKey(label))
                ? 400
                : 0;
        const tableTargetBoost =
            tableTargetContext && (kind === 'table' || kind === 'view') ? 400 : 0;
        const semanticBoost = resultColumnBoost + tableTargetBoost;
        const prefixBoost = calculatePrefixBoost(label, request.currentWord);
        const adaptiveBoost = getCompletionMemoryBoost(memoryState, acceptance);
        const reasons = [`clause:${analysis.clause}`];
        if (resultColumnBoost > 0) reasons.push('result-column');
        if (tableTargetBoost > 0) reasons.push('table-target');
        if (prefixBoost > 0) reasons.push('prefix-match');
        if (adaptiveBoost > 0) reasons.push('accepted-in-context');
        const candidateItem: SqlCompletionCandidateItem = {
            label: item.label,
            insertText: item.insertText,
            detail: item.detail,
            documentation:
                typeof item.documentation === 'string'
                    ? item.documentation
                    : item.documentation
                      ? { value: item.documentation.value }
                      : undefined,
            insertTextRules: item.insertTextRules,
            range: (item.range as SqlCompletionRange | undefined) ?? request.range,
            commitCharacters: item.commitCharacters,
            filterText: item.filterText,
            sortText: item.sortText,
            // Only this engine produces them, and always with a string `text`.
            additionalTextEdits: item.additionalTextEdits as
                | SqlCompletionCandidateItem['additionalTextEdits']
                | undefined,
            __zentroTableMeta: Reflect.get(item, '__zentroTableMeta'),
        };
        return {
            label,
            kind,
            item: candidateItem,
            acceptance,
            ranking: {
                baseScore,
                semanticBoost,
                prefixBoost,
                adaptiveBoost,
                finalScore: baseScore + semanticBoost + prefixBoost + adaptiveBoost,
                reasons,
            },
        };
    });

    candidates.sort((left, right) => {
        if (left.ranking.finalScore !== right.ranking.finalScore) {
            return right.ranking.finalScore - left.ranking.finalScore;
        }
        return normalizeSuggestionKey(left.label).localeCompare(
            normalizeSuggestionKey(right.label),
        );
    });

    return { candidates, context };
}
