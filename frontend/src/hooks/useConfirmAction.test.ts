// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConfirmAction } from './useConfirmAction';

describe('useConfirmAction', () => {
    it('starts with no pending target', () => {
        const { result } = renderHook(() => useConfirmAction<string>());
        expect(result.current.pending).toBeNull();
    });

    it('request() opens the dialog for a target', () => {
        const { result } = renderHook(() => useConfirmAction<string>());

        act(() => {
            result.current.request('index_users_email');
        });

        expect(result.current.pending).toBe('index_users_email');
    });

    it('cancel() clears the pending target without running an action', () => {
        const { result } = renderHook(() => useConfirmAction<string>());
        act(() => result.current.request('a'));

        act(() => result.current.cancel());

        expect(result.current.pending).toBeNull();
    });

    it('confirm() keeps the target pending while the action runs, then clears it', async () => {
        const { result } = renderHook(() => useConfirmAction<string>());
        act(() => result.current.request('a'));

        let sawPendingDuring: string | null = null;
        let resolveAction!: () => void;
        const action = vi.fn(
            () =>
                new Promise<void>(resolve => {
                    sawPendingDuring = result.current.pending;
                    resolveAction = resolve;
                }),
        );

        let confirmPromise!: Promise<void>;
        act(() => {
            confirmPromise = result.current.confirm(action);
        });

        expect(sawPendingDuring).toBe('a');
        expect(result.current.pending).toBe('a'); // still open while action is in flight

        await act(async () => {
            resolveAction();
            await confirmPromise;
        });

        expect(action).toHaveBeenCalledWith('a');
        expect(result.current.pending).toBeNull();
    });

    it('confirm() closes the dialog even if the action throws, and rethrows', async () => {
        const { result } = renderHook(() => useConfirmAction<string>());
        act(() => result.current.request('a'));

        const error = new Error('drop failed');
        let confirmPromise!: Promise<void>;
        await act(async () => {
            confirmPromise = result.current.confirm(async () => {
                throw error;
            });
            await confirmPromise.catch(() => {});
        });

        await expect(confirmPromise).rejects.toThrow('drop failed');
        expect(result.current.pending).toBeNull();
    });

    it('confirm() is a no-op when there is no pending target', async () => {
        const { result } = renderHook(() => useConfirmAction<string>());
        const action = vi.fn();

        await act(async () => {
            await result.current.confirm(action);
        });

        expect(action).not.toHaveBeenCalled();
    });
});
