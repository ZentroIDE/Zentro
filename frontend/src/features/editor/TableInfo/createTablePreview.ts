// SPDX-License-Identifier: GPL-3.0-only

import { DRIVER } from '../../../lib/constants';
import { quoteIdent } from '../../../lib/contextSearchTemplates';
import { models } from '../../../../wailsjs/go/models';

function firstType(column: models.ColumnDef): string {
    return (column.FullDataType || column.DataType || '').trim();
}

function quotePostgresRegclassPart(value: string): string {
    return /^[a-z_][a-z0-9_$]*$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`;
}

function formatPostgresRegclass(schema: string, objectName: string): string {
    if (!schema.trim()) return quotePostgresRegclassPart(objectName);
    return `${quotePostgresRegclassPart(schema)}.${quotePostgresRegclassPart(objectName)}`;
}

function normalizePostgresColumn(
    schema: string,
    tableName: string,
    column: models.ColumnDef,
): models.ColumnDef {
    const normalizedType = firstType(column).toLowerCase();
    if (
        normalizedType !== 'serial' &&
        normalizedType !== 'bigserial' &&
        normalizedType !== 'smallserial'
    ) {
        return new models.ColumnDef({
            ...column,
            FullDataType: firstType(column),
        });
    }

    const fullDataType =
        normalizedType === 'bigserial'
            ? 'bigint'
            : normalizedType === 'smallserial'
              ? 'smallint'
              : 'integer';

    return new models.ColumnDef({
        ...column,
        DataType: fullDataType,
        FullDataType: fullDataType,
        DefaultValue: '',
        GenerationKind: 'sequence',
        IdentityGeneration: '',
        SequenceSchema: schema,
        SequenceName: `${tableName}_${column.Name}_seq`,
    });
}

function formatPostgresColumnDefault(column: models.ColumnDef): string {
    if (
        column.GenerationKind?.toLowerCase() === 'sequence' &&
        column.SequenceSchema?.trim() &&
        column.SequenceName?.trim()
    ) {
        return `nextval('${formatPostgresRegclass(column.SequenceSchema, column.SequenceName)}'::regclass)`;
    }
    return column.DefaultValue?.trim() || '';
}

function formatPostgresColumnDefinition(column: models.ColumnDef): string {
    const parts = [quoteIdent(column.Name, DRIVER.POSTGRES), firstType(column)];
    parts.push(column.IsNullable ? 'NULL' : 'NOT NULL');
    const defaultValue = formatPostgresColumnDefault(column);
    if (defaultValue) {
        parts.push(`DEFAULT ${defaultValue}`);
    }
    return parts.join(' ');
}

function buildGenericCreatePreview(
    driver: string | undefined,
    schema: string,
    tableName: string,
    columns: models.ColumnDef[],
): string[] {
    const qualifiedTable = `${quoteIdent(schema, driver)}.${quoteIdent(tableName, driver)}`;
    const pkColumns = columns
        .filter(column => column.IsPrimaryKey)
        .map(column => quoteIdent(column.Name, driver));
    const body = columns.map(
        column =>
            `    ${quoteIdent(column.Name, driver)} ${firstType(column)} ${column.IsNullable ? 'NULL' : 'NOT NULL'}${column.DefaultValue?.trim() ? ` DEFAULT ${column.DefaultValue.trim()}` : ''}`,
    );

    if (pkColumns.length > 0) {
        body.push(`    PRIMARY KEY (${pkColumns.join(', ')})`);
    }

    return [`CREATE TABLE ${qualifiedTable} (`, body.join(',\n'), ');'];
}

function buildPostgresCreatePreview(
    schema: string,
    tableName: string,
    columns: models.ColumnDef[],
): string[] {
    const normalizedColumns = columns.map(column =>
        normalizePostgresColumn(schema, tableName, column),
    );
    const qualifiedTable = `${quoteIdent(schema, DRIVER.POSTGRES)}.${quoteIdent(tableName, DRIVER.POSTGRES)}`;
    const sequenceLines: string[] = [];
    const ownedByLines: string[] = [];
    const seenSequences = new Set<string>();

    for (const column of normalizedColumns) {
        if (
            column.GenerationKind?.toLowerCase() !== 'sequence' ||
            !column.SequenceSchema?.trim() ||
            !column.SequenceName?.trim()
        ) {
            continue;
        }

        const sequenceKey = `${column.SequenceSchema}.${column.SequenceName}`;
        if (seenSequences.has(sequenceKey)) continue;
        seenSequences.add(sequenceKey);

        const qualifiedSequence = `${quoteIdent(column.SequenceSchema, DRIVER.POSTGRES)}.${quoteIdent(column.SequenceName, DRIVER.POSTGRES)}`;
        sequenceLines.push(`CREATE SEQUENCE ${qualifiedSequence};`);
        ownedByLines.push(
            `ALTER SEQUENCE ${qualifiedSequence} OWNED BY ${qualifiedTable}.${quoteIdent(column.Name, DRIVER.POSTGRES)};`,
        );
    }

    const pkColumns = normalizedColumns
        .filter(column => column.IsPrimaryKey)
        .map(column => quoteIdent(column.Name, DRIVER.POSTGRES));
    const body = normalizedColumns.map(column => `    ${formatPostgresColumnDefinition(column)}`);
    if (pkColumns.length > 0) {
        body.push(`    PRIMARY KEY (${pkColumns.join(', ')})`);
    }

    return [
        ...sequenceLines,
        `CREATE TABLE ${qualifiedTable} (`,
        body.join(',\n'),
        ');',
        ...ownedByLines,
    ];
}

export function buildCreateTablePreviewLines(
    driver: string | undefined,
    schema: string,
    tableName: string,
    columns: models.ColumnDef[],
): string[] {
    if (!schema.trim() || !tableName.trim() || columns.length === 0) return [];
    if ((driver || '').toLowerCase() === DRIVER.POSTGRES) {
        return buildPostgresCreatePreview(schema, tableName, columns);
    }
    return buildGenericCreatePreview(driver, schema, tableName, columns);
}
