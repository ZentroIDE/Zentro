// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
    buildAlterTemplate,
    buildFunctionTemplate,
    buildInfoTemplate,
    buildInsertTemplate,
    buildItems,
    buildSelectTemplate,
    buildUpdateTemplate,
    fuzzyScore,
    isTableLike,
    quoteIdent,
    type SearchItem,
} from './contextSearchTemplates';
import type { models } from '../../wailsjs/go/models';

const sampleItem: SearchItem = {
    id: 'table:public.users:1',
    kind: 'table',
    schema: 'public',
    name: 'users',
    qualifiedName: 'public.users',
    keywords: 'users public.users table',
};

describe('quoteIdent', () => {
    it('quotes with double quotes by default (postgres + sqlserver fallback)', () => {
        expect(quoteIdent('users', 'postgres')).toBe('"users"');
        expect(quoteIdent('users', undefined)).toBe('"users"');
    });

    it('quotes with backticks for mysql and doubles existing backticks', () => {
        expect(quoteIdent('users', 'mysql')).toBe('`users`');
        expect(quoteIdent('we`ird', 'mysql')).toBe('`we``ird`');
    });

    it('quotes with square brackets for sqlserver and doubles closing brackets', () => {
        expect(quoteIdent('users', 'sqlserver')).toBe('[users]');
        expect(quoteIdent('weird]name', 'sqlserver')).toBe('[weird]]name]');
    });

    it('doubles embedded double quotes for postgres', () => {
        expect(quoteIdent('we"ird', 'postgres')).toBe('"we""ird"');
    });
});

describe('isTableLike', () => {
    it('treats table/view/materialized_view/foreign_table as table-like', () => {
        expect(isTableLike('table')).toBe(true);
        expect(isTableLike('view')).toBe(true);
        expect(isTableLike('materialized_view')).toBe(true);
        expect(isTableLike('foreign_table')).toBe(true);
    });
    it('rejects other kinds', () => {
        expect(isTableLike('function')).toBe(false);
        expect(isTableLike('index')).toBe(false);
        expect(isTableLike('sequence')).toBe(false);
    });
});

describe('buildSelectTemplate', () => {
    it('produces a SELECT * with quoted schema + name', () => {
        expect(buildSelectTemplate(sampleItem, 'postgres')).toBe(
            'SELECT *\nFROM "public"."users";\n',
        );
        expect(buildSelectTemplate(sampleItem, 'mysql')).toBe('SELECT *\nFROM `public`.`users`;\n');
    });
});

describe('buildInsertTemplate', () => {
    it('produces a column-less template when no columns are supplied', () => {
        const sql = buildInsertTemplate(sampleItem, [], 'postgres');
        expect(sql).toContain('INSERT INTO "public"."users"');
        expect(sql).toContain('column1, column2');
    });

    it('emits one comment per column when columns are supplied', () => {
        const columns: models.ColumnDef[] = [
            { Name: 'id', DataType: 'int', IsPrimaryKey: true } as models.ColumnDef,
            { Name: 'email', DataType: 'text', IsPrimaryKey: false } as models.ColumnDef,
        ];
        const sql = buildInsertTemplate(sampleItem, columns, 'postgres');
        expect(sql).toContain('"id"');
        expect(sql).toContain('"email"');
        expect(sql).toContain('-- id (int)');
        expect(sql).toContain('-- email (text)');
    });
});

describe('buildUpdateTemplate', () => {
    it('puts PK columns in WHERE, non-PK columns in SET', () => {
        const columns: models.ColumnDef[] = [
            { Name: 'id', DataType: 'int', IsPrimaryKey: true } as models.ColumnDef,
            { Name: 'email', DataType: 'text', IsPrimaryKey: false } as models.ColumnDef,
        ];
        const sql = buildUpdateTemplate(sampleItem, columns, 'postgres');
        expect(sql).toContain('"email"');
        expect(sql).toContain('SET');
        expect(sql).toContain('WHERE');
        expect(sql).toContain('"id" = -- int');
        expect(sql).not.toMatch(/SET[\s\S]*"id"[\s\S]*WHERE/);
    });

    it('falls back to an empty SET placeholder when no non-PK columns exist', () => {
        const columns: models.ColumnDef[] = [
            { Name: 'id', DataType: 'int', IsPrimaryKey: true } as models.ColumnDef,
        ];
        const sql = buildUpdateTemplate(sampleItem, columns, 'postgres');
        expect(sql).toContain('-- col = value');
    });

    it('inserts a WHERE placeholder when no PK columns exist', () => {
        const columns: models.ColumnDef[] = [
            { Name: 'email', DataType: 'text', IsPrimaryKey: false } as models.ColumnDef,
        ];
        const sql = buildUpdateTemplate(sampleItem, columns, 'postgres');
        expect(sql).toContain('-- add condition here');
    });
});

