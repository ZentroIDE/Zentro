// SPDX-License-Identifier: GPL-3.0-only

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
} from 'react';
import { useVirtualizer, type Range } from '@tanstack/react-virtual';

import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { RT_DEFAULT_COLUMN_WIDTH, RT_ROW_HEIGHT } from '../gridMetrics';

type FetchMoreState = 'idle' | 'fetching';
const MIN_PREFETCH_ROWS = 20;

/**
 * Row buffer kept rendered outside the viewport, sized by scroll speed.
 *
 * Scrolling is handled on the compositor thread: it moves the view and paints a
 * frame before the scroll event ever reaches JavaScript. So the buffer is not
 * insurance against React being slow, it is the only thing standing between a
 * flick and a blank strip, and it has to be at least as deep as the distance
 * one flick covers between frames. A fixed row count cannot do that, because
 * the distance depends entirely on how hard the user threw the wheel: the same
 * buffer that is wasteful at reading speed is far too shallow at flick speed.
 *
 * So the buffer is measured in pixels of travel, not rows, and scales with the
 * measured velocity. `LOOKAHEAD` is how far ahead in time it aims to cover.
 */
const BUFFER_MIN_PX = 320;
const BUFFER_MAX_PX = 1000;
const BUFFER_LOOKAHEAD_MS = 200;
/** Velocity is treated as zero once scrolling has been quiet this long. */
const VELOCITY_IDLE_MS = 200;
/** Nominal value handed to the virtualizer; the range extractor does the real
 *  sizing, but this participates in its memo key. */
const OVERSCAN_NOMINAL = Math.ceil(BUFFER_MIN_PX / RT_ROW_HEIGHT);

// Module-level scroll position cache keyed by scrollKey.
// Survives component remount (tab switches) within a session.
const savedScrollPositions = new Map<string, { top: number; left: number }>();

interface UseDataTableVirtualizationArgs {
    scrollKey?: string;
    isDone: boolean;
    hasMore: boolean;
    isFetchingMore: boolean;
    tableRowsLength: number;
    columnsLength: number;
    loadedRowsLength: number;
    windowStartOffset?: number;
    /** Real rendered width of each visible data column, in visual order and
     *  excluding the sticky row-number column. Without it the column
     *  virtualizer falls back to a flat estimate, so every resized column makes
     *  the horizontal spacers disagree with the rendered cells. */
    columnWidths?: number[];
    onNearBottom?: (payload: { visibleEndIndex: number; totalLoadedRows: number }) => void;
    onViewportChange?: (range: { start: number; end: number }) => void;
}

export interface DataTableVirtualization {
    parentRef: RefObject<HTMLDivElement>;
    handleScroll: () => void;
    /** Virtual slots reserved ahead of the loaded window: one row standing in
     *  for everything evicted above it, or none when nothing was evicted.
     *  Callers map a virtual index to a loaded row by subtracting this. */
    leadingPlaceholderRows: number;
    /** Height the virtualizer is positioning rows with. Placeholder rows must
     *  use this and not the constant, or they reintroduce the drift. */
    rowHeight: number;
    virtualItems: Array<{ index: number; start: number; end: number }>;
    renderedColumnIndexes: number[];
    paddingTop: number;
    paddingBottom: number;
    columnPaddingLeft: number;
    columnPaddingRight: number;
}

