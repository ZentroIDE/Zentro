// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';

import { guardedReload, reloadResult } from './useResultReload';

describe('reloadResult', () => {
    it('re-runs with the current filter and order when either is set', () => {
        const onFilterRun = vi.fn();
        const onRun = vi.fn();

        reloadResult({
            filterExpr: " order_id = '10255' ",
            orderByExpr: '',
            sourceQuery: 'SELECT * FROM t',
            onFilterRun,
            onRun,
        });

        expect(onFilterRun).toHaveBeenCalledWith("order_id = '10255'", '', 'SELECT * FROM t');
        expect(onRun).not.toHaveBeenCalled();
    });

    it('falls back to the plain run when there is no filter or order', () => {
        const onFilterRun = vi.fn();
        const onRun = vi.fn();

        reloadResult({
            filterExpr: '  ',
            orderByExpr: '',
            sourceQuery: 'SELECT * FROM t',
            onFilterRun,
            onRun,
        });

        expect(onRun).toHaveBeenCalledTimes(1);
        expect(onFilterRun).not.toHaveBeenCalled();
    });

    it('falls back to the plain run when the host has no filter runner', () => {
        const onRun = vi.fn();

        reloadResult({ filterExpr: 'id = 1', orderByExpr: '', sourceQuery: '', onRun });

        expect(onRun).toHaveBeenCalledTimes(1);
    });
});

describe('guardedReload', () => {
    it('hands the reload to the unsaved-changes gate instead of running it', () => {
        const reload = vi.fn();
        const requestLeave = vi.fn();

        guardedReload({ reload, isReadOnlyTab: false, requestLeave });

        expect(requestLeave).toHaveBeenCalledWith('reload', reload);
        expect(reload).not.toHaveBeenCalled();
    });

    it('does nothing on a read-only tab', () => {
        const reload = vi.fn();
        const requestLeave = vi.fn();

        guardedReload({ reload, isReadOnlyTab: true, requestLeave });

        expect(requestLeave).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });
});
