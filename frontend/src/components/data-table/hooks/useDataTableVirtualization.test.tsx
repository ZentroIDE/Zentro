// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RT_ROW_HEIGHT } from '../gridMetrics';

import { useDataTableVirtualization } from './useDataTableVirtualization';

/** Virtual item geometry, built from the same constant the hook uses so the
 *  fixture can never drift from the real row height. */
const rowItem = (index: number) => ({
    index,
    start: index * RT_ROW_HEIGHT,
    end: (index + 1) * RT_ROW_HEIGHT,
});

const mockScrollToIndex = vi.fn();

let mockRowVirtualItems: Array<{ index: number; start: number; end: number }> = [];
let mockColumnVirtualItems: Array<{ index: number; start: number; end: number }> = [];
let columnEstimateSize: ((index: number) => number) | null = null;
let rowVirtualizerCount: number | null = null;
let rowRangeExtractor: ((range: RangeInput) => number[]) | null = null;
let mockScrollDirection: 'forward' | 'backward' | null = null;

interface RangeInput {
    startIndex: number;
    endIndex: number;
    overscan: number;
    count: number;
}

function createScrollElement(overrides: Partial<HTMLDivElement> = {}) {
    return {
        clientHeight: 440,
        scrollHeight: 2200,
        scrollTop: 0,
        // The hook measures a rendered row through the scroll host; jsdom does
        // no layout, so there is nothing to find.
        querySelector: () => null,
        // The hook toggles an `rt-is-scrolling` class on scroll for CSS
        // (see components.css); this stub just needs to not throw.
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        ...overrides,
    } as unknown as HTMLDivElement;
}

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({
        count,
        horizontal,
        estimateSize,
        rangeExtractor,
    }: {
        count: number;
        horizontal?: boolean;
        estimateSize: (index: number) => number;
        rangeExtractor?: (range: RangeInput) => number[];
    }) => ({
        scrollDirection: horizontal ? null : mockScrollDirection,
        getVirtualItems: () => {
            if (horizontal) {
                columnEstimateSize = estimateSize;
            } else {
                rowVirtualizerCount = count;
                rowRangeExtractor = rangeExtractor ?? null;
            }
            return horizontal
                ? // Fresh array each call, like the real virtualizer can return,
                  // so the identity-stability test is meaningful.
                  mockColumnVirtualItems.map(item => ({ ...item }))
                : mockRowVirtualItems.filter(item => item.index < count);
        },
        getTotalSize: () => count * (horizontal ? 140 : RT_ROW_HEIGHT),
        measure: vi.fn(),
        scrollToIndex: mockScrollToIndex,
    }),
}));

