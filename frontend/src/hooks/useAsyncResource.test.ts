// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncResource } from './useAsyncResource';

describe('useAsyncResource', () => {
    it('fetches on mount and exposes the result', async () => {
        const fetchResource = vi.fn().mockResolvedValue('loaded');
        const { result } = renderHook(() => useAsyncResource(fetchResource));

        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.data).toBe('loaded');
        expect(result.current.error).toBeNull();
        expect(fetchResource).toHaveBeenCalledTimes(1);
    });

    it('captures a fetch error and stops loading', async () => {
        const error = new Error('fetch failed');
        const fetchResource = vi.fn().mockRejectedValue(error);
        const { result } = renderHook(() => useAsyncResource(fetchResource));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.data).toBeNull();
        expect(result.current.error).toBe(error);
    });

    it('refresh() re-fetches and updates data', async () => {
        const fetchResource = vi
            .fn()
            .mockResolvedValueOnce('first')
            .mockResolvedValueOnce('second');
        const { result } = renderHook(() => useAsyncResource(fetchResource));

        await waitFor(() => expect(result.current.data).toBe('first'));

        await act(async () => {
            await result.current.refresh();
        });

        expect(result.current.data).toBe('second');
        expect(fetchResource).toHaveBeenCalledTimes(2);
    });

    it('refetches automatically when fetchResource identity changes (e.g. a refreshKey prop bump)', async () => {
        const fetchA = vi.fn().mockResolvedValue('for-table-a');
        const fetchB = vi.fn().mockResolvedValue('for-table-b');
        const { result, rerender } = renderHook(({ fetch }) => useAsyncResource(fetch), {
            initialProps: { fetch: fetchA },
        });

        await waitFor(() => expect(result.current.data).toBe('for-table-a'));
        expect(fetchA).toHaveBeenCalledTimes(1);
        expect(fetchB).not.toHaveBeenCalled();

        rerender({ fetch: fetchB });

        await waitFor(() => expect(result.current.data).toBe('for-table-b'));
        expect(fetchB).toHaveBeenCalledTimes(1);
        expect(fetchA).toHaveBeenCalledTimes(1); // unchanged — the old fetcher isn't called again
    });

    it('runSaving() toggles saving around the callback and clears error on success', async () => {
        const fetchResource = vi.fn().mockResolvedValue('loaded');
        const { result } = renderHook(() => useAsyncResource(fetchResource));
        await waitFor(() => expect(result.current.loading).toBe(false));

        let resolveSave!: () => void;
        const savePromise = new Promise<void>(resolve => {
            resolveSave = resolve;
        });

        let runSavingPromise!: Promise<void>;
        act(() => {
            runSavingPromise = result.current.runSaving(() => savePromise);
        });

        expect(result.current.saving).toBe(true); // dialog/button should show busy while save is in flight

        await act(async () => {
            resolveSave();
            await runSavingPromise;
        });

        expect(result.current.saving).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('runSaving() captures a thrown error, still clears saving, rethrows, and does not touch error', async () => {
        const fetchResource = vi.fn().mockResolvedValue('loaded');
        const { result } = renderHook(() => useAsyncResource(fetchResource));
        await waitFor(() => expect(result.current.loading).toBe(false));

        const saveError = new Error('save failed');
        let runSavingPromise!: Promise<void>;
        await act(async () => {
            runSavingPromise = result.current.runSaving(async () => {
                throw saveError;
            });
            await runSavingPromise.catch(() => {});
        });

        await expect(runSavingPromise).rejects.toThrow('save failed');
        expect(result.current.saving).toBe(false);
        // `error` is load-only — a save failure must not also trip a caller's
        // load-error toast effect (this was a real bug: every migrated view
        // showed a spurious "Failed to load X" toast alongside the correct
        // "Failed to apply X" one on every save failure).
        expect(result.current.error).toBeNull();
    });

    it('setData() lets the caller update data without a refetch', async () => {
        const fetchResource = vi.fn().mockResolvedValue('loaded');
        const { result } = renderHook(() => useAsyncResource(fetchResource));
        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setData('patched');
        });

        expect(result.current.data).toBe('patched');
        expect(fetchResource).toHaveBeenCalledTimes(1);
    });
});
