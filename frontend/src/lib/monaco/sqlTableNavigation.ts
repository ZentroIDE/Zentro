// SPDX-License-Identifier: GPL-3.0-only

import type { SchemaNode } from '../../stores/schemaStore';
import { analyzeSqlText } from './sqlCompletionAnalysis';
import { normalizeIdentifier, stripIdentifierQuotes } from './sqlCompletionIdentifiers';

export interface SqlPositionLike {
    lineNumber: number;
    column: number;
}

export interface SqlModelLike {
    getValue(): string;
    getOffsetAt(position: SqlPositionLike): number;
}

export interface TableNavigationMatch {
    schemaName: string;
    tableName: string;
    qualifiedName: string;
    objectKind: SchemaObjectKind;
}

export type SchemaObjectKind =
    | 'table'
    | 'view'
    | 'materialized_view'
    | 'foreign_table'
    | 'function';

export type TableNavigationResolution =
    | { kind: 'not_found'; lookup: string }
    | { kind: 'single_match'; lookup: string; match: TableNavigationMatch }
    | {
          kind: 'multiple_matches';
          lookup: string;
          matches: TableNavigationMatch[];
      };

const IDENTIFIER_CHAR = /[A-Za-z0-9_$.[\]`"]/;

export type SqlObjectNavigationResolution =
    | { kind: 'not_found'; lookup: string }
    | { kind: 'single_match'; lookup: string; match: TableNavigationMatch }
    | {
          kind: 'multiple_matches';
          lookup: string;
          matches: TableNavigationMatch[];
      };

const TABLE_KINDS = new Set<SchemaObjectKind>([
    'table',
    'view',
    'materialized_view',
    'foreign_table',
]);
const OBJECT_KINDS = new Set<SchemaObjectKind>([...TABLE_KINDS, 'function']);

export function resolveTableNavigationAtPosition(
    model: SqlModelLike,
    position: SqlPositionLike,
    schemas: SchemaNode[],
): TableNavigationResolution {
    return resolveNavigation(model, position, schemas, TABLE_KINDS);
}

export function resolveSqlObjectNavigationAtPosition(
    model: SqlModelLike,
    position: SqlPositionLike,
    schemas: SchemaNode[],
): SqlObjectNavigationResolution {
    return resolveNavigation(model, position, schemas, OBJECT_KINDS);
}

/**
 * The table an alias or table name in the statement stands for ("o" in
 * "o.order_id" -> orders). Aliases shadow real tables of the same name, so
 * this runs before the plain catalog lookup.
 */
function findMatchesThroughSources(
    text: string,
    offset: number,
    name: string,
    schemas: SchemaNode[],
    kinds: Set<SchemaObjectKind>,
): TableNavigationMatch[] {
    const wanted = normalizeIdentifier(name);
    const { sources } = analyzeSqlText(text, offset);
    const source =
        sources.find(candidate => normalizeIdentifier(candidate.alias || '') === wanted) ??
        sources.find(candidate => normalizeIdentifier(candidate.name) === wanted);
    if (!source || (source.kind !== 'table' && source.kind !== 'view')) return [];
    const segments = source.schemaName ? [source.schemaName, source.name] : [source.name];
    return findMatchesByKinds(schemas, segments, kinds);
}

function resolveNavigation(
    model: SqlModelLike,
    position: SqlPositionLike,
    schemas: SchemaNode[],
    kinds: Set<SchemaObjectKind>,
): TableNavigationResolution {
    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    const chain = extractIdentifierChainAtOffset(text, offset);
    if (!chain || chain.segments.length === 0) {
        return { kind: 'not_found', lookup: chain?.raw ?? '' };
    }

    // Only what is written up to the segment under the cursor names the
    // object: in "orders.order_id" a click on "orders" means the table, not
    // a schema called "orders" holding a table called "order_id".
    const upToCursor = chain.segments.slice(0, chain.activeIndex + 1);
    const lookup = chain.raw.slice(0, chain.activeEnd);
    const throughSources =
        upToCursor.length === 1
            ? findMatchesThroughSources(text, offset, upToCursor[0], schemas, kinds)
            : [];
    const resolved = throughSources.length
        ? throughSources
        : findMatchesByKinds(schemas, upToCursor.slice(-2), kinds);
    // A click on the schema part of "public.orders" still opens the table.
    const candidates = resolved.length
        ? resolved
        : findMatchesByKinds(schemas, chain.segments.slice(-2), kinds);

    if (candidates.length === 0) return { kind: 'not_found', lookup };
    if (candidates.length === 1) return { kind: 'single_match', lookup, match: candidates[0] };
    return { kind: 'multiple_matches', lookup, matches: candidates };
}

export function findTableMatches(
    schemas: SchemaNode[],
    segments: string[],
): TableNavigationMatch[] {
    return findMatchesByKinds(schemas, segments, TABLE_KINDS);
}

export function findSqlObjectMatches(
    schemas: SchemaNode[],
    segments: string[],
): TableNavigationMatch[] {
    return findMatchesByKinds(schemas, segments, OBJECT_KINDS);
}

function findMatchesByKinds(
    schemas: SchemaNode[],
    segments: string[],
    kinds: Set<SchemaObjectKind>,
): TableNavigationMatch[] {
    if (!segments.length) return [];

    const normalized = segments.map(segment => normalizeIdentifier(segment));
    const objectName = normalized[normalized.length - 1];
    const schemaHint = normalized.length >= 2 ? normalized[normalized.length - 2] : '';
    if (!objectName) return [];

    const results: TableNavigationMatch[] = [];

    schemas.forEach(schemaNode => {
        const schemaName = schemaNode.Name || '';
        if (!schemaName) return;
        if (schemaHint && normalizeIdentifier(schemaName) !== schemaHint) return;

        const objects = collectSchemaObjectNames(schemaNode, kinds);
        objects.forEach(({ name, kind }) => {
            if (normalizeIdentifier(name) !== objectName) return;
            results.push({
                schemaName,
                tableName: name,
                qualifiedName: `${schemaName}.${name}`,
                objectKind: kind,
            });
        });
    });

    const unique = new Map<string, TableNavigationMatch>();
    results.forEach(item => {
        const key = `${normalizeIdentifier(item.schemaName)}:${normalizeIdentifier(item.tableName)}:${item.objectKind}`;
        if (!unique.has(key)) unique.set(key, item);
    });

    return [...unique.values()].sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
}

interface IdentifierChain {
    raw: string;
    segments: string[];
    /** Index of the segment under the cursor. */
    activeIndex: number;
    /** End of that segment within `raw`. */
    activeEnd: number;
}

function extractIdentifierChainAtOffset(text: string, offset: number): IdentifierChain | null {
    if (!text) return null;
    const pivot = pickPivotIndex(text, offset);
    if (pivot < 0) return null;

    let start = pivot;
    let end = pivot + 1;

    while (start > 0 && IDENTIFIER_CHAR.test(text[start - 1])) start--;
    while (end < text.length && IDENTIFIER_CHAR.test(text[end])) end++;

    const raw = text.slice(start, end).trim();
    if (!raw) return null;

    const parsed = parseQualifiedIdentifier(raw);
    // The chain holds identifier characters only, so `raw` starts at `start`.
    const cursorInRaw = pivot - start;
    let activeIndex = 0;
    parsed.forEach((part, index) => {
        if (part.start <= cursorInRaw) activeIndex = index;
    });

    return {
        raw,
        segments: parsed.map(part => stripIdentifierQuotes(part.segment).trim()),
        activeIndex,
        activeEnd: parsed[activeIndex]?.end ?? raw.length,
    };
}

function pickPivotIndex(text: string, offset: number): number {
    const clamped = Math.max(0, Math.min(offset, text.length));
    if (clamped < text.length && IDENTIFIER_CHAR.test(text[clamped])) {
        return clamped;
    }
    if (clamped > 0 && IDENTIFIER_CHAR.test(text[clamped - 1])) {
        return clamped - 1;
    }
    return -1;
}

interface ParsedSegment {
    segment: string;
    start: number;
    end: number;
}

function parseQualifiedIdentifier(value: string): ParsedSegment[] {
    const segments: ParsedSegment[] = [];
    let i = 0;

    while (i < value.length) {
        while (i < value.length && value[i] === '.') i++;
        if (i >= value.length) break;
        const parsed = parseIdentifierSegment(value, i);
        if (!parsed) break;
        segments.push({ segment: parsed.segment, start: i, end: parsed.nextIndex });
        i = parsed.nextIndex;
        if (value[i] === '.') i++;
    }

    return segments;
}

function parseIdentifierSegment(
    value: string,
    startIndex: number,
): { segment: string; nextIndex: number } | null {
    const ch = value[startIndex];
    if (!ch) return null;

    if (ch === '"' || ch === '`') {
        const close = value.indexOf(ch, startIndex + 1);
        if (close === -1) return null;
        return {
            segment: value.slice(startIndex, close + 1),
            nextIndex: close + 1,
        };
    }

    if (ch === '[') {
        const close = value.indexOf(']', startIndex + 1);
        if (close === -1) return null;
        return {
            segment: value.slice(startIndex, close + 1),
            nextIndex: close + 1,
        };
    }

    if (!/[A-Za-z0-9_$]/.test(ch)) return null;
    let i = startIndex + 1;
    while (i < value.length && /[A-Za-z0-9_$]/.test(value[i])) i++;
    return { segment: value.slice(startIndex, i), nextIndex: i };
}

function collectSchemaObjectNames(
    schema: SchemaNode,
    kinds: Set<SchemaObjectKind>,
): Array<{ name: string; kind: SchemaObjectKind }> {
    const all: Array<{ kind: SchemaObjectKind; values: string[] | undefined }> = [
        { kind: 'table', values: schema.Tables },
        { kind: 'view', values: schema.Views },
        { kind: 'materialized_view', values: schema.MaterializedViews },
        { kind: 'foreign_table', values: schema.ForeignTables },
        { kind: 'function', values: schema.Functions },
    ];

    const items: Array<{ name: string; kind: SchemaObjectKind }> = [];
    all.forEach(({ kind, values }) => {
        if (!kinds.has(kind)) return;
        (values || []).forEach(name => {
            if (name && name.trim()) {
                items.push({ name, kind });
            }
        });
    });
    return items;
}
