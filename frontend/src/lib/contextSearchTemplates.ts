// SPDX-License-Identifier: GPL-3.0-only

import { models } from '../../wailsjs/go/models';

/**
 * SQL template builders for the global context-search dialog. All pure
 * functions — no React, no toast, no store coupling.
 */

export type ObjectKind =
    | 'table'
    | 'foreign_table'
    | 'view'
    | 'materialized_view'
    | 'function'
    | 'index'
    | 'sequence'
    | 'data_type'
    | 'aggregate_function';

export const KIND_LABEL: Record<ObjectKind, string> = {
    table: 'Table',
    foreign_table: 'Foreign Table',
    view: 'View',
    materialized_view: 'Materialized View',
    function: 'Function / SP',
    index: 'Index',
    sequence: 'Sequence',
    data_type: 'Data Type',
    aggregate_function: 'Aggregate Function',
};

export const DEFAULT_ENABLED_KINDS: ObjectKind[] = ['table', 'view', 'index', 'function'];
export const PRIMARY_VISIBLE_KINDS: ObjectKind[] = ['table', 'index', 'view', 'function'];

export interface SearchItem {
    id: string;
    kind: ObjectKind;
    schema: string;
    name: string;
    qualifiedName: string;
    keywords: string;
}

// Canonical identifier quoting lives in driverCapabilities; imported here
// for the template builders and re-exported for existing consumers.
import { quoteIdent } from './driverCapabilities';
export { quoteIdent };

export function isTableLike(kind: ObjectKind): boolean {
    return (
        kind === 'table' ||
        kind === 'view' ||
        kind === 'materialized_view' ||
        kind === 'foreign_table'
    );
}

export function buildFunctionTemplate(item: SearchItem, driver: string | undefined): string {
    const s = quoteIdent(item.schema, driver);
    const n = quoteIdent(item.name, driver);

    if (driver === 'sqlserver') {
        return [
            `-- ${item.qualifiedName} (${KIND_LABEL[item.kind]})`,
            '-- TODO: adjust arguments',
            `EXEC ${s}.${n} @param1 = NULL;`,
            '',
        ].join('\n');
    }

    if (driver === 'mysql') {
        return [
            `-- ${item.qualifiedName} (${KIND_LABEL[item.kind]})`,
            '-- TODO: adjust arguments',
            `CALL ${s}.${n}(/* args */);`,
            '',
        ].join('\n');
    }

    if (driver === 'sqlite') {
        return [
            `-- ${item.qualifiedName} (${KIND_LABEL[item.kind]})`,
            '-- SQLite may not support stored procedures the same way as server databases.',
            `-- Try adapting to: SELECT * FROM ${s}.${n}(/* args */);`,
            '-- Or use your DB-specific CALL/EXEC syntax if available.',
            '',
        ].join('\n');
    }

    return [
        `-- ${item.qualifiedName} (${KIND_LABEL[item.kind]})`,
        '-- TODO: adjust arguments',
        `SELECT * FROM ${s}.${n}(/* args */);`,
        '',
    ].join('\n');
}

export function buildInfoTemplate(item: SearchItem): string {
    return [`-- ${KIND_LABEL[item.kind]}: ${item.qualifiedName}`, '-- Add query here'].join('\n');
}

export function buildSelectTemplate(item: SearchItem, driver: string | undefined): string {
    const s = quoteIdent(item.schema, driver);
    const n = quoteIdent(item.name, driver);
    return `SELECT *\nFROM ${s}.${n};\n`;
}

export function buildInsertTemplate(
    item: SearchItem,
    columns: models.ColumnDef[],
    driver: string | undefined,
): string {
    const s = quoteIdent(item.schema, driver);
    const n = quoteIdent(item.name, driver);
    if (columns.length === 0) {
        return [
            `INSERT INTO ${s}.${n} (`,
            '    -- column1, column2',
            ') VALUES (',
            '    -- value1, value2',
            ');',
            '',
        ].join('\n');
    }
    const cols = columns.map(c => quoteIdent(c.Name, driver)).join(', ');
    const vals = columns.map(c => `-- ${c.Name} (${c.DataType})`).join(',\n    ');
    return [`INSERT INTO ${s}.${n} (${cols})`, `VALUES (`, `    ${vals}`, `);`, ''].join('\n');
}