describe('useDataTableVirtualization', () => {
    beforeEach(() => {
        mockScrollToIndex.mockReset();
        mockRowVirtualItems = [];
        mockColumnVirtualItems = [];
        columnEstimateSize = null;
        rowVirtualizerCount = null;
        rowRangeExtractor = null;
        mockScrollDirection = null;
    });

    const buildArgs = (
        overrides: Partial<Parameters<typeof useDataTableVirtualization>[0]> = {},
    ) => ({
        isDone: true,
        hasMore: true,
        isFetchingMore: false,
        tableRowsLength: 100,
        columnsLength: 3,
        loadedRowsLength: 100,
        onNearBottom: vi.fn(),
        ...overrides,
    });

    it('triggers onNearBottom when viewport reaches the load-more zone', () => {
        mockRowVirtualItems = [rowItem(99)];
        const args = buildArgs();

        renderHook(() => useDataTableVirtualization(args));

        expect(args.onNearBottom).toHaveBeenCalledWith(
            expect.objectContaining({ totalLoadedRows: 100 }),
        );
    });

    it('does not trigger while the main query is still running', () => {
        mockRowVirtualItems = [rowItem(99)];
        const args = buildArgs({ isDone: false });

        renderHook(() => useDataTableVirtualization(args));

        expect(args.onNearBottom).not.toHaveBeenCalled();
    });

    it('prefetches when the viewport is within roughly one screen of the end', () => {
        mockRowVirtualItems = [rowItem(79)];
        const args = buildArgs();

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });

        (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
            createScrollElement({
                clientHeight: 440,
                scrollHeight: 2222,
                scrollTop: 0,
            });

        rerender(args);

        expect(args.onNearBottom).not.toHaveBeenCalled();

        mockRowVirtualItems = [rowItem(80)];
        const scrollElement = (
            result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>
        ).current as HTMLDivElement;
        scrollElement.scrollTop = 1342;
        rerender(args);
        result.current.handleScroll();

        expect(args.onNearBottom).toHaveBeenCalledWith(
            expect.objectContaining({ totalLoadedRows: 100 }),
        );
    });

    it('does not re-trigger onNearBottom for the same fetch cycle', () => {
        mockRowVirtualItems = [rowItem(99)];
        const args = buildArgs();

        const { rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });

        rerender(args);

        expect(args.onNearBottom).toHaveBeenCalledTimes(1);
    });

    it('re-arms fetch state when isFetchingMore resets to false', () => {
        mockRowVirtualItems = [rowItem(99)];
        const args = buildArgs();

        const { rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });

        rerender({ ...args, isFetchingMore: true, loadedRowsLength: 120, tableRowsLength: 120 });

        mockRowVirtualItems = [rowItem(119)];
        rerender({ ...args, isFetchingMore: false, loadedRowsLength: 120, tableRowsLength: 120 });

        expect(args.onNearBottom).toHaveBeenCalledTimes(2);
    });

    it('does not trigger when hasMore is false', () => {
        mockRowVirtualItems = [rowItem(99)];
        const args = buildArgs({ hasMore: false });

        renderHook(() => useDataTableVirtualization(args));

        expect(args.onNearBottom).not.toHaveBeenCalled();
    });

    it('uses loadedRowsLength as the payload totalLoadedRows', () => {
        mockRowVirtualItems = [rowItem(80)];
        const args = buildArgs({ loadedRowsLength: 80, tableRowsLength: 100 });

        renderHook(() => useDataTableVirtualization(args));

        expect(args.onNearBottom).toHaveBeenCalledWith(
            expect.objectContaining({ totalLoadedRows: 80 }),
        );
    });

    it('keeps renderedColumnIndexes identity while the rendered range is unchanged', () => {
        mockColumnVirtualItems = [
            { index: 0, start: 0, end: 140 },
            { index: 1, start: 140, end: 280 },
        ];
        const args = buildArgs({ hasMore: false });

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const first = result.current.renderedColumnIndexes;

        rerender({ ...args });

        expect(result.current.renderedColumnIndexes).toBe(first);
        expect(result.current.renderedColumnIndexes).toEqual([0, 1]);

        mockColumnVirtualItems = [
            { index: 1, start: 140, end: 280 },
            { index: 2, start: 280, end: 420 },
        ];
        rerender({ ...args });

        expect(result.current.renderedColumnIndexes).not.toBe(first);
        expect(result.current.renderedColumnIndexes).toEqual([1, 2]);
    });

    it('keeps a stable handleScroll identity across renders', () => {
        const args = buildArgs({ hasMore: false });
        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const first = result.current.handleScroll;

        rerender({ ...args, loadedRowsLength: 120, tableRowsLength: 120 });

        expect(result.current.handleScroll).toBe(first);
    });

    it('sizes the column virtualizer from real column widths', () => {
        const args = buildArgs({ hasMore: false, columnWidths: [80, 240, 120] });

        const { result } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });

        expect(result.current.renderedColumnIndexes).toEqual([0, 1, 2]);
        expect(columnEstimateSize?.(0)).toBe(80);
        expect(columnEstimateSize?.(1)).toBe(240);
        expect(columnEstimateSize?.(2)).toBe(120);
    });

    it('collapses rows evicted above the window into a single slot', () => {
        mockRowVirtualItems = [rowItem(0)];
        const args = buildArgs({ windowStartOffset: 500, tableRowsLength: 100 });

        const { result } = renderHook(() => useDataTableVirtualization(args));

        // One slot for everything evicted, 100 loaded rows, one "loading more"
        // slot. Not 601, which is what reserving a row per evicted row costs.
        expect(rowVirtualizerCount).toBe(102);
        expect(result.current.leadingPlaceholderRows).toBe(1);
    });

    it('reserves no leading slot while nothing has been evicted', () => {
        mockRowVirtualItems = [rowItem(0)];
        const args = buildArgs({ windowStartOffset: 0, tableRowsLength: 100 });

        const { result } = renderHook(() => useDataTableVirtualization(args));

        expect(rowVirtualizerCount).toBe(101);
        expect(result.current.leadingPlaceholderRows).toBe(0);
    });

    it('compensates the scroll offset when the loaded window slides', () => {
        mockRowVirtualItems = [rowItem(0)];
        const args = buildArgs({ windowStartOffset: 100, tableRowsLength: 100 });

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const scrollElement = createScrollElement({ scrollTop: 5000 });
        (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
            scrollElement;

        // 100 more rows evicted: the rows below them move up by 100 slots, so
        // the offset has to come down by the same distance or the view jumps.
        rerender({ ...args, windowStartOffset: 200 });

        expect(scrollElement.scrollTop).toBe(5000 - 100 * RT_ROW_HEIGHT);
    });

    it('does not compensate when a new result set resets the window', () => {
        mockRowVirtualItems = [rowItem(0)];
        const args = buildArgs({
            scrollKey: 'tab-reset:1',
            windowStartOffset: 800,
            tableRowsLength: 100,
        });

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const scrollElement = createScrollElement({ scrollTop: 4000 });
        (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
            scrollElement;

        // New query: the window resets, which is not the window sliding back.
        rerender({ ...args, scrollKey: 'tab-reset:2', windowStartOffset: 0 });

        expect(scrollElement.scrollTop).toBe(0);
    });

    it('holds the viewport inside the rendered rows when scrolling outruns render', () => {
        mockRowVirtualItems = Array.from({ length: 100 }, (_, index) => rowItem(index));
        const args = buildArgs();

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const scrollElement = createScrollElement({ clientHeight: 440, scrollTop: 5000 });
        (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
            scrollElement;

        rerender({ ...args });

        // Rendered rows end at 100 * RT_ROW_HEIGHT; the viewport may not go past
        // that, or it shows bare scroll padding.
        expect(scrollElement.scrollTop).toBe(100 * RT_ROW_HEIGHT - 440);
    });

    describe('scroll buffer', () => {
        const RANGE: RangeInput = {
            startIndex: 100,
            endIndex: 140,
            overscan: 16,
            count: 1000,
        };

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        const scrollTo = (
            result: { current: ReturnType<typeof useDataTableVirtualization> },
            element: HTMLDivElement,
            top: number,
            afterMs: number,
        ) => {
            vi.advanceTimersByTime(afterMs);
            element.scrollTop = top;
            result.current.handleScroll();
        };

        it('keeps a modest buffer while the grid is idle', () => {
            mockRowVirtualItems = [rowItem(120)];
            const { result } = renderHook(() => useDataTableVirtualization(buildArgs()));

            expect(rowRangeExtractor).toBeTruthy();
            // 320px of buffer at a 20px row is 16 rows on both sides.
            expect(rowRangeExtractor?.(RANGE)[0]).toBe(100 - 16);
            expect(rowRangeExtractor?.(RANGE).at(-1)).toBe(140 + 16);
        });

        it('grows the leading buffer with scroll speed', () => {
            mockRowVirtualItems = [rowItem(120)];
            mockScrollDirection = 'forward';
            const { result } = renderHook(() => useDataTableVirtualization(buildArgs()));
            const element = createScrollElement({ scrollTop: 0 });
            (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
                element;

            scrollTo(result, element, 0, 16);
            // ~31px per millisecond: a hard flick. The buffer saturates at its
            // 1000px cap, which is 50 rows ahead.
            scrollTo(result, element, 500, 16);

            const indexes = rowRangeExtractor?.(RANGE) ?? [];
            expect(indexes.at(-1)).toBe(140 + 50);
        });

        it('never starves the trailing side, so reversing direction stays covered', () => {
            mockRowVirtualItems = [rowItem(120)];
            mockScrollDirection = 'forward';
            const { result } = renderHook(() => useDataTableVirtualization(buildArgs()));
            const element = createScrollElement({ scrollTop: 0 });
            (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
                element;

            scrollTo(result, element, 0, 16);
            scrollTo(result, element, 500, 16);

            const indexes = rowRangeExtractor?.(RANGE) ?? [];
            // Half the leading buffer, floored at the idle buffer: 25 rows, not
            // the handful that made every direction change flash blank.
            expect(indexes[0]).toBe(100 - 25);
        });
    });

    it('lets a short result scroll all the way to its last row', () => {
        // Every row fits in the rendered window, so both spacers are zero and
        // there is nothing unrendered to hold back from. The scroll box is
        // taller than the rows by the height of the sticky header, and that last
        // stretch has to stay reachable or the final row can never be read.
        const ROWS = 37;
        mockRowVirtualItems = Array.from({ length: ROWS }, (_, index) => rowItem(index));
        const args = buildArgs({
            hasMore: false,
            tableRowsLength: ROWS,
            loadedRowsLength: ROWS,
        });

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const headerHeight = 22;
        const viewportHeight = 300;
        const scrolledToBottom = ROWS * RT_ROW_HEIGHT + headerHeight - viewportHeight;
        const scrollElement = createScrollElement({
            clientHeight: viewportHeight,
            scrollHeight: ROWS * RT_ROW_HEIGHT + headerHeight,
            scrollTop: scrolledToBottom,
        });
        (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
            scrollElement;

        rerender({ ...args });

        expect(result.current.paddingBottom).toBe(0);
        expect(scrollElement.scrollTop).toBe(scrolledToBottom);
    });

    it('resets scroll position when scrollKey changes (new query)', () => {
        mockRowVirtualItems = [rowItem(99)];
        const args = buildArgs({ scrollKey: 'tab-1:1' });

        const { result, rerender } = renderHook(props => useDataTableVirtualization(props), {
            initialProps: args,
        });
        const scrollElement = createScrollElement({ scrollTop: 180 });
        (result.current.parentRef as React.MutableRefObject<HTMLDivElement | null>).current =
            scrollElement;

        rerender({ ...args, scrollKey: 'tab-1:2', loadedRowsLength: 50, tableRowsLength: 50 });

        expect(scrollElement.scrollTop).toBe(0);
        expect(mockScrollToIndex).toHaveBeenCalledWith(0, { align: 'start' });
    });
});
