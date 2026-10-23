// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabResult } from '../../../stores/resultStore';
import { useExportState } from './useExportState';

const result = {
    columns: ['id', 'email', 'name'],
    rows: [
        ['1', 'alice@example.com', 'Alice'],
        ['2', 'bob@example.com', 'Bob'],
    ],
    tableName: 'users',
} as unknown as TabResult;

function setup(blurred: ReadonlySet<number> | undefined) {
    const runExport = vi.fn();
    const toast = { error: vi.fn(), info: vi.fn() };
    const hook = renderHook(
        (props: { blurred: ReadonlySet<number> | undefined }) =>
            useExportState({ result, blurredColumnIndexes: props.blurred, runExport, toast }),
        { initialProps: { blurred } },
    );
    act(() => hook.result.current.handleOpenExportModal());
    return { hook, runExport, toast };
}

describe('useExportState with blurred columns', () => {
    it('excludes blurred columns from the selection and preview by default', () => {
        const { hook } = setup(new Set([1]));

        expect(hook.result.current.orderedSelectedExportColumns).toEqual(['id', 'name']);
        expect(hook.result.current.previewExportRows[0]).toEqual(['1', 'Alice']);
        expect(hook.result.current.hasBlurredExportColumns).toBe(true);
        expect(hook.result.current.includeBlurredColumns).toBe(false);
    });

    it('exports without the blurred column and says so', () => {
        const { hook, runExport, toast } = setup(new Set([1]));

        act(() => hook.result.current.handleConfirmExport());

        expect(runExport).toHaveBeenCalledWith(
            expect.objectContaining({ selectedColumns: ['id', 'name'] }),
        );
        expect(toast.info).toHaveBeenCalledWith('1 blurred column excluded from export.');
    });

    it('cannot tick a locked blurred column', () => {
        const { hook } = setup(new Set([1]));

        act(() => hook.result.current.toggleExportColumn('email'));

        expect(hook.result.current.orderedSelectedExportColumns).not.toContain('email');
    });

    it('includes blurred columns once the user opts in', () => {
        const { hook, runExport, toast } = setup(new Set([1]));

        act(() => hook.result.current.setIncludeBlurredColumns(true));
        expect(hook.result.current.orderedSelectedExportColumns).toEqual(['id', 'email', 'name']);

        act(() => hook.result.current.handleConfirmExport());

        expect(runExport).toHaveBeenCalledWith(
            expect.objectContaining({ selectedColumns: ['id', 'email', 'name'] }),
        );
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('resets the opt-in each time the modal opens', () => {
        const { hook } = setup(new Set([1]));
        act(() => hook.result.current.setIncludeBlurredColumns(true));

        act(() => hook.result.current.handleOpenExportModal());

        expect(hook.result.current.includeBlurredColumns).toBe(false);
        expect(hook.result.current.orderedSelectedExportColumns).toEqual(['id', 'name']);
    });

    it('drops a stale opt-in when nothing is blurred any more', () => {
        const { hook } = setup(new Set([1]));
        act(() => hook.result.current.setIncludeBlurredColumns(true));

        hook.rerender({ blurred: undefined });

        expect(hook.result.current.hasBlurredExportColumns).toBe(false);
        expect(hook.result.current.includeBlurredColumns).toBe(false);
    });

    it('refuses to export when every selected column is blurred', () => {
        const { hook, runExport, toast } = setup(new Set([0, 1, 2]));

        act(() => hook.result.current.handleConfirmExport());

        expect(runExport).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith('Select at least one column to export.');
    });

    it('behaves as before when no column is blurred', () => {
        const { hook, runExport, toast } = setup(undefined);

        act(() => hook.result.current.handleConfirmExport());

        expect(runExport).toHaveBeenCalledWith(
            expect.objectContaining({ selectedColumns: ['id', 'email', 'name'] }),
        );
        expect(toast.info).not.toHaveBeenCalled();
    });
});
