// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { guardResultLeave } from './resultUnsavedGate';
import { useResultUnsavedGate } from './useResultUnsavedGate';

function setup(initial: { hasPendingChanges: boolean; save?: () => Promise<boolean> }) {
    const save = vi.fn(initial.save ?? (async () => true));
    const discard = vi.fn();
    const hook = renderHook(
        ({ hasPendingChanges }) =>
            useResultUnsavedGate({ tabId: 'tab-1', hasPendingChanges, save, discard }),
        { initialProps: { hasPendingChanges: initial.hasPendingChanges } },
    );
    return { ...hook, save, discard };
}

describe('guardResultLeave', () => {
    it('proceeds immediately when no panel is registered for the tab', () => {
        const proceed = vi.fn();

        expect(guardResultLeave('nobody-home', 'run', proceed)).toBe(true);
        expect(proceed).toHaveBeenCalledTimes(1);
    });

    it('proceeds immediately when the panel has nothing unsaved', () => {
        const { unmount } = setup({ hasPendingChanges: false });
        const proceed = vi.fn();

        expect(guardResultLeave('tab-1', 'run', proceed)).toBe(true);
        expect(proceed).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('parks the action and opens the banner when there are unsaved changes', () => {
        const { result, unmount } = setup({ hasPendingChanges: true });
        const proceed = vi.fn();

        act(() => {
            expect(guardResultLeave('tab-1', 'run', proceed)).toBe(false);
        });

        expect(proceed).not.toHaveBeenCalled();
        expect(result.current.bannerProps.open).toBe(true);
        expect(result.current.bannerProps.saveLabel).toBe('Save & Run');
        expect(result.current.bannerProps.discardLabel).toBe('Discard');
        unmount();
    });

    it('stops guarding once the panel unmounts', () => {
        const { unmount } = setup({ hasPendingChanges: true });
        unmount();
        const proceed = vi.fn();

        expect(guardResultLeave('tab-1', 'run', proceed)).toBe(true);
    });
});

describe('useResultUnsavedGate', () => {
    it('runs the action straight away when nothing is unsaved', () => {
        const { result } = setup({ hasPendingChanges: false });
        const proceed = vi.fn();

        act(() => result.current.requestLeave('reload', proceed));

        expect(proceed).toHaveBeenCalledTimes(1);
        expect(result.current.bannerProps.open).toBe(false);
    });

    it('saves and then runs the parked action', async () => {
        const { result, save } = setup({ hasPendingChanges: true });
        const proceed = vi.fn();
        act(() => result.current.requestLeave('filter', proceed));

        await act(async () => result.current.bannerProps.onSave());

        expect(save).toHaveBeenCalledTimes(1);
        expect(proceed).toHaveBeenCalledTimes(1);
        expect(result.current.bannerProps.open).toBe(false);
    });

    it('keeps the banner and does not run the action when the save fails', async () => {
        const { result } = setup({ hasPendingChanges: true, save: async () => false });
        const proceed = vi.fn();
        act(() => result.current.requestLeave('run', proceed));

        await act(async () => result.current.bannerProps.onSave());

        expect(proceed).not.toHaveBeenCalled();
        expect(result.current.bannerProps.open).toBe(true);
    });

    it('discards and stops for reload / run / filter', () => {
        const { result, discard } = setup({ hasPendingChanges: true });
        const proceed = vi.fn();
        act(() => result.current.requestLeave('reload', proceed));

        act(() => result.current.bannerProps.onDiscard());

        expect(discard).toHaveBeenCalledTimes(1);
        expect(proceed).not.toHaveBeenCalled();
        expect(result.current.bannerProps.open).toBe(false);
    });

    it('discards and then closes for close', () => {
        const { result, discard } = setup({ hasPendingChanges: true });
        const proceed = vi.fn();
        act(() => result.current.requestLeave('close', proceed));
        expect(result.current.bannerProps.discardLabel).toBe('Discard & Close');

        act(() => result.current.bannerProps.onDiscard());

        expect(discard).toHaveBeenCalledTimes(1);
        expect(proceed).toHaveBeenCalledTimes(1);
    });

    it('drops the parked action on Keep editing', () => {
        const { result, save, discard } = setup({ hasPendingChanges: true });
        const proceed = vi.fn();
        act(() => result.current.requestLeave('run', proceed));

        act(() => result.current.bannerProps.onKeepEditing());

        expect(result.current.bannerProps.open).toBe(false);
        expect(proceed).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(discard).not.toHaveBeenCalled();
    });

    it('closes the banner when the edits disappear on their own', () => {
        const { result, rerender } = setup({ hasPendingChanges: true });
        act(() => result.current.requestLeave('reload', vi.fn()));
        expect(result.current.bannerProps.open).toBe(true);

        rerender({ hasPendingChanges: false });

        expect(result.current.bannerProps.open).toBe(false);
    });
});
