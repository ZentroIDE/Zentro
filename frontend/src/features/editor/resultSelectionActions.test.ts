// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { DraftRow } from '../../lib/dataEditing';
import { makeCellId } from './resultPanelUtils';
import {
    applyClipboardPaste,
    applySetNullToSelection,
    buildSelectByPrimaryKeyQuery,
    buildRowAsUpdateStatement,
    buildRowSelectionMatrix,
    buildSelectionMatrix,
    buildWhereClauseByPrimaryKeys,
    buildWhereClauseBySelectionIn,
    matrixToTsv,
    selectionSpanTouchesBlurredColumn,
    selectionTouchesBlurredColumn,
} from './resultSelectionActions';

describe('blurred column selection guards', () => {
    const rowOrder = new Map<string, number>([
        ['p:0', 0],
        ['p:1', 1],
    ]);

    it('detects a selected cell in a blurred column', () => {
        const selection = new Set([makeCellId('p:0', 0), makeCellId('p:1', 2)]);
        expect(selectionTouchesBlurredColumn(selection, new Set([2]))).toBe(true);
        expect(selectionTouchesBlurredColumn(selection, new Set([1]))).toBe(false);
    });

    it('never blocks when nothing is blurred', () => {
        const selection = new Set([makeCellId('p:0', 0)]);
        expect(selectionTouchesBlurredColumn(selection, undefined)).toBe(false);
        expect(selectionTouchesBlurredColumn(selection, new Set())).toBe(false);
        expect(selectionSpanTouchesBlurredColumn(selection, rowOrder, new Set())).toBe(false);
    });

    it('flags a blurred column that sits between the outermost selected cells', () => {
        const selection = new Set([makeCellId('p:0', 0), makeCellId('p:1', 2)]);
        // Column 1 is not selected, but an INSERT over columns 0..2 would still emit it.
        expect(selectionTouchesBlurredColumn(selection, new Set([1]))).toBe(false);
        expect(selectionSpanTouchesBlurredColumn(selection, rowOrder, new Set([1]))).toBe(true);
        expect(selectionSpanTouchesBlurredColumn(selection, rowOrder, new Set([3]))).toBe(false);
    });
});

describe('editing blurred columns', () => {
    const displayRows = [
        {
            key: 'p:0',
            kind: 'persisted' as const,
            persistedIndex: 0,
            values: ['1', 'a@x.com', 'A'],
        },
    ];
    const rowOrder = new Map([['p:0', 0]]);

    it('paste leaves blurred cells untouched and reports how many it skipped', () => {
        const result = applyClipboardPaste({
            text: 'X',
            selectedCells: new Set([makeCellId('p:0', 0), makeCellId('p:0', 1)]),
            displayRows,
            rowOrder,
            editedCells: new Map(),
            draftRows: [],
            deletedRows: new Set(),
            columnCount: 3,
            mode: 'fill-selected',
            blurredColumnIndexes: new Set([1]),
        });

        expect(result?.nextEdited.get('0:0')).toBe('X');
        expect(result?.nextEdited.has('0:1')).toBe(false);
        expect(result?.blurredSkippedCount).toBe(1);
        expect(Array.from(result?.pastedCells ?? [])).toEqual([makeCellId('p:0', 0)]);
    });

    it('anchor paste skips blurred columns inside the pasted block', () => {
        const result = applyClipboardPaste({
            text: 'a\tb\tc',
            selectedCells: new Set([makeCellId('p:0', 0)]),
            displayRows,
            rowOrder,
            editedCells: new Map(),
            draftRows: [],
            deletedRows: new Set(),
            columnCount: 3,
            mode: 'anchor',
            blurredColumnIndexes: new Set([1]),
        });

        expect(result?.nextEdited.get('0:0')).toBe('a');
        expect(result?.nextEdited.has('0:1')).toBe(false);
        expect(result?.nextEdited.get('0:2')).toBe('c');
        expect(result?.blurredSkippedCount).toBe(1);
    });

    it('Set NULL skips blurred cells separately from non-nullable ones', () => {
        const result = applySetNullToSelection({
            selectedCells: new Set([
                makeCellId('p:0', 0),
                makeCellId('p:0', 1),
                makeCellId('p:0', 2),
            ]),
            displayRowsByKey: new Map(displayRows.map(row => [row.key, row])),
            editedCells: new Map(),
            draftRows: [],
            nullableByColumnIndex: [false, true, true],
            blurredColumnIndexes: new Set([1]),
        });

        expect(result.updatedCount).toBe(1);
        expect(result.nextEdited.get('0:2')).toBe('');
        expect(result.nextEdited.has('0:1')).toBe(false);
        expect(result.skippedCount).toBe(1);
        expect(result.blurredSkippedCount).toBe(1);
    });
});

