// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { models } from '../../wailsjs/go/models';
import {
    buildInsertScript,
    parseTableReference,
    resolveQualifiedTableName,
    toSqlLiteral,
} from './dataEditing';

function col(overrides: Partial<models.ColumnDef>): models.ColumnDef {
    return {
        Name: 'c',
        DataType: 'text',
        FullDataType: 'text',
        IsNullable: false,
        IsPrimaryKey: false,
        DefaultValue: '',
        ...overrides,
    } as models.ColumnDef;
}

describe('dataEditing table reference parsing', () => {
    it('keeps explicit schema from quoted query targets', () => {
        expect(parseTableReference('SELECT * FROM "app"."accounts"')).toEqual({
            schema: 'app',
            table: 'accounts',
        });
    });

    it('uses fallback schema for unqualified aliased queries', () => {
        expect(
            parseTableReference('SELECT *\nFROM  accounts a', undefined, {
                fallbackSchema: 'app',
            }),
        ).toEqual({
            schema: 'app',
            table: 'accounts',
        });
    });

    it('prefers a unique schema-tree match over a stale fallback schema', () => {
        expect(
            parseTableReference('SELECT * FROM accounts a', undefined, {
                fallbackSchema: 'public',
                schemas: [
                    { Name: 'public', Tables: ['users'], Views: [] },
                    { Name: 'app', Tables: ['accounts'], Views: [] },
                ],
            }),
        ).toEqual({
            schema: 'app',
            table: 'accounts',
        });
    });

    it('builds a qualified name with inferred schema for inserts and updates', () => {
        expect(
            resolveQualifiedTableName('SELECT * FROM accounts a', 'accounts', {
                fallbackSchema: 'app',
            }),
        ).toBe('"app"."accounts"');
    });

    it('keeps quoted table names with spaces intact', () => {
        expect(parseTableReference('SELECT * FROM "app"."new table 2"')).toEqual({
            schema: 'app',
            table: 'new table 2',
        });
    });

    it('generates a Postgres-safe boolean literal (regression: SET col = 0 on boolean)', () => {
        const boolCol = col({ Name: 'requires_manager_confirmation', DataType: 'boolean' });
        expect(toSqlLiteral('0', boolCol, 'postgres')).toBe('FALSE');
        expect(toSqlLiteral('1', boolCol, 'postgres')).toBe('TRUE');
        expect(toSqlLiteral('0', boolCol, 'mysql')).toBe('0');
        expect(toSqlLiteral('1', col({ DataType: 'bit' }), 'sqlserver')).toBe('1');
    });

    it('quotes identifiers per driver in the generated INSERT', () => {
        const cols = ['id', 'active'];
        const defs = [
            col({ Name: 'id', DataType: 'integer', IsPrimaryKey: true }),
            col({ Name: 'active', DataType: 'boolean' }),
        ];
        const draft = [
            {
                id: 'd1',
                kind: 'new' as const,
                values: ['5', 'true'],
                insertAfterRowIndex: null,
            },
        ];

        expect(
            buildInsertScript(
                't',
                cols,
                draft,
                defs,
                'SELECT * FROM public.t',
                undefined,
                'postgres',
            ),
        ).toBe('INSERT INTO "public"."t" ("id", "active") VALUES (5, TRUE);');

        expect(
            buildInsertScript('t', cols, draft, defs, 'SELECT * FROM t', undefined, 'mysql'),
        ).toBe('INSERT INTO `t` (`id`, `active`) VALUES (5, 1);');
    });

    it('builds insert sql for quoted table names with spaces', () => {
        expect(
            buildInsertScript(
                'new table 2',
                ['id', 'display name'],
                [
                    {
                        id: 'draft-1',
                        kind: 'new',
                        values: ['8098', 'KSJDFL'],
                        insertAfterRowIndex: null,
                    },
                ],
                [
                    {
                        Name: 'id',
                        DataType: 'integer',
                        FullDataType: 'integer',
                        IsNullable: false,
                        IsPrimaryKey: true,
                        DefaultValue: '',
                    },
                    {
                        Name: 'display name',
                        DataType: 'text',
                        FullDataType: 'text',
                        IsNullable: true,
                        IsPrimaryKey: false,
                        DefaultValue: '',
                    },
                ],
                'SELECT * FROM "app"."new table 2"',
                { fallbackSchema: 'app' },
            ),
        ).toBe(`INSERT INTO "app"."new table 2" ("id", "display name") VALUES (8098, 'KSJDFL');`);
    });
});
