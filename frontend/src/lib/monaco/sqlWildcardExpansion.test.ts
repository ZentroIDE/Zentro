// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { buildWildcardEdit, expandAllWildcards, findSelectWildcards } from './sqlWildcardExpansion';

const slices = (sql: string) =>
    findSelectWildcards(sql).map(wildcard => sql.slice(wildcard.startOffset, wildcard.endOffset));

describe('findSelectWildcards', () => {
    it.each([
        ['SELECT * FROM t', ['*']],
        ['SELECT DISTINCT * FROM t', ['*']],
        ['SELECT ALL * FROM t', ['*']],
        ['SELECT TOP 10 * FROM t', ['*']],
        ['SELECT TOP (10) * FROM t', ['*']],
        ['SELECT TOP 10 PERCENT * FROM t', ['*']],
        ['SELECT DISTINCT TOP 5 * FROM t', ['*']],
        ['SELECT c.* FROM t c', ['c.*']],
        ['SELECT [c].* FROM t c', ['[c].*']],
        ['SELECT dbo.Customer.* FROM dbo.Customer', ['dbo.Customer.*']],
        ['SELECT a, * FROM t', ['*']],
        ['SELECT a,\n    * FROM t', ['*']],
        ['SELECT * FROM t UNION SELECT * FROM u', ['*', '*']],
        ['SELECT * FROM (SELECT a, * FROM t) x', ['*', '*']],
        ['SELECT (SELECT 1), * FROM t', ['*']],
    ])('finds the wildcard in %j', (sql, expected) => {
        expect(slices(sql)).toEqual(expected);
    });

    it.each([
        'SELECT COUNT(*) FROM t',
        'SELECT COUNT(DISTINCT a), MAX(*) FROM t',
        'SELECT a * b FROM t',
        'SELECT 2 * 3',
        'SELECT (a) * 2 FROM t',
        'SELECT a FROM t WHERE x = 2 * 3',
        'SELECT a FROM t WHERE x IN (1, 2 * 3)',
        'SELECT a FROM t ORDER BY a, b * 2',
        'SELECT a FROM t; x, *',
        "SELECT '*' FROM t",
        'SELECT a -- *\nFROM t',
        'SELECT a /* * */ FROM t',
        'SELECT a FROM t GROUP BY COUNT(t.*)',
    ])('ignores a star that is not a select-list wildcard in %j', sql => {
        expect(findSelectWildcards(sql)).toEqual([]);
    });

    it('reports the qualifier without quotes and the comma that introduces later items', () => {
        const [qualified] = findSelectWildcards('SELECT [c].* FROM t c');
        expect(qualified.qualifier).toBe('c');
        expect(qualified.leadingCommaOffset).toBeUndefined();

        const sql = 'SELECT a, * FROM t';
        const [later] = findSelectWildcards(sql);
        expect(sql[later.leadingCommaOffset ?? -1]).toBe(',');
    });
});

const catalog = [{ Name: 'dbo', Tables: ['Customer', 'Orders'], Views: [] }];
const columnsByTable: Record<string, string[]> = {
    Customer: ['Name', 'Id', 'Phone No_'],
    Orders: ['Id', 'CustomerId'],
};

const makeEnv = (driver = 'sqlserver') => ({
    schemas: catalog,
    currentSchema: 'dbo',
    driver,
    fetchColumns: async (_schema: string, table: string) =>
        (columnsByTable[table] ?? []).map(Name => ({ Name })),
});

/** Applies the expansion of the wildcard at `index` and returns the resulting SQL. */
async function expand(sql: string, index = 0, driver = 'sqlserver', lineIndent = '') {
    const wildcard = findSelectWildcards(sql)[index];
    const edit = await buildWildcardEdit(sql, wildcard, makeEnv(driver), lineIndent);
    return edit && `${sql.slice(0, edit.startOffset)}${edit.text}${sql.slice(edit.endOffset)}`;
}

