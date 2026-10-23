// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';

export type FKRule = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

export const FK_RULE_OPTIONS: FKRule[] = [
    'NO ACTION',
    'RESTRICT',
    'CASCADE',
    'SET NULL',
    'SET DEFAULT',
];

export interface FKDraft {
    name: string;
    columns: string[];
    refSchema: string;
    refTable: string;
    refColumns: string[];
    onDelete: FKRule;
    onUpdate: FKRule;
}

export interface FKRowState {
    id: string;
    original: FKDraft;
    current: FKDraft;
    deleted: boolean;
    isNew?: boolean;
}

export type EditField =
    | 'name'
    | 'columns'
    | 'refSchema'
    | 'refTable'
    | 'refColumns'
    | 'onDelete'
    | 'onUpdate';

export const normalizeFKRule = (value: string | undefined): FKRule => {
    const n = (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    return FK_RULE_OPTIONS.includes(n as FKRule) ? (n as FKRule) : 'NO ACTION';
};

export const cloneFKDraft = (d: FKDraft): FKDraft => ({
    name: d.name,
    columns: [...d.columns],
    refSchema: d.refSchema,
    refTable: d.refTable,
    refColumns: [...d.refColumns],
    onDelete: d.onDelete,
    onUpdate: d.onUpdate,
});

export const mapFromFKInfo = (fk: models.ForeignKeyInfo): FKDraft => ({
    name: fk.Name || '',
    columns: [...(fk.Columns || [])],
    refSchema: fk.RefSchema || '',
    refTable: fk.RefTable || '',
    refColumns: [...(fk.RefColumns || [])],
    onDelete: normalizeFKRule(fk.OnDelete),
    onUpdate: normalizeFKRule(fk.OnUpdate),
});

export const toFKPayload = (fk: FKDraft): models.ForeignKeyInfo => ({
    Name: fk.name.trim(),
    Columns: [...fk.columns],
    RefSchema: fk.refSchema.trim(),
    RefTable: fk.refTable.trim(),
    RefColumns: [...fk.refColumns],
    OnDelete: fk.onDelete,
    OnUpdate: fk.onUpdate,
});

export const isFKDirty = (row: FKRowState): boolean =>
    row.deleted || JSON.stringify(row.original) !== JSON.stringify(row.current);

export const isEmptyFKDraft = (fk: FKDraft): boolean =>
    !fk.name.trim() &&
    fk.columns.length === 0 &&
    !fk.refSchema.trim() &&
    !fk.refTable.trim() &&
    fk.refColumns.length === 0;

export const toRefCacheKey = (s: string, t: string) => `${s}.${t}`;
export const normalizeIdent = (value: string) => value.trim().toLowerCase();
