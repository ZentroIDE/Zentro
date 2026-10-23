// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../wailsjs/go/models';

export type ReferentialAction = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

/**
 * What a referencing foreign key does to the child rows when a parent row goes:
 * - `blocking`: NO ACTION / RESTRICT, the delete fails while child rows exist.
 * - `cascade`: CASCADE, the child rows are deleted too.
 * - `nullify`: SET NULL / SET DEFAULT, the child rows survive but lose the link.
 */
export type ImpactSeverity = 'blocking' | 'cascade' | 'nullify';

/**
 * What the data says about a relationship, as opposed to the schema. Set once
 * the child table has actually been looked at; absent when only the schema is known.
 */
export type RowImpact =
    /** Rows in the child table really reference the keys being deleted. */
    | { status: 'referenced'; count: number; hasMore: boolean }
    /** The check could not be made, so the rows may well be referenced. */
    | { status: 'unverified'; reason?: string };

export interface IncomingRelationship {
    /** Stable identity for React keys: source table + constraint. */
    key: string;
    sourceSchema: string;
    sourceTable: string;
    constraintName: string;
    /** Columns on the referencing (child) table. */
    columns: string[];
    /** Child column -> the parent column it points at, one entry per distinct pair. */
    columnPairs: ColumnPair[];
    /**
     * Every child column maps to exactly one parent column and vice versa. False
     * when the backend's rows for a composite key are ambiguous (the Postgres
     * query can return every child/parent column combination), in which case
     * the pairs cannot be trusted to build a lookup.
     */
    hasUnambiguousColumnMapping: boolean;
    onDelete: ReferentialAction;
    severity: ImpactSeverity;
    /** The table references itself (e.g. `parent_id`). */
    isSelfReference: boolean;
    rowImpact?: RowImpact;
}

export interface ColumnPair {
    source: string;
    target: string;
}

export interface DeleteTarget {
    schema: string;
    table: string;
}

export interface SummarizeOptions {
    /**
     * Self-referencing keys matter when deleting rows (a parent row can still be
     * referenced by its own children) but not when dropping the table, which
     * takes the constraint with it.
     */
    includeSelfReferences?: boolean;
}

const KNOWN_ACTIONS: ReferentialAction[] = [
    'NO ACTION',
    'RESTRICT',
    'CASCADE',
    'SET NULL',
    'SET DEFAULT',
];

const SEVERITY_ORDER: Record<ImpactSeverity, number> = { blocking: 0, cascade: 1, nullify: 2 };

export function normalizeReferentialAction(value: string | undefined): ReferentialAction {
    const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    return KNOWN_ACTIONS.includes(normalized as ReferentialAction)
        ? (normalized as ReferentialAction)
        : 'NO ACTION';
}

export function severityForAction(action: ReferentialAction): ImpactSeverity {
    if (action === 'CASCADE') return 'cascade';
    if (action === 'SET NULL' || action === 'SET DEFAULT') return 'nullify';
    return 'blocking';
}

const sameIdent = (a: string | undefined, b: string | undefined) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// A blank schema on either side means the driver has no schema concept (or the
// table reference could not be resolved to one), so the table name decides.
const sameSchema = (a: string | undefined, b: string | undefined) =>
    !(a ?? '').trim() || !(b ?? '').trim() || sameIdent(a, b);

function addPair(pairs: ColumnPair[], rel: models.TableRelationship) {
    if (!rel.SourceColumn || !rel.TargetColumn) return;
    if (pairs.some(p => p.source === rel.SourceColumn && p.target === rel.TargetColumn)) return;
    pairs.push({ source: rel.SourceColumn, target: rel.TargetColumn });
}

function isOneToOne(pairs: readonly ColumnPair[]): boolean {
    if (pairs.length === 0) return false;
    return (
        new Set(pairs.map(p => p.source)).size === pairs.length &&
        new Set(pairs.map(p => p.target)).size === pairs.length
    );
}

/**
 * Reduces the relationship rows the backend returns (both directions, one row
 * per column) to the foreign keys that point INTO `target`, one entry per
 * (child table, constraint) with its columns merged.
 */
export function summarizeIncomingRelationships(
    relationships: readonly models.TableRelationship[] | null | undefined,
    target: DeleteTarget,
    { includeSelfReferences = false }: SummarizeOptions = {},
): IncomingRelationship[] {
    const grouped = new Map<string, IncomingRelationship>();

    for (const rel of relationships ?? []) {
        if (
            !sameIdent(rel.TargetTable, target.table) ||
            !sameSchema(rel.TargetSchema, target.schema)
        ) {
            continue;
        }
        const isSelfReference =
            sameIdent(rel.SourceTable, target.table) && sameSchema(rel.SourceSchema, target.schema);
        if (isSelfReference && !includeSelfReferences) continue;

        const key = [rel.SourceSchema, rel.SourceTable, rel.ConstraintName]
            .map(part => (part ?? '').toLowerCase())
            .join('\u0000');
        const existing = grouped.get(key);
        if (existing) {
            // The Postgres relationship query can repeat a column for composite keys.
            if (rel.SourceColumn && !existing.columns.includes(rel.SourceColumn)) {
                existing.columns.push(rel.SourceColumn);
            }
            addPair(existing.columnPairs, rel);
            continue;
        }

        const onDelete = normalizeReferentialAction(rel.OnDelete);
        const entry: IncomingRelationship = {
            key,
            sourceSchema: rel.SourceSchema ?? '',
            sourceTable: rel.SourceTable ?? '',
            constraintName: rel.ConstraintName ?? '',
            columns: rel.SourceColumn ? [rel.SourceColumn] : [],
            columnPairs: [],
            hasUnambiguousColumnMapping: false,
            onDelete,
            severity: severityForAction(onDelete),
            isSelfReference,
        };
        addPair(entry.columnPairs, rel);
        grouped.set(key, entry);
    }

    for (const entry of grouped.values()) {
        entry.hasUnambiguousColumnMapping = isOneToOne(entry.columnPairs);
    }

    return Array.from(grouped.values()).sort(
        (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            a.sourceTable.localeCompare(b.sourceTable) ||
            a.constraintName.localeCompare(b.constraintName),
    );
}

/** The most serious severity in the list, or `null` when there is nothing to warn about. */
export function worstSeverity(items: readonly IncomingRelationship[]): ImpactSeverity | null {
    let worst: ImpactSeverity | null = null;
    for (const item of items) {
        if (worst === null || SEVERITY_ORDER[item.severity] < SEVERITY_ORDER[worst]) {
            worst = item.severity;
        }
    }
    return worst;
}