describe('resultSelectionActions', () => {
    it('builds matrix from selection and serializes to TSV', () => {
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'A'],
            },
            {
                key: 'p:1',
                kind: 'persisted' as const,
                persistedIndex: 1,
                values: ['2', 'B'],
            },
        ];
        const selectedCells = new Set<string>([makeCellId('p:0', 0), makeCellId('p:1', 1)]);
        const rowOrder = new Map<string, number>([
            ['p:0', 0],
            ['p:1', 1],
        ]);
        const editedCells = new Map<string, string>([['1:1', 'BB']]);

        const matrix = buildSelectionMatrix({
            selectedCells,
            displayRows,
            rowOrder,
            editedCells,
        });

        expect(matrix).toEqual([
            ['1', ''],
            ['', 'BB'],
        ]);
        expect(matrixToTsv(matrix)).toBe('1\t\n\tBB');
    });

    it('applies clipboard paste to pending edits/drafts only', () => {
        const selectedCells = new Set<string>([makeCellId('p:0', 0)]);
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'Alice'],
            },
            {
                key: 'd:draft-1',
                kind: 'draft' as const,
                values: ['x', 'y'],
                draft: { id: 'draft-1' },
            },
        ];
        const rowOrder = new Map<string, number>([
            ['p:0', 0],
            ['d:draft-1', 1],
        ]);
        const editedCells = new Map<string, string>();
        const draftRows: DraftRow[] = [
            {
                id: 'draft-1',
                kind: 'new',
                values: ['x', 'y'],
                insertAfterRowIndex: null,
            },
        ];

        const pasted = applyClipboardPaste({
            text: '9\tZ\n7\tW',
            selectedCells,
            displayRows,
            rowOrder,
            editedCells,
            draftRows,
            deletedRows: new Set<number>(),
            columnCount: 2,
            mode: 'anchor',
        });

        expect(pasted).not.toBeNull();
        expect(pasted?.nextEdited.get('0:0')).toBe('9');
        expect(pasted?.nextEdited.get('0:1')).toBe('Z');
        expect(pasted?.nextDraftRows[0].values).toEqual(['7', 'W']);
        expect(pasted?.pastedCells.has(makeCellId('p:0', 0))).toBe(true);
        expect(pasted?.pastedCells.has(makeCellId('d:draft-1', 1))).toBe(true);
        expect(draftRows[0].values).toEqual(['x', 'y']);
        expect(editedCells.size).toBe(0);
    });

    it('fills all selected cells from a single clipboard value', () => {
        const selectedCells = new Set<string>([makeCellId('p:0', 0), makeCellId('p:1', 1)]);
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'Alice'],
            },
            {
                key: 'p:1',
                kind: 'persisted' as const,
                persistedIndex: 1,
                values: ['2', 'Bob'],
            },
        ];
        const rowOrder = new Map<string, number>([
            ['p:0', 0],
            ['p:1', 1],
        ]);

        const pasted = applyClipboardPaste({
            text: 'NULL',
            selectedCells,
            displayRows,
            rowOrder,
            editedCells: new Map<string, string>(),
            draftRows: [],
            deletedRows: new Set<number>(),
            columnCount: 2,
            mode: 'fill-selected',
        });

        expect(pasted?.nextEdited.get('0:0')).toBe('NULL');
        expect(pasted?.nextEdited.get('1:1')).toBe('NULL');
        expect(Array.from(pasted?.pastedCells ?? [])).toEqual(['p:0|0', 'p:1|1']);
    });

    it('fills irregular selections by selection order for multi-cell clipboard data', () => {
        const selectedCells = new Set<string>([
            makeCellId('p:1', 1),
            makeCellId('p:0', 0),
            makeCellId('p:1', 0),
        ]);
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'Alice'],
            },
            {
                key: 'p:1',
                kind: 'persisted' as const,
                persistedIndex: 1,
                values: ['2', 'Bob'],
            },
        ];
        const rowOrder = new Map<string, number>([
            ['p:0', 0],
            ['p:1', 1],
        ]);

        const pasted = applyClipboardPaste({
            text: 'X\tY\tZ',
            selectedCells,
            displayRows,
            rowOrder,
            editedCells: new Map<string, string>(),
            draftRows: [],
            deletedRows: new Set<number>(),
            columnCount: 2,
            mode: 'fill-selected',
        });

        expect(pasted?.nextEdited.get('1:1')).toBe('X');
        expect(pasted?.nextEdited.get('0:0')).toBe('Y');
        expect(pasted?.nextEdited.get('1:0')).toBe('Z');
    });

    it('sets NULL only on nullable cells and skips non-nullable cells', () => {
        const selectedCells = new Set<string>([
            makeCellId('p:0', 0),
            makeCellId('p:0', 1),
            makeCellId('d:draft-1', 0),
            makeCellId('d:draft-1', 1),
        ]);
        const displayRowsByKey = new Map([
            [
                'p:0',
                {
                    key: 'p:0',
                    kind: 'persisted' as const,
                    persistedIndex: 0,
                    values: ['v0', 'v1'],
                },
            ],
            [
                'd:draft-1',
                {
                    key: 'd:draft-1',
                    kind: 'draft' as const,
                    values: ['x', 'y'],
                    draft: { id: 'draft-1' },
                },
            ],
        ]);
        const editedCells = new Map<string, string>();
        const draftRows: DraftRow[] = [
            {
                id: 'draft-1',
                kind: 'new',
                values: ['x', 'y'],
                insertAfterRowIndex: null,
            },
        ];

        const result = applySetNullToSelection({
            selectedCells,
            displayRowsByKey,
            editedCells,
            draftRows,
            nullableByColumnIndex: [true, false],
        });

        expect(result.updatedCount).toBe(2);
        expect(result.skippedCount).toBe(2);
        expect(result.nextEdited.get('0:0')).toBe('');
        expect(result.nextDraftRows[0].values).toEqual(['', 'y']);
        expect(result.updatedCells.has(makeCellId('p:0', 1))).toBe(false);
        expect(result.updatedCells.has(makeCellId('d:draft-1', 1))).toBe(false);
    });

    it('builds UPDATE statements for each selected persisted row with row-specific PK values', () => {
        const selectedCells = new Set<string>([makeCellId('p:0', 0), makeCellId('p:1', 0)]);
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'Alice', 'A1'],
            },
            {
                key: 'p:1',
                kind: 'persisted' as const,
                persistedIndex: 1,
                values: ['2', 'Bob', 'B2'],
            },
        ];
        const rowOrder = new Map<string, number>([
            ['p:0', 0],
            ['p:1', 1],
        ]);
        const editedCells = new Map<string, string>([
            ['0:1', 'Alice X'],
            ['1:2', 'B9'],
        ]);

        const sql = buildRowAsUpdateStatement({
            selectedCells,
            displayRows,
            rowOrder,
            editedCells,
            columns: ['id', 'name', 'code'],
            pkColumns: ['id'],
            tableName: 'users',
            driver: 'postgres',
        });

        expect(sql).toContain('"id" = \'1\'');
        expect(sql).toContain('"id" = \'2\'');
        expect(sql).toContain('"name" = \'Alice X\'');
        expect(sql).toContain('"code" = \'B9\'');
        expect(sql.match(/UPDATE "users"/g)?.length).toBe(2);
    });

    it('applies column types to generated UPDATE literals (bool keyword + bare number)', () => {
        const selectedCells = new Set<string>([makeCellId('p:0', 0)]);
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'true', '42'],
            },
        ];
        const rowOrder = new Map<string, number>([['p:0', 0]]);

        const sql = buildRowAsUpdateStatement({
            selectedCells,
            displayRows,
            rowOrder,
            editedCells: new Map<string, string>([
                ['0:1', 'false'],
                ['0:2', '99'],
            ]),
            columns: ['id', 'active', 'score'],
            pkColumns: ['id'],
            tableName: 'attendance',
            driver: 'postgres',
            columnTypes: new Map([
                ['id', { dataType: 'integer' }],
                ['active', { dataType: 'boolean' }],
                ['score', { dataType: 'numeric' }],
            ]),
        });

        expect(sql).toContain('"active" = FALSE');
        expect(sql).toContain('"score" = 99');
        expect(sql).toContain('"id" = 1');
        expect(sql).not.toContain("'false'");
    });

    it('keeps the legacy quoted-string behavior when no column types are supplied', () => {
        const selectedCells = new Set<string>([makeCellId('p:0', 0)]);
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'true'],
            },
        ];
        const sql = buildRowAsUpdateStatement({
            selectedCells,
            displayRows,
            rowOrder: new Map<string, number>([['p:0', 0]]),
            editedCells: new Map<string, string>([['0:1', 'false']]),
            columns: ['id', 'active'],
            pkColumns: ['id'],
            tableName: 'attendance',
            driver: 'postgres',
        });
        expect(sql).toContain('"active" = \'false\'');
        expect(sql).toContain('"id" = \'1\'');
    });

    it('builds WHERE clause from selected persisted rows by primary key', () => {
        const clause = buildWhereClauseByPrimaryKeys({
            persistedRowIndices: [0, 1],
            displayRows: [
                {
                    key: 'p:0',
                    kind: 'persisted' as const,
                    persistedIndex: 0,
                    values: ['1', 'Alice'],
                },
                {
                    key: 'p:1',
                    kind: 'persisted' as const,
                    persistedIndex: 1,
                    values: ['2', 'Bob'],
                },
            ],
            editedCells: new Map<string, string>(),
            columns: ['id', 'name'],
            pkColumns: ['id'],
            driver: 'postgres',
        });

        expect(clause).toBe('"id" = \'1\' OR "id" = \'2\'');
    });

    it('builds WHERE IN clause from selected single-column cell values', () => {
        const selectedCells = new Set<string>([makeCellId('p:0', 1), makeCellId('p:1', 1)]);
        const displayRowsByKey = new Map([
            [
                'p:0',
                {
                    key: 'p:0',
                    kind: 'persisted' as const,
                    persistedIndex: 0,
                    values: ['1', 'HN'],
                },
            ],
            [
                'p:1',
                {
                    key: 'p:1',
                    kind: 'persisted' as const,
                    persistedIndex: 1,
                    values: ['2', 'HCM'],
                },
            ],
        ]);

        const clause = buildWhereClauseBySelectionIn({
            selectedCells,
            displayRowsByKey,
            editedCells: new Map<string, string>(),
            columns: ['id', 'branch_id'],
            driver: 'postgres',
        });

        expect(clause).toBe("\"branch_id\" IN ('HN', 'HCM')");
    });

    it('builds SELECT query for a persisted row by primary key', () => {
        const query = buildSelectByPrimaryKeyQuery({
            persistedRowIndex: 1,
            displayRows: [
                {
                    key: 'p:0',
                    kind: 'persisted' as const,
                    persistedIndex: 0,
                    values: ['1', 'Alice'],
                },
                {
                    key: 'p:1',
                    kind: 'persisted' as const,
                    persistedIndex: 1,
                    values: ['2', 'Bob'],
                },
            ],
            editedCells: new Map<string, string>(),
            columns: ['id', 'name'],
            pkColumns: ['id'],
            tableName: 'users',
            driver: 'postgres',
        });

        expect(query).toBe('SELECT * FROM "users" WHERE "id" = \'2\';');
    });
});

