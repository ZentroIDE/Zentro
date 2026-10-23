// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqlColumnWarning } from '../../lib/monaco/sqlColumnValidation';
import { useSchemaStore, type SchemaNode } from '../../stores/schemaStore';
import { useColumnWarnings } from './useColumnWarnings';

const findUnknownColumns = vi.fn();
vi.mock('../../lib/monaco/sqlColumnValidation', () => ({
    findUnknownColumns: (...args: unknown[]) => findUnknownColumns(...args),
}));

const schemas = [{ Name: 'dbo', Tables: ['Employee'], Views: [] }] as unknown as SchemaNode[];

const warning: SqlColumnWarning = {
    kind: 'unknown',
    severity: 'warning',
    shortMessage: 'not found',
    qualifiers: [],
    columnName: 'Salary',
    quoted: false,
    startOffset: 7,
    endOffset: 13,
    message: 'Column "Salary" was not found',
    suggestions: [],
    tables: [],
};

const baseParams = {
    enabled: true,
    sqlText: 'SELECT Salary FROM Employee',
    schemas,
    currentSchema: 'dbo',
    profileName: 'main',
    dbName: 'db',
    driver: 'sqlserver',
};

const flush = () => act(async () => vi.advanceTimersByTimeAsync(600));

describe('useColumnWarnings', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        findUnknownColumns.mockReset();
        findUnknownColumns.mockResolvedValue([warning]);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reports warnings only after typing pauses', async () => {
        const { result } = renderHook(() => useColumnWarnings(baseParams));

        expect(result.current.warnings).toEqual([]);
        expect(findUnknownColumns).not.toHaveBeenCalled();

        await flush();

        expect(findUnknownColumns).toHaveBeenCalledTimes(1);
        expect(result.current.warnings).toEqual([warning]);
    });

    it('checks only the latest text when it changes during the pause', async () => {
        const { rerender } = renderHook(props => useColumnWarnings(props), {
            initialProps: baseParams,
        });

        await act(async () => vi.advanceTimersByTimeAsync(200));
        rerender({ ...baseParams, sqlText: 'SELECT Salary, Bonus FROM Employee' });
        await flush();

        expect(findUnknownColumns).toHaveBeenCalledTimes(1);
        expect(findUnknownColumns.mock.calls[0][0]).toBe('SELECT Salary, Bonus FROM Employee');
    });

    it('drops the result of a check that was superseded while it ran', async () => {
        let resolveFirst: (value: SqlColumnWarning[]) => void = () => {};
        findUnknownColumns.mockImplementationOnce(
            () => new Promise<SqlColumnWarning[]>(resolve => (resolveFirst = resolve)),
        );
        const { result, rerender } = renderHook(props => useColumnWarnings(props), {
            initialProps: baseParams,
        });
        await flush();

        rerender({ ...baseParams, sqlText: 'SELECT Name FROM Employee' });
        findUnknownColumns.mockResolvedValueOnce([]);
        await act(async () => resolveFirst([warning]));
        await flush();

        expect(result.current.warnings).toEqual([]);
    });

    it.each([
        ['disabled', { enabled: false }],
        ['blank text', { sqlText: '   ' }],
        ['no catalog', { schemas: [] as SchemaNode[] }],
        ['no connection', { profileName: '' }],
    ])('does nothing when %s', async (_label, override) => {
        const { result } = renderHook(() => useColumnWarnings({ ...baseParams, ...override }));

        await flush();

        expect(findUnknownColumns).not.toHaveBeenCalled();
        expect(result.current.warnings).toEqual([]);
    });

    it('clears the warnings when the text is emptied', async () => {
        const { result, rerender } = renderHook(props => useColumnWarnings(props), {
            initialProps: baseParams,
        });
        await flush();
        expect(result.current.warnings).toHaveLength(1);

        rerender({ ...baseParams, sqlText: '' });

        expect(result.current.warnings).toEqual([]);
    });

    it('re-reads the tables from the database, then re-runs the check', async () => {
        const forced = vi.spyOn(useSchemaStore.getState(), 'checkAndFetchColumns');
        forced.mockResolvedValue([]);
        const { result } = renderHook(() => useColumnWarnings(baseParams));
        await flush();

        await act(async () => {
            await result.current.refreshColumns([{ schemaName: 'dbo', name: 'Employee' }]);
        });
        await flush();

        expect(forced).toHaveBeenCalledWith('main', 'db', 'dbo', 'Employee', { force: true });
        expect(findUnknownColumns).toHaveBeenCalledTimes(2);
        forced.mockRestore();
    });

    it('still re-runs the check when re-reading a table fails', async () => {
        const forced = vi.spyOn(useSchemaStore.getState(), 'checkAndFetchColumns');
        forced.mockRejectedValue(new Error('offline'));
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = renderHook(() => useColumnWarnings(baseParams));
        await flush();

        await act(async () => {
            await result.current.refreshColumns([{ schemaName: 'dbo', name: 'Employee' }]);
        });
        await flush();

        expect(findUnknownColumns).toHaveBeenCalledTimes(2);
        forced.mockRestore();
        errors.mockRestore();
    });

    it('reports nothing when the check itself fails', async () => {
        findUnknownColumns.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useColumnWarnings(baseParams));

        await flush();

        expect(result.current.warnings).toEqual([]);
    });
});
