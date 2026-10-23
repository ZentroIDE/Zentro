// SPDX-License-Identifier: GPL-3.0-only

import { models } from '../../wailsjs/go/models';
import { quoteIdent } from './contextSearchTemplates';
import { formatSqlLiteral } from './sqlLiteral';

export { escapeSqlString } from './sqlLiteral';

export interface DraftRow {
    id: string;
    kind: 'new' | 'duplicate';
    values: string[];
    insertAfterRowIndex: number | null;
    sourceRowIndex?: number;
}

export interface DisplayRow {
    key: string;
    kind: 'persisted' | 'draft';
    values: string[];
    persistedIndex?: number;
    draft?: DraftRow;
}

const SQL_IDENTIFIER_PATTERN =
    '(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\\[(?:[^\\]]|\\]\\])+\\]|[A-Za-z_][A-Za-z0-9_$]*)';
const FROM_PATTERN = new RegExp(
    String.raw`\bFROM\s+(${SQL_IDENTIFIER_PATTERN})(?:\s*\.\s*(${SQL_IDENTIFIER_PATTERN}))?`,
    'i',
);

interface SchemaLookupLike {
    Name: string;
    Tables: string[];
    ForeignTables?: string[];
    Views?: string[];
    MaterializedViews?: string[];
}

interface ParseTableReferenceOptions {
    fallbackSchema?: string;
    schemas?: SchemaLookupLike[];
}

function normalizeIdentifier(value: string): string {
    return unquoteIdentifier(value).toLowerCase();
}

function unquoteIdentifier(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
        return trimmed.slice(1, -1).replace(/``/g, '`');
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed.slice(1, -1).replace(/]]/g, ']');
    }
    return trimmed;
}

function schemaContainsTable(schema: SchemaLookupLike, tableName: string): boolean {
    const target = normalizeIdentifier(tableName);
    const candidates = [
        ...(schema.Tables || []),
        ...(schema.ForeignTables || []),
        ...(schema.Views || []),
        ...(schema.MaterializedViews || []),
    ];
    return candidates.some(candidate => normalizeIdentifier(candidate) === target);
}

function resolveImplicitSchema(
    table: string,
    fallbackSchema: string,
    schemas: SchemaLookupLike[],
): string {
    if (!table) return fallbackSchema;

    if (fallbackSchema) {
        const fallbackMatch = schemas.find(
            schema => normalizeIdentifier(schema.Name) === normalizeIdentifier(fallbackSchema),
        );
        if (fallbackMatch && schemaContainsTable(fallbackMatch, table)) {
            return fallbackMatch.Name;
        }
    }

    const matches = schemas.filter(schema => schemaContainsTable(schema, table));
    if (matches.length === 1) {
        return matches[0].Name;
    }

    return fallbackSchema;
}

export function parseTableReference(
    query?: string,
    fallbackTable?: string,
    options?: ParseTableReferenceOptions,
): { schema: string; table: string } {
    const fallbackSchema = options?.fallbackSchema?.trim() || '';
    const match = query?.match(FROM_PATTERN);
    const rawSchema = match?.[2] ? match[1] : '';
    const rawTable = match?.[2] || match?.[1] || fallbackTable || '';
    const schema = unquoteIdentifier(rawSchema);
    const table = unquoteIdentifier(rawTable);

    if (schema && table) {
        return {
            schema,
            table,
        };
    }

    return {
        schema: resolveImplicitSchema(table, fallbackSchema, options?.schemas || []),
        table,
    };
}

export function resolveQualifiedTableName(
    query?: string,
    fallbackTable?: string,
    options?: ParseTableReferenceOptions,
    driver?: string,
): string {
    const { schema, table } = parseTableReference(query, fallbackTable, options);
    if (!table) return '';
    if (schema) {
        return `${quoteIdent(schema, driver)}.${quoteIdent(table, driver)}`;
    }
    return quoteIdent(table, driver);
}

export function getDraftDefaultValues(columns: string[], columnDefs: models.ColumnDef[]): string[] {
    const defsByName = new Map(columnDefs.map(column => [column.Name, column]));
    return columns.map(columnName => {
        const rawDefault = defsByName.get(columnName)?.DefaultValue?.trim() || '';
        if (!rawDefault) return '';
        return rawDefault.replace(/^'(.*)'$/, '$1');
    });
}

export function buildDisplayRows(
    rows: string[][],
    draftRows: DraftRow[],
    windowStartOffset = 0,
): DisplayRow[] {
    const displayRows: DisplayRow[] = [];
    const topDraftRows = draftRows.filter(draft => draft.insertAfterRowIndex === null);
    const draftsByAnchor = new Map<number, DraftRow[]>();

    draftRows
        .filter(draft => draft.insertAfterRowIndex !== null)
        .forEach(draft => {
            const anchor = draft.insertAfterRowIndex as number;
            const existing = draftsByAnchor.get(anchor) || [];
            existing.push(draft);
            draftsByAnchor.set(anchor, existing);
        });

    topDraftRows.forEach(draft => {
        displayRows.push({
            key: `d:${draft.id}`,
            kind: 'draft',
            values: draft.values,
            draft,
        });
    });

    rows.forEach((row, arrayIndex) => {
        const persistedIndex = windowStartOffset + arrayIndex;
        displayRows.push({
            key: `p:${persistedIndex}`,
            kind: 'persisted',
            values: row,
            persistedIndex,
        });

        (draftsByAnchor.get(persistedIndex) || []).forEach(draft => {
            displayRows.push({
                key: `d:${draft.id}`,
                kind: 'draft',
                values: draft.values,
                draft,
            });
        });
    });

    return displayRows;
}

/**
 * Turns an edited grid cell into a SQL literal for the target provider.
 * Thin wrapper over {@link formatSqlLiteral} that adapts a wails `ColumnDef`.
 * `driver` must be threaded through so provider-specific rules apply — most
 * importantly Postgres booleans (`col = 0` fails there with SQLSTATE 42804).
 */
export function toSqlLiteral(value: string, columnDef?: models.ColumnDef, driver?: string): string {
    return formatSqlLiteral(
        value,
        columnDef ? { dataType: columnDef.DataType, isNullable: columnDef.IsNullable } : undefined,
        driver,
    );
}

export function buildInsertScript(
    tableName: string,
    columns: string[],
    draftRows: DraftRow[],
    columnDefs: models.ColumnDef[],
    sourceQuery?: string,
    options?: ParseTableReferenceOptions,
    driver?: string,
): string {
    const qualifiedTable = resolveQualifiedTableName(sourceQuery, tableName, options, driver);
    const defsByName = new Map(columnDefs.map(column => [column.Name, column]));
    const columnList = columns.map(column => quoteIdent(column, driver)).join(', ');

    return draftRows
        .map(draftRow => {
            const valuesSql = draftRow.values
                .map((value, index) => toSqlLiteral(value, defsByName.get(columns[index]), driver))
                .join(', ');
            return `INSERT INTO ${qualifiedTable} (${columnList}) VALUES (${valuesSql});`;
        })
        .join('\n');
}