describe('buildRowSelectionMatrix', () => {
    const displayRows = [
        { key: 'p:0', kind: 'persisted' as const, persistedIndex: 0, values: ['1', 'a'] },
        { key: 'p:1', kind: 'persisted' as const, persistedIndex: 1, values: ['2', 'b'] },
        { key: 'tmp:x', kind: 'draft' as const, values: ['3', 'c'], draft: { id: 'x' } },
    ];
    const rowOrder = new Map([
        ['p:0', 0],
        ['p:1', 1],
        ['tmp:x', 2],
    ]);

    it('copies whole rows in grid order regardless of selection order', () => {
        const matrix = buildRowSelectionMatrix({
            rowKeys: ['tmp:x', 'p:0'],
            displayRows,
            rowOrder,
            editedCells: new Map(),
            columnCount: 2,
        });
        expect(matrixToTsv(matrix)).toBe('1\ta\n3\tc');
    });

    it('prefers pending edits for persisted rows and skips unknown keys', () => {
        const matrix = buildRowSelectionMatrix({
            rowKeys: ['p:1', 'missing'],
            displayRows,
            rowOrder,
            editedCells: new Map([['1:1', 'edited']]),
            columnCount: 2,
        });
        expect(matrix).toEqual([['2', 'edited']]);
    });
});
