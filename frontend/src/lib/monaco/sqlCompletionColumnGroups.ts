// SPDX-License-Identifier: GPL-3.0-only

import { findPreferredCatalogMatches } from './sqlCompletionCatalog';
import { normalizeIdentifier, quoteIdentifierForDriver } from './sqlCompletionIdentifiers';
import type { SqlCompletionEnv, SqlSourceRef } from './sqlCompletionTypes';

// Every source read by a statement together with its columns in table
// definition order. Completion ("All columns") and the Expand `*` quick fix
// both build on this, so they always agree on what a wildcard stands for.

const MAX_SOURCES = 8;

export type ColumnGroupEnv = Pick<SqlCompletionEnv, 'schemas' | 'currentSchema' | 'fetchColumns'>;

export interface SourceColumnGroup {
    source: SqlSourceRef;
    /** What the statement calls this source: its alias, else its name. */
    qualifier: string;
    columns: string[];
    /** The catalog table behind the source; absent for CTEs and subqueries. */
    table?: { schemaName: string; name: string };
}

type SourceColumns = Pick<SourceColumnGroup, 'columns' | 'table'>;

async function fetchSourceColumns(
    source: SqlSourceRef,
    env: ColumnGroupEnv,
): Promise<SourceColumns> {
    if (source.columns && source.columns.length > 0) return { columns: source.columns };
    if (source.kind === 'cte' || source.kind === 'subquery') return { columns: [] };
    const [match] = findPreferredCatalogMatches(
        env.schemas,
        source.name,
        source.schemaName,
        env.currentSchema,
    );
    if (!match) return { columns: [] };
    const columns = await env.fetchColumns(match.schemaName, match.name);
    return {
        columns: columns.map(column => column.Name),
        table: { schemaName: match.schemaName, name: match.name },
    };
}

export function resolveSourceQualifier(source: SqlSourceRef): string {
    return (source.alias || source.name || '').trim();
}

/** Distinct qualifiers of `sources`, in statement order (capped like completion). */
export function collectSourceQualifiers(sources: SqlSourceRef[]): string[] {
    const seen = new Set<string>();
    const qualifiers: string[] = [];
    for (const source of sources.slice(0, MAX_SOURCES)) {
        const qualifier = resolveSourceQualifier(source);
        const key = normalizeIdentifier(qualifier);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        qualifiers.push(qualifier);
    }
    return qualifiers;
}

/** Sources whose columns could be resolved; the rest are silently left out. */
export async function buildColumnGroups(
    sources: SqlSourceRef[],
    env: ColumnGroupEnv,
    shouldAbort: () => boolean = () => false,
): Promise<SourceColumnGroup[]> {
    const wanted = new Set(collectSourceQualifiers(sources).map(normalizeIdentifier));
    const groups: SourceColumnGroup[] = [];
    for (const source of sources.slice(0, MAX_SOURCES)) {
        const qualifier = resolveSourceQualifier(source);
        const key = normalizeIdentifier(qualifier);
        if (!wanted.delete(key)) continue;
        const resolved = await fetchSourceColumns(source, env);
        if (shouldAbort()) return [];
        if (resolved.columns.length > 0) groups.push({ source, qualifier, ...resolved });
    }
    return groups;
}

export function qualifyColumn(qualifier: string, column: string, driver: string): string {
    return `${quoteIdentifierForDriver(qualifier, driver)}.${quoteIdentifierForDriver(column, driver)}`;
}

/**
 * Column references for a select list over `groups`: alias-qualified once
 * there is more than one source (a bare name could be ambiguous), bare
 * otherwise.
 */
export function buildColumnReferences(groups: SourceColumnGroup[], driver: string): string[] {
    const qualify = groups.length > 1;
    return groups.flatMap(group =>
        group.columns.map(column =>
            qualify
                ? qualifyColumn(group.qualifier, column, driver)
                : quoteIdentifierForDriver(column, driver),
        ),
    );
}
