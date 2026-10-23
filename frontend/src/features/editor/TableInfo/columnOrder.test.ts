// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { models } from '../../../../wailsjs/go/models';

import { buildPersistedColumnOrder, hasManualColumnReorder } from './columnOrder';
import type { RowState } from './types';

function makeColumn(name: string): models.ColumnDef {
    return {
        Name: name,
        DataType: 'text',
        DefaultValue: '',
        IsNullable: true,
        IsPrimaryKey: false,
    };
}

function makeRow(name: string, originalIndex: number, overrides?: Partial<RowState>): RowState {
    const column = makeColumn(name);
    return {
        id: `col-${originalIndex}-${name}`,
        original: { ...column },
        current: { ...column },
        deleted: false,
        originalIndex,
        ...overrides,
    };
}

describe('column order helpers', () => {
    it('detects manual reorder of existing columns', () => {
        const rows = [makeRow('id', 0), makeRow('name', 2), makeRow('email', 1)];
        expect(hasManualColumnReorder(rows)).toBe(true);
    });

    it('ignores add and delete changes when existing order stays stable', () => {
        const rows = [
            makeRow('id', 0),
            makeRow('name', 1, { deleted: true }),
            makeRow('email', 2),
            {
                id: 'new-created_at',
                original: makeColumn('created_at'),
                current: makeColumn('created_at'),
                deleted: false,
                isNew: true,
            } satisfies RowState,
        ];
        expect(hasManualColumnReorder(rows)).toBe(false);
    });

    it('builds persisted order from non-deleted rows using current names', () => {
        const rows = [
            makeRow('id', 0),
            makeRow('name', 1, {
                current: { ...makeColumn('display_name'), Name: 'display_name' },
            }),
            makeRow('email', 2, { deleted: true }),
        ];

        expect(buildPersistedColumnOrder(rows)).toEqual(['id', 'display_name']);
    });
});
