// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { collectSqlSyntaxWarnings, SQL_SYNTAX_MAX_CHARS } from './sqlSyntaxDiagnostics';

function run(sql: string, driver = 'sqlserver') {
    return collectSqlSyntaxWarnings(sql, driver).map(warning => ({
        text: sql.slice(warning.startOffset, warning.endOffset),
        severity: warning.severity,
        message: warning.message,
    }));
}

describe('collectSqlSyntaxWarnings', () => {
    it('stays quiet on valid SQL', () => {
        expect(
            run(
                "select a, b from t where x = 'y' and z is null order by a; update t set a = null where id = 1",
            ),
        ).toEqual([]);
        expect(run('SELECT [a b], "c" FROM [my table] -- ) comment (')).toEqual([]);
        expect(run("select 'it''s (' from t")).toEqual([]);
    });

    it('flags unbalanced parentheses', () => {
        expect(run('select (a from t')).toEqual([
            expect.objectContaining({ text: '(', severity: 'error' }),
        ]);
        expect(run('select a) from t')).toEqual([
            expect.objectContaining({ text: ')', severity: 'error' }),
        ]);
    });

    it('does not carry an unclosed parenthesis into the next statement', () => {
        const result = run('select (a from t; select 1 from u');
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('(');
    });

    it('flags an unterminated string on its first line only', () => {
        const result = run("select 'oops\nfrom t\nwhere a = 1");
        expect(result).toEqual([expect.objectContaining({ text: "'oops", severity: 'error' })]);
    });

    it('flags unterminated quoted identifiers and block comments', () => {
        expect(run('select [a from t')[0]).toMatchObject({ severity: 'error' });
        expect(run('select 1 /* never closed')[0]).toMatchObject({
            message: expect.stringContaining('block comment'),
        });
    });

    it('treats brackets as subscripts outside T-SQL/SQLite', () => {
        expect(run('select arr[1] from t', 'postgres')).toEqual([]);
        expect(run('select arr[1 from t', 'postgres')).toEqual([]);
    });

    it('flags a trailing comma before a clause or a closing parenthesis', () => {
        expect(run('select a, from t')).toEqual([
            expect.objectContaining({ text: ',', severity: 'error' }),
        ]);
        expect(run('select f(a, ) from t')).toEqual([
            expect.objectContaining({ text: ',', severity: 'error' }),
        ]);
        expect(run('select a,')).toEqual([]); // still typing
    });

    it('warns on = NULL but not on assignments', () => {
        expect(run('select * from t where a = null')).toEqual([
            expect.objectContaining({ text: '= null', severity: 'warning' }),
        ]);
        expect(run('select * from t where a <> NULL')).toHaveLength(1);
        expect(run('update t set a = null where id = 1')).toEqual([]);
        expect(run('set @x = null')).toEqual([]);
        expect(run('declare @x int = null')).toEqual([]);
        expect(run('select case when a = null then 1 end from t')).toHaveLength(1);
    });

    it('warns on UPDATE/DELETE without WHERE', () => {
        expect(run('update t set a = 1')).toEqual([
            expect.objectContaining({ text: 'update', severity: 'warning' }),
        ]);
        expect(run('delete from t')).toEqual([
            expect.objectContaining({ text: 'delete', severity: 'warning' }),
        ]);
        expect(run('delete from t where id = 1')).toEqual([]);
        expect(run('update statistics t')).toEqual([]);
    });

    it('evaluates each statement and each GO batch on its own', () => {
        const result = run('update t set a = 1 where id = 1;\ndelete from u');
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('delete');

        const batches = run('delete from a\nGO\nselect 1 from b where x = 1');
        expect(batches).toHaveLength(1);
        expect(batches[0].text).toBe('delete');
    });

    it('flags a repeated clause keyword', () => {
        expect(run('select a from from t')).toEqual([
            expect.objectContaining({ text: 'from', severity: 'warning' }),
        ]);
        expect(run('select a from t order by by a')).toHaveLength(1);
    });

    it('skips oversized scripts', () => {
        expect(run(`select ( ${'x'.repeat(SQL_SYNTAX_MAX_CHARS)}`)).toEqual([]);
    });
});