describe('buildWildcardEdit', () => {
    it('expands * over a single source to bare columns in table order', async () => {
        expect(await expand('SELECT * FROM Customer c')).toBe(
            'SELECT Name, Id, [Phone No_] FROM Customer c',
        );
    });

    it('qualifies every column with its alias when several tables are joined', async () => {
        const sql = 'SELECT * FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        expect(await expand(sql)).toBe(
            'SELECT \n      c.Name\n    , c.Id\n    , c.[Phone No_]\n    , o.Id\n    , o.CustomerId' +
                ' FROM Customer c JOIN Orders o ON o.CustomerId = c.Id',
        );
    });

    it('indents a long list relative to the line of the wildcard', async () => {
        const sql = '  SELECT * FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        const result = await expand(sql, 0, 'sqlserver', '  ');
        expect(result?.startsWith('  SELECT \n        c.Name\n      , c.Id')).toBe(true);
    });

    it('expands alias.* to only that table, keeping the qualifier', async () => {
        const sql = 'SELECT c.*, o.Id FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        expect(await expand(sql)).toBe(
            'SELECT c.Name, c.Id, c.[Phone No_], o.Id FROM Customer c JOIN Orders o ON o.CustomerId = c.Id',
        );
    });

    it('replaces the introducing comma when the wildcard is not the first item', async () => {
        expect(await expand('SELECT c.Id, * FROM Customer c')).toBe(
            'SELECT c.Id, Name, Id, [Phone No_] FROM Customer c',
        );
    });

    it('writes a long continuation comma-first without a doubled comma', async () => {
        const sql = 'SELECT 1 AS n, * FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        const result = await expand(sql);
        expect(result).toContain('SELECT 1 AS n\n    , c.Name\n    , c.Id');
        expect(result).not.toContain(',,');
        expect(result).not.toMatch(/,\s*,/);
    });

    it('quotes columns for the driver', async () => {
        expect(await expand('SELECT * FROM Customer', 0, 'postgres')).toBe(
            'SELECT "Name", "Id", "Phone No_" FROM Customer',
        );
        expect(await expand('SELECT * FROM Customer', 0, 'mysql')).toBe(
            'SELECT Name, Id, `Phone No_` FROM Customer',
        );
    });

    it('expands the wildcard of the right select inside a subquery', async () => {
        const sql = 'SELECT * FROM (SELECT * FROM Orders) x';
        expect(await expand(sql, 1)).toBe('SELECT * FROM (SELECT Id, CustomerId FROM Orders) x');
    });

    it('expands a CTE whose projection is known, even without a FROM', async () => {
        expect(
            await expand('WITH x AS (SELECT 1 AS n) SELECT * FROM x JOIN Customer c ON c.Id = x.n'),
        ).toBe(
            'WITH x AS (SELECT 1 AS n) SELECT x.n, c.Name, c.Id, c.[Phone No_] FROM x JOIN Customer c ON c.Id = x.n',
        );
    });

    it('refuses when a source has no known columns (starred CTE, unknown table)', async () => {
        expect(
            await expand(
                'WITH x AS (SELECT * FROM Customer) SELECT * FROM x JOIN Customer c ON c.Id = x.Id',
                1,
            ),
        ).toBeNull();
        expect(await expand('SELECT * FROM Missing m')).toBeNull();
    });

    it('refuses an alias that is not part of the statement', async () => {
        expect(await expand('SELECT z.* FROM Customer c')).toBeNull();
    });
});

describe('expandAllWildcards', () => {
    it('reports none when the query has no select-list wildcard', async () => {
        expect(await expandAllWildcards('SELECT COUNT(*) FROM Customer', makeEnv())).toEqual({
            status: 'none',
        });
    });

    it('expands every wildcard of the query', async () => {
        const result = await expandAllWildcards(
            'SELECT * FROM Customer UNION ALL SELECT * FROM Customer',
            makeEnv(),
        );
        expect(result).toEqual({
            status: 'expanded',
            query: 'SELECT Name, Id, [Phone No_] FROM Customer UNION ALL SELECT Name, Id, [Phone No_] FROM Customer',
        });
    });

    it('keeps the indentation of each wildcard line', async () => {
        const query = 'SELECT 1 AS n\n  , * FROM Customer c JOIN Orders o ON o.CustomerId = c.Id';
        const result = await expandAllWildcards(query, makeEnv());
        expect(result.status).toBe('expanded');
        expect(result.status === 'expanded' && result.query).toContain(
            '\n      , c.Name\n      , c.Id',
        );
    });

    it('is all or nothing when one wildcard cannot be resolved', async () => {
        expect(
            await expandAllWildcards(
                'SELECT * FROM Customer UNION SELECT * FROM Missing',
                makeEnv(),
            ),
        ).toEqual({ status: 'unresolved' });
    });

    it('is unresolved without an environment', async () => {
        expect(await expandAllWildcards('SELECT * FROM Customer', null)).toEqual({
            status: 'unresolved',
        });
    });
});