export function buildUpdateTemplate(
    item: SearchItem,
    columns: models.ColumnDef[],
    driver: string | undefined,
): string {
    const s = quoteIdent(item.schema, driver);
    const n = quoteIdent(item.name, driver);
    const sets = columns
        .filter(c => !c.IsPrimaryKey)
        .map(c => `    ${quoteIdent(c.Name, driver)} = -- ${c.DataType}`)
        .join(',\n');
    const pkCols = columns.filter(c => c.IsPrimaryKey);
    const where =
        pkCols.length > 0
            ? pkCols
                  .map(c => `    ${quoteIdent(c.Name, driver)} = -- ${c.DataType}`)
                  .join('\n    AND ')
            : '    -- add condition here';
    return [`UPDATE ${s}.${n}`, `SET`, sets || '    -- col = value', `WHERE`, where, `;`, ''].join(
        '\n',
    );
}

export function buildAlterTemplate(item: SearchItem, driver: string | undefined): string {
    const s = quoteIdent(item.schema, driver);
    const n = quoteIdent(item.name, driver);
    return [`ALTER TABLE ${s}.${n}`, 'ADD COLUMN -- new_column data_type;', ''].join('\n');
}

interface SchemaNode {
    Name: string;
    Tables?: string[];
    ForeignTables?: string[];
    Views?: string[];
    MaterializedViews?: string[];
    Functions?: string[];
    Indexes?: string[];
    Sequences?: string[];
    DataTypes?: string[];
    AggregateFunctions?: string[];
}

/**
 * Flatten a schema tree into a single searchable list. The `keywords` field
 * lower-cases name + qualified name + kind label so {@link fuzzyScore} can
 * walk a single string per item.
 */
export function buildItems(schemas: SchemaNode[] | undefined): SearchItem[] {
    if (!schemas) return [];

    const out: SearchItem[] = [];
    const idCount = new Map<string, number>();
    for (const s of schemas) {
        const pushItems = (kind: ObjectKind, names?: string[]) => {
            (names || []).forEach(name => {
                const qualifiedName = `${s.Name}.${name}`;
                const idBase = `${kind}:${qualifiedName}`;
                const nextCount = (idCount.get(idBase) ?? 0) + 1;
                idCount.set(idBase, nextCount);
                out.push({
                    id: `${idBase}:${nextCount}`,
                    kind,
                    schema: s.Name,
                    name,
                    qualifiedName,
                    keywords: `${name} ${qualifiedName} ${kind} ${KIND_LABEL[kind]}`.toLowerCase(),
                });
            });
        };

        pushItems('table', s.Tables);
        pushItems('foreign_table', s.ForeignTables);
        pushItems('view', s.Views);
        pushItems('materialized_view', s.MaterializedViews);
        pushItems('function', s.Functions);
        pushItems('index', s.Indexes);
        pushItems('sequence', s.Sequences);
        pushItems('data_type', s.DataTypes);
        pushItems('aggregate_function', s.AggregateFunctions);
    }

    return out;
}

/**
 * Fuzzy substring scoring. Returns 0 for no match, higher = better. Exact
 * substring match scores 1000 - position; subsequence matches score by
 * length-of-needle plus a streak bonus when characters appear consecutively.
 */
export function fuzzyScore(needle: string, haystack: string): number {
    if (!needle) return 1;
    if (haystack.includes(needle)) return 1000 - haystack.indexOf(needle);

    let score = 0;
    let hIdx = 0;
    let streak = 0;

    for (let i = 0; i < needle.length; i++) {
        const ch = needle[i];
        let found = false;
        while (hIdx < haystack.length) {
            if (haystack[hIdx] === ch) {
                found = true;
                streak++;
                score += 10 + streak * 2;
                hIdx++;
                break;
            }
            streak = 0;
            hIdx++;
        }
        if (!found) return 0;
    }

    return score;
}
