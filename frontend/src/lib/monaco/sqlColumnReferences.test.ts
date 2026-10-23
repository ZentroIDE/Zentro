// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { collectColumnReferences } from './sqlColumnReferences';

/** "alias.name" for qualified references, bare "name" otherwise. */
const refs = (sql: string, driver = 'sqlserver') =>
    collectColumnReferences(sql, driver)?.map(ref =>
        ref.qualifier ? `${ref.qualifier}.${ref.name}` : ref.name,
    );

describe('collectColumnReferences: what it collects', () => {
    it('collects bare, bracketed and qualified columns from every scanned clause', () => {
        expect(refs('SELECT Name, [Contact Persod] FROM Employee e')).toEqual([
            'Name',
            'Contact Persod',
        ]);
        expect(
            refs('SELECT e.Name, e.[First Name] FROM Employee e WHERE e.Age > 3 ORDER BY e.Name'),
        ).toEqual(['e.Name', 'e.First Name', 'e.Age', 'e.Name']);
        expect(refs('SELECT a.x FROM A a JOIN B b ON b.a_id = a.id')).toEqual([
            'a.x',
            'b.a_id',
            'a.id',
        ]);
        expect(
            refs(
                'SELECT a, COUNT(b) FROM t WHERE c = 1 GROUP BY a HAVING COUNT(dcol) > 1 ORDER BY a',
            ),
        ).toEqual(['a', 'b', 'c', 'a', 'dcol', 'a']);
    });

    it('reports the offsets of the column token, not of its qualifier', () => {
        const sql = 'SELECT e.[Contact Persod], Name FROM Employee e';
        const [qualified, bare] = collectColumnReferences(sql, 'sqlserver') ?? [];

        expect(sql.slice(qualified.startOffset, qualified.endOffset)).toBe('[Contact Persod]');
        expect(qualified.quoted).toBe(true);
        expect(sql.slice(bare.startOffset, bare.endOffset)).toBe('Name');
        expect(bare.quoted).toBe(false);
    });

    it('reads quoting per dialect', () => {
        expect(refs('SELECT `a b`, "str" FROM t WHERE c = "x"', 'mysql')).toEqual(['a b', 'c']);
        expect(refs('SELECT "Contact Persod", arr[1] FROM t', 'postgres')).toEqual([
            'Contact Persod',
            'arr',
        ]);
        expect(refs('SELECT [a b] FROM t', 'sqlite')).toEqual(['a b']);
    });

    it('accepts the sqlserver driver aliases', () => {
        expect(refs('SELECT a FROM t', 'mssql')).toEqual(['a']);
    });
});

