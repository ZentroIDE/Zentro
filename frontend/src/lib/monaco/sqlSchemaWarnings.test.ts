// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { SchemaNode } from '../../stores/schemaStore';
import { collectSqlSchemaWarnings } from './sqlSchemaWarnings';

const schemas: SchemaNode[] = [
    {
        Name: 'public',
        Tables: ['users', 'accounts', 'employee_territories'],
        Views: ['active_users'],
    },
    {
        Name: 'app',
        Tables: ['orders'],
        Views: [],
    },
];

describe('collectSqlSchemaWarnings', () => {
    it('warns for unqualified tables missing from the selected schema', () => {
        const warnings = collectSqlSchemaWarnings('SELECT * FROM accounts a', schemas, 'app');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.objectName).toBe('accounts');
        expect(warnings[0]?.schemaName).toBe('app');
        expect(warnings[0]?.message).toMatch(/not found in schema "app"/i);
    });

    it('does not warn for unqualified tables found in the selected schema', () => {
        const warnings = collectSqlSchemaWarnings('SELECT * FROM orders', schemas, 'app');

        expect(warnings).toHaveLength(0);
    });

    it('warns when the selected schema exists but currently has no matching objects', () => {
        const warnings = collectSqlSchemaWarnings('SELECT * FROM accounts', schemas, 'app');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.objectName).toBe('accounts');
    });

    it('does not warn for schema-qualified references', () => {
        const warnings = collectSqlSchemaWarnings('SELECT * FROM public.accounts', schemas, 'app');

        expect(warnings).toHaveLength(0);
    });

    it('does not warn for cte references', () => {
        const warnings = collectSqlSchemaWarnings(
            'WITH accounts AS (SELECT 1) SELECT * FROM accounts',
            schemas,
            'app',
        );

        expect(warnings).toHaveLength(0);
    });

    it('warns for update and insert targets that are unqualified and missing', () => {
        const warnings = collectSqlSchemaWarnings(
            'UPDATE accounts SET id = 1; INSERT INTO accounts(id) VALUES (1);',
            schemas,
            'app',
        );

        expect(warnings).toHaveLength(2);
        expect(warnings.map(item => item.objectName)).toEqual(['accounts', 'accounts']);
    });

    it('does not warn for function calls used as from-sources', () => {
        const warnings = collectSqlSchemaWarnings(
            'SELECT * FROM generate_series(1, 3)',
            schemas,
            'app',
        );

        expect(warnings).toHaveLength(0);
    });

    it('does not treat the next statement keyword as an incomplete from target', () => {
        const sql = 'SELECT * FROM\n\nSELECT * FROM employee_territories et;';
        const warnings = collectSqlSchemaWarnings(sql, schemas, 'public');

        expect(warnings).toEqual([]);
    });

    it('keeps warning offsets scoped to the statement after a blank line', () => {
        const sql = 'SELECT * FROM\n\nSELECT * FROM missing_table;';
        const warnings = collectSqlSchemaWarnings(sql, schemas, 'public');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatchObject({
            objectName: 'missing_table',
            startOffset: sql.indexOf('missing_table'),
            endOffset: sql.indexOf('missing_table') + 'missing_table'.length,
        });
    });

    it('never treats a statement keyword as an object reference', () => {
        const warnings = collectSqlSchemaWarnings(
            'SELECT * FROM SELECT * FROM employee_territories',
            schemas,
            'public',
        );

        expect(warnings).toEqual([]);
    });

    it('still treats quoted keywords as object references', () => {
        const warnings = collectSqlSchemaWarnings('SELECT * FROM "select"', schemas, 'app');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.objectName).toBe('select');
    });
});