describe('buildAlterTemplate', () => {
    it('emits an ALTER TABLE ADD COLUMN skeleton', () => {
        const sql = buildAlterTemplate(sampleItem, 'postgres');
        expect(sql).toContain('ALTER TABLE "public"."users"');
        expect(sql).toContain('ADD COLUMN');
    });
});

describe('buildFunctionTemplate', () => {
    it('produces an EXEC for sqlserver', () => {
        const fn: SearchItem = { ...sampleItem, kind: 'function', name: 'do_thing' };
        const sql = buildFunctionTemplate(fn, 'sqlserver');
        expect(sql).toContain('EXEC [public].[do_thing]');
    });
    it('produces a CALL for mysql', () => {
        const fn: SearchItem = { ...sampleItem, kind: 'function', name: 'do_thing' };
        const sql = buildFunctionTemplate(fn, 'mysql');
        expect(sql).toContain('CALL `public`.`do_thing`');
    });
    it('produces a SELECT * FROM for postgres / default', () => {
        const fn: SearchItem = { ...sampleItem, kind: 'function', name: 'do_thing' };
        expect(buildFunctionTemplate(fn, 'postgres')).toContain(
            'SELECT * FROM "public"."do_thing"',
        );
        expect(buildFunctionTemplate(fn, undefined)).toContain('SELECT * FROM "public"."do_thing"');
    });
    it('explains the situation for sqlite', () => {
        const fn: SearchItem = { ...sampleItem, kind: 'function', name: 'do_thing' };
        expect(buildFunctionTemplate(fn, 'sqlite')).toContain('SQLite may not support');
    });
});

describe('buildInfoTemplate', () => {
    it('returns a 2-line comment skeleton', () => {
        expect(buildInfoTemplate(sampleItem)).toBe('-- Table: public.users\n-- Add query here');
    });
});

describe('buildItems', () => {
    it('returns empty list when schemas is undefined', () => {
        expect(buildItems(undefined)).toEqual([]);
    });

    it('flattens tables / views / functions across schemas with stable ids', () => {
        const items = buildItems([
            { Name: 'public', Tables: ['users', 'orders'], Views: ['active_users'] },
            { Name: 'audit', Functions: ['snapshot'] },
        ]);
        expect(items).toHaveLength(4);
        const kinds = items.map(i => i.kind).sort();
        expect(kinds).toEqual(['function', 'table', 'table', 'view']);
    });

    it('deduplicates ids when two schemas share a name+kind', () => {
        const items = buildItems([
            { Name: 'public', Tables: ['users'] },
            { Name: 'public', Tables: ['users'] },
        ]);
        // Both items are valid; ids must be unique.
        expect(items).toHaveLength(2);
        const ids = new Set(items.map(i => i.id));
        expect(ids.size).toBe(2);
    });
});

describe('fuzzyScore', () => {
    it('returns 1 for empty needle', () => {
        expect(fuzzyScore('', 'anything')).toBe(1);
    });

    it('scores substring match higher than subsequence match', () => {
        const substringHit = fuzzyScore('users', 'users public.users table');
        const subseqHit = fuzzyScore('usr', 'users public.users table');
        expect(substringHit).toBeGreaterThan(subseqHit);
    });

    it('returns 0 when not even a subsequence', () => {
        expect(fuzzyScore('xyz', 'users')).toBe(0);
    });

    it('prefers earlier-position substring match', () => {
        const early = fuzzyScore('us', 'users.foo');
        const late = fuzzyScore('us', 'foo.bar.us');
        expect(early).toBeGreaterThan(late);
    });
});