describe('collectColumnReferences: what it must not flag', () => {
    it.each([
        ['aggregate with alias', 'SELECT COUNT(*) AS cnt FROM t', []],
        ['aliases used in ORDER BY', 'SELECT a AS x, b y FROM t ORDER BY x, y', ['a', 'b']],
        ['T-SQL alias = expression', 'SELECT total = SUM(a) FROM t', ['a']],
        ['literal with implicit alias', "SELECT 'x' label, 1 n FROM t", []],
        ['CASE ... END alias', "SELECT CASE WHEN a = 1 THEN 'y' ELSE 'n' END flag FROM t", ['a']],
        ['IS NULL alias', 'SELECT a IS NULL flag FROM t', ['a']],
        [
            'CAST / CONVERT / ::',
            'SELECT CAST(a AS INT), CONVERT(varchar(10), b), b::text FROM t',
            ['a', 'b', 'b'],
        ],
        [
            'date parts',
            'SELECT DATEPART(month, created), DATEDIFF(day, a, b), DATEPART(d, c) FROM t',
            ['created', 'a', 'b', 'c'],
        ],
        ['EXTRACT ... FROM', 'SELECT EXTRACT(YEAR FROM created_at) FROM t', ['created_at']],
        ['TOP n', 'SELECT TOP 10 a FROM t', ['a']],
        ['TOP (n)', 'SELECT TOP (10) a FROM t', ['a']],
        ['DISTINCT TOP', 'SELECT DISTINCT TOP 5 a FROM t', ['a']],
        ['TOP PERCENT', 'SELECT TOP 10 PERCENT a FROM t', ['a']],
        [
            'parameters and variables',
            'SELECT a FROM t WHERE b = @p AND c = :q AND ver = ? AND e = $1 AND f = @@ROWCOUNT',
            ['a', 'b', 'c', 'ver', 'e', 'f'],
        ],
        [
            'window function',
            'SELECT a, SUM(b) OVER (PARTITION BY c ORDER BY dcol ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM t',
            ['a', 'b', 'c', 'dcol'],
        ],
        [
            'predicates',
            "SELECT a FROM t WHERE b LIKE 'x%' AND c IS NOT NULL AND dcol IN (1, 2) AND e BETWEEN 1 AND 2",
            ['a', 'b', 'c', 'dcol', 'e'],
        ],
        [
            'current-time keywords',
            'SELECT a FROM t WHERE ROWNUM <= 5 AND created > CURRENT_TIMESTAMP',
            ['a', 'created'],
        ],
        ['COLLATE', 'SELECT a COLLATE Latin1_General_CI_AS FROM t', ['a']],
        ['national string prefix', "SELECT N'Nguyễn' AS n, a FROM t", ['a']],
        ['table hint', 'SELECT a FROM t WITH (NOLOCK) WHERE b = 1', ['a', 'b']],
        ['comments and strings', "SELECT a -- b\nFROM t WHERE c = 'd' /* e */", ['a', 'c']],
        ['escaped quote in string', "SELECT a FROM t WHERE b = 'it''s' AND c = 1", ['a', 'b', 'c']],
        ['schema-qualified function', 'SELECT dbo.fn(a), t.b FROM t', ['a', 't.b']],
        ['three-part name', 'SELECT dbo.t.a FROM dbo.t', []],
        ['qualified star', 'SELECT t.*, a FROM t', ['a']],
        [
            'paging',
            'SELECT a FROM t ORDER BY a DESC OFFSET 5 ROWS FETCH NEXT 5 ROWS ONLY',
            ['a', 'a'],
        ],
        [
            'a column named like an Object.prototype member',
            'SELECT constructor FROM t',
            ['constructor'],
        ],
    ])('%s', (_label, sql, expected) => {
        expect(refs(sql)).toEqual(expected);
    });

    it('does not read MySQL backslash escapes as the end of a string', () => {
        expect(refs("SELECT a FROM t WHERE b = 'it\\'s' AND c = 1", 'mysql')).toEqual([
            'a',
            'b',
            'c',
        ]);
    });
});

describe('collectColumnReferences: shapes it refuses to read', () => {
    it.each([
        ['CTE', 'WITH x AS (SELECT 1) SELECT a FROM x'],
        ['derived table', 'SELECT a FROM (SELECT b FROM t) x'],
        ['subquery predicate', 'SELECT a FROM t WHERE EXISTS (SELECT 1)'],
        ['UNION', 'SELECT a FROM t UNION SELECT b FROM u'],
        ['unbalanced parenthesis', 'SELECT a FROM t WHERE (b = 1'],
        ['unterminated string', "SELECT 'oops FROM t"],
        ['unterminated comment', 'SELECT a /* FROM t'],
        ['not a SELECT', 'UPDATE t SET a = 1'],
        ['FOR UPDATE', 'SELECT a FROM t FOR UPDATE'],
        ['APPLY', 'SELECT a FROM t CROSS APPLY f(a)'],
        ['SELECT INTO', 'SELECT a INTO #x FROM t'],
        ['dollar quoting', 'SELECT $$x$$'],
        ['DISTINCT ON', 'SELECT DISTINCT ON (a) a FROM t'],
        ['query hint', 'SELECT a FROM t OPTION (RECOMPILE)'],
        ['USING join', 'SELECT a FROM t JOIN u USING (id)'],
        ['NATURAL join', 'SELECT id FROM t NATURAL JOIN u'],
        ['WITH ROLLUP', 'SELECT a FROM t GROUP BY a WITH ROLLUP'],
    ])('returns null for %s', (_label, sql) => {
        expect(collectColumnReferences(sql, 'postgres')).toBeNull();
    });

    it('returns null for an unknown or missing driver', () => {
        expect(collectColumnReferences('SELECT a FROM t', '')).toBeNull();
        expect(collectColumnReferences('SELECT a FROM t', 'oracle')).toBeNull();
    });
});

describe('collectColumnReferences: clause', () => {
    it('tells which clause each reference was written in', () => {
        const references = collectColumnReferences(
            'SELECT a FROM t JOIN u ON u.k = t.k WHERE b = 1 GROUP BY c HAVING COUNT(dcol) > 1 ORDER BY e',
            'postgres',
        );

        expect(references?.map(ref => `${ref.name}:${ref.clause}`)).toEqual([
            'a:select',
            'k:on',
            'k:on',
            'b:where',
            'c:group',
            'dcol:having',
            'e:order',
        ]);
    });
});
