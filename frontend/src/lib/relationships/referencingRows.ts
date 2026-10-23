// SPDX-License-Identifier: GPL-3.0-only

import { quoteIdent } from '../driverCapabilities';
import type { models } from '../../../wailsjs/go/models';
import type { ColumnPair, IncomingRelationship } from './deleteImpact';

type ReferencingRowsProbe = models.ReferencingRowsProbe;

/** Distinct key values put into the generated WHERE, so a huge delete does not build a huge query. */
export const MAX_LOOKUP_KEYS = 200;

export type ReferencingRowsPlan =
    | { ok: true; sql: string; keyCount: number; totalKeyCount: number }
    | { ok: false; reason: string };

export interface PlanReferencingRowsInput {
    relationship: IncomingRelationship;
    driver: string | undefined;
    /** Columns of the result the rows are being deleted from. */
    resultColumns: string[];
    /** Original values of each row being deleted, aligned to `resultColumns`; `undefined` when not loaded. */
    deletedRows: ReadonlyArray<readonly string[] | undefined>;
    /** Indexes into `resultColumns` that the grid hides behind a blur. */
    blurredColumnIndexes?: ReadonlySet<number>;
    /** Formats one value as a SQL literal for the given parent column. */
    literal: (parentColumn: string, value: string) => string;
    maxKeys?: number;
}

const qualified = (schema: string, table: string, driver: string | undefined) =>
    schema
        ? `${quoteIdent(schema, driver)}.${quoteIdent(table, driver)}`
        : quoteIdent(table, driver);

type LocatedKeyColumns = { ok: true; indexes: number[] } | { ok: false; reason: string };

/**
 * Finds, in the result the rows are being deleted from, the columns the
 * foreign key points at. Fails when the join columns cannot be trusted or the
 * result does not carry them (the keys are read from the result by name, and
 * are not necessarily the primary key).
 */
function locateKeyColumns(
    relationship: IncomingRelationship,
    resultColumns: readonly string[],
): LocatedKeyColumns {
    if (!relationship.hasUnambiguousColumnMapping) {
        return { ok: false, reason: "Couldn't tell which columns this key joins on." };
    }
    const indexes: number[] = [];
    for (const pair of relationship.columnPairs) {
        const index = resultColumns.indexOf(pair.target);
        if (index === -1) {
            return { ok: false, reason: `"${pair.target}" is not a column of this result.` };
        }
        indexes.push(index);
    }
    return { ok: true, indexes };
}

interface ReferencedKeys {
    /** Each distinct key as the grid holds it, aligned to the relationship's column pairs. */
    values: string[][];
    /** The same keys as SQL literals. */
    literals: string[][];
}

/** The distinct, non-NULL key tuples of the rows being deleted. */
function collectReferencedKeys(
    pairs: readonly ColumnPair[],
    indexes: readonly number[],
    deletedRows: ReadonlyArray<readonly string[] | undefined>,
    literal: (parentColumn: string, value: string) => string,
): ReferencedKeys {
    const seen = new Set<string>();
    const values: string[][] = [];
    const literals: string[][] = [];
    for (const row of deletedRows) {
        if (!row) continue;
        const rawTuple = pairs.map((_, i) => row[indexes[i]] ?? '');
        const literalTuple = pairs.map((pair, i) => literal(pair.target, rawTuple[i]));
        // A NULL never matches a foreign key, so it cannot be referenced.
        if (literalTuple.some(value => value === 'NULL')) continue;
        const identity = literalTuple.join('\u0000');
        if (seen.has(identity)) continue;
        seen.add(identity);
        values.push(rawTuple);
        literals.push(literalTuple);
    }
    return { values, literals };
}

export type ReferencingProbePlan =
    | { ok: true; probe: ReferencingRowsProbe }
    | { ok: false; reason: string };

/**
 * The question to put to the database for one relationship: do rows of the
 * child table still reference the keys of the rows being deleted? `Keys` is
 * empty when none of the deleted rows carries a key that could be referenced,
 * which needs no lookup.
 */
export function buildReferencingProbe({
    relationship,
    resultColumns,
    deletedRows,
    literal,
}: Pick<
    PlanReferencingRowsInput,
    'relationship' | 'resultColumns' | 'deletedRows' | 'literal'
>): ReferencingProbePlan {
    const located = locateKeyColumns(relationship, resultColumns);
    if (!located.ok) return located;

    const pairs = relationship.columnPairs;
    const { values } = collectReferencedKeys(pairs, located.indexes, deletedRows, literal);
    return {
        ok: true,
        probe: {
            Key: relationship.key,
            Schema: relationship.sourceSchema,
            Table: relationship.sourceTable,
            Columns: pairs.map(pair => pair.source),
            Keys: values,
        },
    };
}

/**
 * Builds the query that shows which rows of the referencing table point at the
 * rows being deleted: `SELECT * FROM child WHERE fk IN (<the parent keys>)`.
 *
 * The keys are the parent columns the foreign key references, which are not
 * necessarily the primary key, so they are read out of the result by name.
 * Returns the reason instead of a query when one cannot be built safely.
 */
export function planReferencingRowsQuery({
    relationship,
    driver,
    resultColumns,
    deletedRows,
    blurredColumnIndexes,
    literal,
    maxKeys = MAX_LOOKUP_KEYS,
}: PlanReferencingRowsInput): ReferencingRowsPlan {
    const located = locateKeyColumns(relationship, resultColumns);
    if (!located.ok) return located;
    // The values end up as literals in a visible editor tab, which would defeat the blur.
    for (const [i, index] of located.indexes.entries()) {
        if (blurredColumnIndexes?.has(index)) {
            const column = relationship.columnPairs[i].target;
            return { ok: false, reason: `"${column}" is blurred. Unblur it to view rows.` };
        }
    }

    const pairs = relationship.columnPairs;
    const keys = collectReferencedKeys(pairs, located.indexes, deletedRows, literal).literals;

    if (keys.length === 0) {
        return { ok: false, reason: 'No referenced values to look up.' };
    }

    const used = keys.slice(0, maxKeys);
    const child = qualified(relationship.sourceSchema, relationship.sourceTable, driver);
    const columns = pairs.map(pair => quoteIdent(pair.source, driver));
    const where =
        columns.length === 1
            ? `${columns[0]} IN (${used.map(key => key[0]).join(', ')})`
            : // Row-value IN is not portable (SQL Server), so spell it out.
              used
                  .map(
                      key =>
                          `(${columns.map((column, i) => `${column} = ${key[i]}`).join(' AND ')})`,
                  )
                  .join('\n   OR ');
    const note =
        keys.length > used.length
            ? `-- Showing rows for the first ${used.length} of ${keys.length} deleted keys.\n`
            : '';

    return {
        ok: true,
        sql: `${note}SELECT * FROM ${child} WHERE ${where};`,
        keyCount: used.length,
        totalKeyCount: keys.length,
    };
}
