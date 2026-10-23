// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';

import { loadMoreResultTableRows } from './loadMoreRows';

describe('loadMoreResultTableRows', () => {
    it('fetches the next preview page and updates result state', async () => {
        const setOffset = vi.fn();
        const appendRows = vi.fn();
        const touchProgress = vi.fn();
        const markFirstRow = vi.fn();
        const setTotalCount = vi.fn();
        const setDone = vi.fn();

        await loadMoreResultTableRows({
            tabId: 'tab-1',
            previewSessionId: 'preview-1',
            windowStartOffset: 20,
            loadedRowsLength: 5,
            clearFetchingMore: vi.fn(),
            setOffset,
            appendRows,
            touchProgress,
            markFirstRow,
            setTotalCount,
            setDone,
            fetchWritePreviewRows: vi.fn().mockResolvedValue({
                ok: true,
                data: {
                    columns: ['id', 'name'],
                    rows: [['1', 'Alice']],
                    tableName: 'users',
                    totalCount: 50,
                    hasMore: true,
                },
            }),
        });

        expect(setOffset).toHaveBeenCalledWith('tab-1', 25);
        expect(appendRows).toHaveBeenCalledWith(
            'tab-1',
            ['id', 'name'],
            [['1', 'Alice']],
            'users',
            [],
        );
        expect(touchProgress).toHaveBeenCalledWith('tab-1', 1);
        expect(markFirstRow).toHaveBeenCalledWith('tab-1');
        expect(setTotalCount).toHaveBeenCalledWith('tab-1', 50);
        expect(setDone).toHaveBeenCalledWith('tab-1', 1, 0, true, true);
    });

    it('clears fetching state when preview paging is unavailable', async () => {
        const clearFetchingMore = vi.fn();

        await loadMoreResultTableRows({
            tabId: 'tab-1',
            previewSessionId: 'preview-1',
            windowStartOffset: 0,
            loadedRowsLength: 10,
            clearFetchingMore,
            setOffset: vi.fn(),
            appendRows: vi.fn(),
            touchProgress: vi.fn(),
            markFirstRow: vi.fn(),
            setTotalCount: vi.fn(),
            setDone: vi.fn(),
            fetchWritePreviewRows: vi.fn().mockReturnValue(undefined),
        });

        expect(clearFetchingMore).toHaveBeenCalledWith('tab-1');
    });

    it('falls back to normal row paging when there is no preview session', async () => {
        const fetchMoreRows = vi.fn().mockResolvedValue({ ok: true, data: undefined });

        await loadMoreResultTableRows({
            tabId: 'tab-1',
            windowStartOffset: 30,
            loadedRowsLength: 10,
            clearFetchingMore: vi.fn(),
            setOffset: vi.fn(),
            appendRows: vi.fn(),
            touchProgress: vi.fn(),
            markFirstRow: vi.fn(),
            setTotalCount: vi.fn(),
            setDone: vi.fn(),
            fetchMoreRows,
        });

        expect(fetchMoreRows).toHaveBeenCalledWith('tab-1', 40);
    });

    it('clears fetching state when normal row paging fails', async () => {
        const clearFetchingMore = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await loadMoreResultTableRows({
            tabId: 'tab-1',
            windowStartOffset: 0,
            loadedRowsLength: 10,
            clearFetchingMore,
            setOffset: vi.fn(),
            appendRows: vi.fn(),
            touchProgress: vi.fn(),
            markFirstRow: vi.fn(),
            setTotalCount: vi.fn(),
            setDone: vi.fn(),
            fetchMoreRows: vi.fn().mockResolvedValue({
                ok: false,
                error: { code: 'query.fetch.failed', message: 'boom' },
            }),
        });

        expect(clearFetchingMore).toHaveBeenCalledWith('tab-1');
        consoleErrorSpy.mockRestore();
    });
});