export function useDataTableVirtualization({
    scrollKey,
    isDone,
    hasMore,
    isFetchingMore,
    tableRowsLength,
    columnsLength,
    loadedRowsLength,
    windowStartOffset = 0,
    columnWidths,
    onNearBottom,
    onViewportChange,
}: UseDataTableVirtualizationArgs): DataTableVirtualization {
    const parentRef = useRef<HTMLDivElement>(null);

    // Rows evicted above the loaded window are gone for good: nothing in the app
    // re-requests them. Reserving scroll space per evicted row therefore only
    // buys thousands of empty rows to scroll through, so they collapse into a
    // single slot that says what happened.
    const leadingPlaceholderRows = windowStartOffset > 0 ? 1 : 0;

    // Virtual rows must include draft rows that only exist client-side so they
    // are allocated visible slots immediately after the user creates them, plus
    // one trailing slot for the "loading more" row while the tail is unfetched.
    const virtualCount = leadingPlaceholderRows + tableRowsLength + (hasMore ? 1 : 0);

    // Read through a ref so a fresh widths array does not re-create the
    // virtualizer's size getter on every render.
    const columnWidthsRef = useRef(columnWidths);
    columnWidthsRef.current = columnWidths;
    const columnCount = columnWidths ? columnWidths.length : Math.max(columnsLength, 0);

    // Rows are uniform, so one measurement describes all of them. Reading the
    // real height back out of the DOM keeps the virtualizer's geometry exact
    // even if the stylesheet's row height later changes: an estimate that is
    // off by a pixel makes the spacer rows disagree with the rendered rows, and
    // the content box then grows and shrinks under the scrollbar on every
    // frame — which is what reads as stuttering scroll.
    const rowHeightRef = useRef(RT_ROW_HEIGHT);
    const [rowHeight, setRowHeight] = useState(RT_ROW_HEIGHT);

    const scrollDirectionRef = useRef<'forward' | 'backward' | null>(null);
    // Smoothed scroll speed in pixels per millisecond, sampled in the scroll
    // handler below. Smoothed because one stuttering frame must not be allowed
    // to collapse the buffer just as the user is flicking hardest.
    const velocityRef = useRef(0);
    const velocitySampleRef = useRef({ offset: 0, time: 0 });

    const currentVelocity = () =>
        performance.now() - velocitySampleRef.current.time > VELOCITY_IDLE_MS
            ? 0
            : velocityRef.current;

    const rowRangeExtractor = useCallback((range: Range) => {
        const rowSize = rowHeightRef.current || RT_ROW_HEIGHT;
        const leadingPx = Math.min(
            BUFFER_MAX_PX,
            Math.max(BUFFER_MIN_PX, currentVelocity() * BUFFER_LOOKAHEAD_MS),
        );
        // The trailing side never drops to a token amount. Reversing direction
        // makes it the leading side instantly, one full frame before the
        // virtualizer has even observed that the direction changed, and a
        // starved trailing buffer is a guaranteed blank strip on every reversal.
        const trailingPx = Math.max(BUFFER_MIN_PX, leadingPx / 2);

        const leading = Math.ceil(leadingPx / rowSize);
        const trailing = Math.ceil(trailingPx / rowSize);
        const goingForward = scrollDirectionRef.current === 'forward';
        const before = goingForward ? trailing : leading;
        const after = goingForward ? leading : trailing;

        const start = Math.max(range.startIndex - before, 0);
        const end = Math.min(range.endIndex + after, range.count - 1);
        const indexes: number[] = [];
        for (let index = start; index <= end; index += 1) indexes.push(index);
        return indexes;
    }, []);

    const rowVirtualizer = useVirtualizer({
        count: virtualCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => rowHeightRef.current,
        overscan: OVERSCAN_NOMINAL,
        rangeExtractor: rowRangeExtractor,
    });
    // Read by the range extractor above, which runs while this render resolves
    // the visible items.
    scrollDirectionRef.current = rowVirtualizer.scrollDirection;
    const columnVirtualizer = useVirtualizer({
        count: columnCount,
        horizontal: true,
        getScrollElement: () => parentRef.current,
        estimateSize: index => columnWidthsRef.current?.[index] ?? RT_DEFAULT_COLUMN_WIDTH,
        overscan: 4,
    });

    // Column widths change on resize, auto-fit, reorder and visibility toggles.
    // The virtualizer caches measurements, so it has to be told explicitly.
    const columnWidthsSignature = columnWidths ? columnWidths.join(',') : '';
    useEffect(() => {
        columnVirtualizer.measure();
        // columnVirtualizer is stable for the life of the component.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnWidthsSignature]);

    // Measured off the first real row, after paint, and only when the row count
    // changes — never on the scroll path.
    useEffect(() => {
        if (tableRowsLength === 0) return;
        const frame = requestAnimationFrame(() => {
            const rowEl = parentRef.current?.querySelector<HTMLElement>('[data-rt-row]');
            if (!rowEl) return;
            const measured = rowEl.getBoundingClientRect().height;
            if (measured <= 0) return;
            if (Math.abs(measured - rowHeightRef.current) < 0.5) return;
            rowHeightRef.current = measured;
            setRowHeight(measured);
            rowVirtualizer.measure();
            const el = parentRef.current;
            if (el) measureListOffset(el);
        });
        return () => cancelAnimationFrame(frame);
    }, [tableRowsLength, rowVirtualizer]);

    const virtualItems = rowVirtualizer.getVirtualItems();
    const virtualColumns = columnVirtualizer.getVirtualItems();

    // Keep a stable array identity while the rendered column range is unchanged.
    // Body rows are memoized on this prop, so a fresh array on every vertical
    // scroll frame would defeat the memo for the entire table body.
    const columnIndexSignature =
        virtualColumns.length > 0 ? virtualColumns.map(item => item.index).join(',') : '';
    const renderedColumnIndexes = useMemo(
        () =>
            columnIndexSignature.length > 0
                ? columnIndexSignature.split(',').map(Number)
                : Array.from({ length: columnCount }, (_, index) => index),
        [columnIndexSignature, columnCount],
    );

    const fetchStateRef = useRef<FetchMoreState>('idle');
    const scrollStateRef = useRef({ top: 0, left: 0 });
    // Cached by the ResizeObserver below. Reading clientHeight/scrollHeight from
    // inside a scroll handler forces a synchronous layout of the whole table on
    // every scroll event, which is the most expensive thing this grid can do
    // per frame.
    const viewportHeightRef = useRef(0);
    const isVisibleRef = useRef(true);
    // Distance from the top of the scroll content down to the first row: the
    // sticky header, plus any banner above the table. The virtualizer measures
    // rows from zero, so its offsets and the element's scrollTop disagree by
    // exactly this much, and anything comparing the two has to bridge it.
    const listOffsetRef = useRef(0);
    const totalHeightRef = useRef(0);

    const measureListOffset = (el: HTMLDivElement) => {
        // Read in places that already run after layout. scrollHeight covers the
        // header and the banner without having to know either is there.
        const offset = el.scrollHeight - totalHeightRef.current;
        if (Number.isFinite(offset) && offset >= 0) listOffsetRef.current = offset;
    };
    // Timestamp until which the scroll clamp stands down. Every programmatic
    // scroll write goes through `scrollTo` below and sets it, so restoring a
    // saved position is never mistaken for the user outrunning the renderer.
    const programmaticScrollUntilRef = useRef(0);

    const scrollTo = (el: HTMLDivElement, top: number, left?: number) => {
        programmaticScrollUntilRef.current = performance.now() + 300;
        el.scrollTop = top;
        if (left !== undefined) el.scrollLeft = left;
    };

    // Glides mouse-wheel notches instead of stepping 100px at a time. The glide
    // writes scrollTop on animation frames, which reads to everything below
    // (velocity sampling, the scroll clamp, prefetch) as the user scrolling, so
    // none of it needs to know. The one exception is `scrollTo` above: those
    // writes are deliberate offset compensation (an evicted window shifting the
    // rows), so the glide is told to carry them along rather than end.
    useSmoothWheelScroll(parentRef, {
        axis: 'y',
        isProgrammaticScroll: () => performance.now() < programmaticScrollUntilRef.current,
    });

    const resetFetchState = () => {
        fetchStateRef.current = 'idle';
    };

    const maybeFetchMore = () => {
        if (!isDone || !hasMore || fetchStateRef.current === 'fetching' || isFetchingMore) return;
        if (virtualItems.length === 0) return;

        const lastItem = virtualItems[virtualItems.length - 1];
        const viewportRows = Math.ceil(viewportHeightRef.current / rowHeightRef.current);
        const prefetchDistancePx = Math.max(MIN_PREFETCH_ROWS, viewportRows) * rowHeightRef.current;
        // Derived from the virtualizer rather than the DOM: the same number the
        // spacer rows are built from, and free of layout cost.
        const remainingScrollPx = rowVirtualizer.getTotalSize() - lastItem.end;
        if (remainingScrollPx > prefetchDistancePx) return;

        fetchStateRef.current = 'fetching';
        onNearBottom?.({ visibleEndIndex: lastItem.index, totalLoadedRows: loadedRowsLength });
    };

    // Restore scroll position when scrollKey changes (new query or tab remount)
    useEffect(() => {
        if (!scrollKey) return;
        const scrollEl = parentRef.current;
        if (!scrollEl) return;

        resetFetchState();

        const saved = savedScrollPositions.get(scrollKey);
        if (saved) {
            scrollStateRef.current = saved;
            scrollTo(scrollEl, saved.top, saved.left);
        } else {
            savedScrollPositions.set(scrollKey, { top: 0, left: 0 });
            scrollStateRef.current = { top: 0, left: 0 };
            scrollTo(scrollEl, 0);
            rowVirtualizer.scrollToIndex(0, { align: 'start' });
        }
    }, [scrollKey, rowVirtualizer]);

    useEffect(() => {
        if (!hasMore) resetFetchState();
    }, [hasMore]);

    useEffect(() => {
        if (!isFetchingMore) resetFetchState();
    }, [isFetchingMore]);

    useEffect(() => {
        maybeFetchMore();
    }, [hasMore, isDone, isFetchingMore, loadedRowsLength, virtualItems]);

    // Emit viewport range for callers that want to know what's visible
    useEffect(() => {
        if (!onViewportChange || virtualItems.length === 0) return;
        onViewportChange({
            start: virtualItems[0]?.index ?? 0,
            end: virtualItems[virtualItems.length - 1]?.index ?? 0,
        });
    }, [onViewportChange, virtualItems]);

    // When the container is hidden via `display: none` (e.g. CSS `hidden` class on a parent),
    // browsers reset scrollTop to 0. TanStack Virtual's own ResizeObserver updates scrollRect
    // before our useLayoutEffect can run, so checking scrollRect.height === 0 is always false
    // by then. Instead, use our own ResizeObserver to detect the 0 → visible transition and
    // restore scrollTop in the same notification batch.
    //
    // It doubles as the sampling point for the viewport height: measuring here is free (the
    // observer already runs after layout) and it keeps the scroll handler layout-free.
    useEffect(() => {
        const el = parentRef.current;
        if (!el) return;

        let prevHeight = el.offsetHeight;
        viewportHeightRef.current = prevHeight;
        isVisibleRef.current = prevHeight > 0;

        const observer = new ResizeObserver(() => {
            const newHeight = el.offsetHeight;
            if (prevHeight === 0 && newHeight > 0) {
                const { top, left } = scrollStateRef.current;
                if (top > 0 || left > 0) scrollTo(el, top, left);
            }
            prevHeight = newHeight;
            viewportHeightRef.current = newHeight;
            isVisibleRef.current = newHeight > 0;
            measureListOffset(el);
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Collapsing the evicted region means the rows below it move up in virtual
    // space whenever the window slides. Compensate the scroll offset by the same
    // amount so the rows under the cursor stay put, which is what reserving a
    // slot per evicted row used to buy.
    const windowShiftRef = useRef({
        start: windowStartOffset,
        leading: leadingPlaceholderRows,
        key: scrollKey,
    });
    useLayoutEffect(() => {
        const previous = windowShiftRef.current;
        windowShiftRef.current = {
            start: windowStartOffset,
            leading: leadingPlaceholderRows,
            key: scrollKey,
        };
        if (previous.start === windowStartOffset && previous.leading === leadingPlaceholderRows) {
            return;
        }
        // A new result set resets the window to zero, which is not the window
        // sliding. The scroll-restore effect owns the offset in that case.
        if (previous.key !== scrollKey) return;

        const el = parentRef.current;
        if (!el) return;
        const evicted = windowStartOffset - previous.start;
        const shiftPx =
            (leadingPlaceholderRows - previous.leading - evicted) * rowHeightRef.current;
        if (shiftPx === 0) return;
        scrollTo(el, Math.max(0, el.scrollTop + shiftPx));
    }, [windowStartOffset, leadingPlaceholderRows, scrollKey]);

    const totalHeight = rowVirtualizer.getTotalSize();
    totalHeightRef.current = totalHeight;
    const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
    const paddingBottom =
        virtualItems.length > 0
            ? totalHeight - (virtualItems[virtualItems.length - 1]?.end ?? 0)
            : 0;

    // Hold the viewport inside the rows that actually exist in the DOM.
    // Scrolling runs on the compositor, so a hard flick can expose ground React
    // has not rendered yet, and that strip paints as bare scroll padding.
    // Clamping stops the scroll at the edge of what is rendered instead, which
    // is the difference between a grid that feels solid and one that flashes
    // empty.
    useLayoutEffect(() => {
        const el = parentRef.current;
        if (!el || virtualItems.length === 0) return;
        if (performance.now() < programmaticScrollUntilRef.current) return;

        // Only ever hold back from ground that is genuinely unrendered. Where a
        // spacer is zero the window already reaches that end of the list, and
        // clamping there would fence off scroll the user is entitled to.
        if (paddingTop <= 0 && paddingBottom <= 0) return;

        // The cached height is normally warm; fall back to a direct read for the
        // window between mount and the first ResizeObserver callback.
        const viewportHeight = viewportHeightRef.current || el.clientHeight;
        if (viewportHeight <= 0) return;

        // Virtualizer offsets start at the first row; scrollTop starts at the
        // top of the scroll box, above the sticky header. Bridge the two or the
        // bottom limit lands a header short of the real end of the list.
        const listOffset = listOffsetRef.current;
        const renderedTop = listOffset + (virtualItems[0]?.start ?? 0);
        const renderedBottom = listOffset + (virtualItems[virtualItems.length - 1]?.end ?? 0);
        // Nothing to hold on to when the window is shorter than the viewport.
        if (renderedBottom - renderedTop < viewportHeight) return;

        const current = el.scrollTop;
        let next = current;
        if (paddingBottom > 0 && next + viewportHeight > renderedBottom) {
            next = renderedBottom - viewportHeight;
        }
        if (paddingTop > 0 && next < renderedTop) next = renderedTop;
        if (Math.abs(next - current) > 0.5) el.scrollTop = Math.max(0, next);
    });

    const dataColumnTotalWidth = columnVirtualizer.getTotalSize();
    const columnPaddingLeft = virtualColumns.length > 0 ? (virtualColumns[0]?.start ?? 0) : 0;
    const columnPaddingRight =
        virtualColumns.length > 0
            ? dataColumnTotalWidth - (virtualColumns[virtualColumns.length - 1]?.end ?? 0)
            : 0;

    const scrollKeyRef = useRef(scrollKey);
    scrollKeyRef.current = scrollKey;
    const maybeFetchMoreRef = useRef(maybeFetchMore);
    maybeFetchMoreRef.current = maybeFetchMore;

    // Marks the scroll host as actively scrolling so CSS can suspend per-cell
    // hover transitions (see .rt-cell-content in components.css) — those
    // transitions would otherwise re-trigger on every row boundary the cursor
    // passes under while the grid moves beneath a stationary pointer. Cleared
    // after VELOCITY_IDLE_MS of quiet, same threshold the velocity sampler
    // already treats as "stopped".
    const scrollEndTimerRef = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(scrollEndTimerRef.current), []);

    // Stable identity so the grid's scroll listener is attached once instead of
    // being swapped on every scroll frame.
    const handleScroll = useCallback(() => {
        const el = parentRef.current;
        if (el && isVisibleRef.current) {
            el.classList.add('rt-is-scrolling');
            window.clearTimeout(scrollEndTimerRef.current);
            scrollEndTimerRef.current = window.setTimeout(() => {
                el.classList.remove('rt-is-scrolling');
            }, VELOCITY_IDLE_MS);

            // scrollTop/scrollLeft only. TanStack Virtual's own listener has
            // already read them this tick, so no extra layout is forced.
            const pos = { top: el.scrollTop, left: el.scrollLeft };
            scrollStateRef.current = pos;
            const key = scrollKeyRef.current;
            if (key) savedScrollPositions.set(key, pos);

            // Sample velocity here rather than during render: this handler runs
            // on the scroll event itself, so the reading is as fresh as the
            // browser can make it.
            const now = performance.now();
            const previous = velocitySampleRef.current;
            const elapsed = now - previous.time;
            if (previous.time > 0 && elapsed > 0) {
                const instant =
                    elapsed > VELOCITY_IDLE_MS ? 0 : Math.abs(pos.top - previous.offset) / elapsed;
                velocityRef.current = velocityRef.current * 0.5 + instant * 0.5;
            }
            velocitySampleRef.current = { offset: pos.top, time: now };
        }
        maybeFetchMoreRef.current();
    }, []);

    return {
        parentRef,
        handleScroll,
        leadingPlaceholderRows,
        rowHeight,
        virtualItems,
        renderedColumnIndexes,
        paddingTop,
        paddingBottom,
        columnPaddingLeft,
        columnPaddingRight,
    };
}
