// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
    blurredColumnIndexesToTableState,
    legacyDeletedRowsToTableState,
    legacyEditedCellsToTableState,
    legacySelectedCellsToTableState,
    legacySelectedRowKeysToTableState,
    tableDeletedRowsToLegacyState,
    tableEditedCellsToLegacyState,
    tableSelectedCellsToLegacyState,
    tableSelectedRowKeysToLegacyState,
} from './resultFormatMigration';

describe('resultFormatMigration', () => {
    it('converts legacy edited cells to table state and back for persisted rows', () => {
        const legacyEditedCells = new Map([
            ['0:1', 'Alice 2'],
            ['1:0', '2'],
        ]);
        const columns = ['id', 'name'];

        const tableEditedCells = legacyEditedCellsToTableState(legacyEditedCells, columns);

        expect(tableEditedCells).toEqual({
            'p:0::name': 'Alice 2',
            'p:1::id': '2',
        });
        expect(tableEditedCellsToLegacyState(tableEditedCells, columns)).toEqual(legacyEditedCells);
    });

    it('drops non-persisted table edit rows when converting back to legacy state', () => {
        expect(
            tableEditedCellsToLegacyState(
                {
                    'p:0::name': 'Alice 2',
                    'd:draft-1::name': 'Draft',
                },
                ['id', 'name'],
            ),
        ).toEqual(new Map([['0:1', 'Alice 2']]));
    });

    it('converts deleted rows to keyed row state and back', () => {
        const deletedRows = new Set([0, 4]);

        expect(legacyDeletedRowsToTableState(deletedRows)).toEqual({
            'p:0': true,
            'p:4': true,
        });
        expect(
            tableDeletedRowsToLegacyState({
                'p:0': true,
                'p:4': true,
                'd:draft-1': true,
            }),
        ).toEqual(deletedRows);
    });

    it('converts selected cells to table state and back', () => {
        const selectedCells = new Set(['p:0|1', 'd:draft-1|0']);
        const columns = ['id', 'name'];

        const tableSelectedCells = legacySelectedCellsToTableState(selectedCells, columns);

        expect(tableSelectedCells).toEqual({
            'p:0::name': true,
            'd:draft-1::id': true,
        });
        expect(tableSelectedCellsToLegacyState(tableSelectedCells, columns)).toEqual(selectedCells);
    });

    it('converts selected row keys to table state and back', () => {
        const selectedRowKeys = new Set(['p:0', 'd:draft-1']);

        const tableSelectedRowKeys = legacySelectedRowKeysToTableState(selectedRowKeys);

        expect(tableSelectedRowKeys).toEqual({
            'p:0': true,
            'd:draft-1': true,
        });
        expect(tableSelectedRowKeysToLegacyState(tableSelectedRowKeys)).toEqual(selectedRowKeys);
    });

    it('converts blurred column indexes to table state only when provided', () => {
        expect(blurredColumnIndexesToTableState(new Set([1, 3]))).toEqual({
            1: true,
            3: true,
        });
        expect(blurredColumnIndexesToTableState(undefined)).toBeUndefined();
    });
});
