// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';

export type ForeignKeyRule = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

export const FK_RULE_OPTIONS: ForeignKeyRule[] = [
    'NO ACTION',
    'RESTRICT',
    'CASCADE',
    'SET NULL',
    'SET DEFAULT',
];

export interface ForeignKeyDraft {
    name: string;
    columns: string[];
    refSchema: string;
    refTable: string;
    refColumns: string[];
    onDelete: ForeignKeyRule;
    onUpdate: ForeignKeyRule;
}

export interface ForeignKeyRowState {
    id: string;
    original: ForeignKeyDraft;
    current: ForeignKeyDraft;
    deleted: boolean;
    isNew?: boolean;
}

export const normalizeForeignKeyRule = (value: string | undefined): ForeignKeyRule => {
    const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (FK_RULE_OPTIONS.includes(normalized as ForeignKeyRule)) {
        return normalized as ForeignKeyRule;
    }
    return 'NO ACTION';
};

export const cloneForeignKeyDraft = (draft: ForeignKeyDraft): ForeignKeyDraft => ({
    name: draft.name,
    columns: [...draft.columns],
    refSchema: draft.refSchema,
    refTable: draft.refTable,
    refColumns: [...draft.refColumns],
    onDelete: draft.onDelete,
    onUpdate: draft.onUpdate,
});

export const mapFromForeignKeyInfo = (fk: models.ForeignKeyInfo): ForeignKeyDraft => ({
    name: fk.Name || '',
    columns: [...(fk.Columns || [])],
    refSchema: fk.RefSchema || '',
    refTable: fk.RefTable || '',
    refColumns: [...(fk.RefColumns || [])],
    onDelete: normalizeForeignKeyRule(fk.OnDelete),
    onUpdate: normalizeForeignKeyRule(fk.OnUpdate),
});

export const toForeignKeyPayload = (fk: ForeignKeyDraft): models.ForeignKeyInfo => ({
    Name: fk.name.trim(),
    Columns: [...fk.columns],
    RefSchema: fk.refSchema.trim(),
    RefTable: fk.refTable.trim(),
    RefColumns: [...fk.refColumns],
    OnDelete: fk.onDelete,
    OnUpdate: fk.onUpdate,
});

export const isForeignKeyDirty = (row: ForeignKeyRowState): boolean => {
    if (row.deleted) return true;
    return JSON.stringify(row.original) !== JSON.stringify(row.current);
};

export const isEmptyForeignKeyDraft = (fk: ForeignKeyDraft): boolean =>
    !fk.name.trim() &&
    fk.columns.length === 0 &&
    !fk.refSchema.trim() &&
    !fk.refTable.trim() &&
    fk.refColumns.length === 0;

export const toRefCacheKey = (fkSchema: string, fkTable: string) => `${fkSchema}.${fkTable}`;
