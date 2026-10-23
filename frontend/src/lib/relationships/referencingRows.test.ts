// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { IncomingRelationship } from './deleteImpact';
import {
    MAX_LOOKUP_KEYS,
    buildReferencingProbe,
    planReferencingRowsQuery,
} from './referencingRows';

function relationship(overrides: Partial<IncomingRelationship> = {}): IncomingRelationship {
    return {
        key: 'public.order_details.fk_od_order',
        sourceSchema: 'public',
        sourceTable: 'order_details',
        constraintName: 'fk_od_order',
        columns: ['order_id'],
        columnPairs: [{ source: 'order_id', target: 'order_id' }],
        hasUnambiguousColumnMapping: true,
        onDelete: 'NO ACTION',
        severity: 'blocking',
        isSelfReference: false,
        ...overrides,
    };
}

// Values are quoted unless they are bare numbers, like the real formatter does for typed columns.
const literal = (_column: string, value: string) =>
    /^-?\d+(\.\d+)?$/.test(value)
        ? value
        : value === ''
          ? 'NULL'
          : `'${value.replace(/'/g, "''")}'`;

const base = {
    driver: 'postgres',
    resultColumns: ['order_id', 'customer_id', 'ship_name'],
    literal,
};

describe('planReferencingRowsQuery', () => {
    it('selects the child rows whose key is among the deleted parent keys', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            relationship: relationship(),
            deletedRows: [
                ['10248', 'VINET', 'Vins'],
                ['10249', 'TOMSP', 'Toms'],
            ],
        });

        expect(plan).toEqual({
            ok: true,
            sql: 'SELECT * FROM "public"."order_details" WHERE "order_id" IN (10248, 10249);',
            keyCount: 2,
            totalKeyCount: 2,
        });
    });

    it('reads the referenced column by name, not assuming it is the primary key', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            relationship: relationship({
                sourceTable: 'orders_audit',
                columns: ['customer_ref'],
                columnPairs: [{ source: 'customer_ref', target: 'customer_id' }],
            }),
            deletedRows: [['10248', 'VINET', 'Vins']],
        });

        expect(plan).toMatchObject({
            ok: true,
            sql: `SELECT * FROM "public"."orders_audit" WHERE "customer_ref" IN ('VINET');`,
        });
    });

    it('spells out a composite key with AND/OR so it works on every driver', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            resultColumns: ['tenant_id', 'id'],
            relationship: relationship({
                columns: ['tenant_id', 'user_id'],
                columnPairs: [
                    { source: 'tenant_id', target: 'tenant_id' },
                    { source: 'user_id', target: 'id' },
                ],
            }),
            deletedRows: [
                ['1', '7'],
                ['1', '8'],
            ],
        });

        expect(plan).toMatchObject({ ok: true });
        if (plan.ok) {
            expect(plan.sql).toBe(
                'SELECT * FROM "public"."order_details" WHERE ("tenant_id" = 1 AND "user_id" = 7)\n   OR ("tenant_id" = 1 AND "user_id" = 8);',
            );
        }
    });

    it('quotes identifiers the way the driver does', () => {
        const mysql = planReferencingRowsQuery({
            ...base,
            driver: 'mysql',
            relationship: relationship(),
            deletedRows: [['1', 'a', 'b']],
        });
        const sqlServer = planReferencingRowsQuery({
            ...base,
            driver: 'sqlserver',
            relationship: relationship({ sourceSchema: 'dbo' }),
            deletedRows: [['1', 'a', 'b']],
        });

        expect(mysql).toMatchObject({
            sql: 'SELECT * FROM `public`.`order_details` WHERE `order_id` IN (1);',
        });
        expect(sqlServer).toMatchObject({
            sql: 'SELECT * FROM [dbo].[order_details] WHERE [order_id] IN (1);',
        });
    });

    it('leaves the schema off when the child table has none', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            driver: 'sqlite',
            relationship: relationship({ sourceSchema: '' }),
            deletedRows: [['1', 'a', 'b']],
        });

        expect(plan).toMatchObject({
            sql: 'SELECT * FROM "order_details" WHERE "order_id" IN (1);',
        });
    });

    it('escapes quotes in key values', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            resultColumns: ['code'],
            relationship: relationship({
                columnPairs: [{ source: 'code', target: 'code' }],
                columns: ['code'],
            }),
            deletedRows: [["O'Neil"]],
        });

        expect(plan).toMatchObject({
            sql: `SELECT * FROM "public"."order_details" WHERE "code" IN ('O''Neil');`,
        });
    });

    it('drops duplicate keys and rows that are not loaded', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            relationship: relationship(),
            deletedRows: [['1', 'a', 'b'], undefined, ['1', 'c', 'd'], ['2', 'e', 'f']],
        });

        expect(plan).toMatchObject({ ok: true, keyCount: 2, totalKeyCount: 2 });
    });

    it('skips NULL keys, which no foreign key can reference', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            relationship: relationship(),
            deletedRows: [
                ['', 'a', 'b'],
                ['5', 'c', 'd'],
            ],
        });

        expect(plan).toMatchObject({
            ok: true,
            sql: 'SELECT * FROM "public"."order_details" WHERE "order_id" IN (5);',
        });
    });

    it('explains itself when every key is NULL', () => {
        const plan = planReferencingRowsQuery({
            ...base,
            relationship: relationship(),
            deletedRows: [['', 'a', 'b']],
        });

        expect(plan).toEqual({ ok: false, reason: 'No referenced values to look up.' });
    });

    it('caps the number of keys and says so in a comment', () => {
        const deletedRows = Array.from({ length: MAX_LOOKUP_KEYS + 5 }, (_, i) => [
            String(i + 1),
            'a',
            'b',
        ]);
        const plan = planReferencingRowsQuery({
            ...base,
            relationship: relationship(),
            deletedRows,
        });

        expect(plan).toMatchObject({
            ok: true,
            keyCount: MAX_LOOKUP_KEYS,
            totalKeyCount: MAX_LOOKUP_KEYS + 5,
        });
        if (plan.ok) {
            expect(
                plan.sql.startsWith('-- Showing rows for the first 200 of 205 deleted keys.\n'),
            ).toBe(true);
        }
    });

    describe('refuses when a query cannot be built safely', () => {
        it('when the column mapping is ambiguous', () => {
            const plan = planReferencingRowsQuery({
                ...base,
                relationship: relationship({ hasUnambiguousColumnMapping: false }),
                deletedRows: [['1', 'a', 'b']],
            });

            expect(plan).toMatchObject({ ok: false });
        });

        it('when the referenced column is not in the result', () => {
            const plan = planReferencingRowsQuery({
                ...base,
                resultColumns: ['ship_name'],
                relationship: relationship(),
                deletedRows: [['Vins']],
            });

            expect(plan).toEqual({
                ok: false,
                reason: '"order_id" is not a column of this result.',
            });
        });

        it('when the referenced column is blurred', () => {
            const plan = planReferencingRowsQuery({
                ...base,
                relationship: relationship(),
                deletedRows: [['1', 'a', 'b']],
                blurredColumnIndexes: new Set([0]),
            });

            expect(plan).toEqual({
                ok: false,
                reason: '"order_id" is blurred. Unblur it to view rows.',
            });
        });
    });
});

describe('buildReferencingProbe', () => {
    it('asks about the child table with the original key values of the deleted rows', () => {
        const plan = buildReferencingProbe({
            relationship: relationship(),
            resultColumns: ['order_id', 'customer_id', 'ship_name'],
            deletedRows: [
                ['10248', 'VINET', 'Vins'],
                ['10249', 'TOMSP', 'Toms'],
            ],
            literal,
        });

        expect(plan).toEqual({
            ok: true,
            probe: {
                Key: 'public.order_details.fk_od_order',
                Schema: 'public',
                Table: 'order_details',
                Columns: ['order_id'],
                Keys: [['10248'], ['10249']],
            },
        });
    });

    it('reads the referenced column by name, mapping it to the child column', () => {
        const plan = buildReferencingProbe({
            relationship: relationship({
                columnPairs: [{ source: 'customer_ref', target: 'customer_id' }],
                columns: ['customer_ref'],
            }),
            resultColumns: ['order_id', 'customer_id'],
            deletedRows: [['10248', 'VINET']],
            literal,
        });

        expect(plan).toMatchObject({
            ok: true,
            probe: { Columns: ['customer_ref'], Keys: [['VINET']] },
        });
    });

    it('carries composite keys as tuples', () => {
        const plan = buildReferencingProbe({
            relationship: relationship({
                columns: ['tenant_id', 'user_id'],
                columnPairs: [
                    { source: 'tenant_id', target: 'tenant_id' },
                    { source: 'user_id', target: 'id' },
                ],
            }),
            resultColumns: ['tenant_id', 'id'],
            deletedRows: [
                ['1', '7'],
                ['1', '8'],
            ],
            literal,
        });

        expect(plan).toMatchObject({
            ok: true,
            probe: {
                Columns: ['tenant_id', 'user_id'],
                Keys: [
                    ['1', '7'],
                    ['1', '8'],
                ],
            },
        });
    });

    it('drops duplicate keys, rows that are not loaded, and NULL keys', () => {
        const plan = buildReferencingProbe({
            relationship: relationship(),
            resultColumns: ['order_id', 'customer_id', 'ship_name'],
            deletedRows: [
                ['1', 'a', 'b'],
                undefined,
                ['1', 'c', 'd'],
                ['', 'e', 'f'],
                ['2', 'g', 'h'],
            ],
            literal,
        });

        expect(plan).toMatchObject({ ok: true, probe: { Keys: [['1'], ['2']] } });
    });

    it('has no keys, and so nothing to look up, when every key is NULL', () => {
        const plan = buildReferencingProbe({
            relationship: relationship(),
            resultColumns: ['order_id'],
            deletedRows: [['']],
            literal,
        });

        expect(plan).toMatchObject({ ok: true, probe: { Keys: [] } });
    });

    it('refuses an ambiguous column mapping', () => {
        const plan = buildReferencingProbe({
            relationship: relationship({ hasUnambiguousColumnMapping: false }),
            resultColumns: ['order_id'],
            deletedRows: [['1']],
            literal,
        });

        expect(plan).toMatchObject({ ok: false });
    });

    it('refuses when the referenced column is not in the result', () => {
        const plan = buildReferencingProbe({
            relationship: relationship(),
            resultColumns: ['ship_name'],
            deletedRows: [['Vins']],
            literal,
        });

        expect(plan).toEqual({ ok: false, reason: '"order_id" is not a column of this result.' });
    });

    it('does not mind a blurred column: the values never appear on screen', () => {
        // Only the View rows query puts values in a visible tab; the check goes to the database.
        const plan = buildReferencingProbe({
            relationship: relationship(),
            resultColumns: ['order_id'],
            deletedRows: [['1']],
            literal,
        });

        expect(plan).toMatchObject({ ok: true });
    });
});
