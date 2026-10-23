// SPDX-License-Identifier: GPL-3.0-only

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RT_ROW_HEIGHT } from '../gridMetrics';
import { useDataTableVirtualization } from './useDataTableVirtualization';

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({ count, horizontal }: { count: number; horizontal?: boolean }) => ({
        scrollDirection: null,
        getVirtualItems: () => [],
        getTotalSize: () => count * (horizontal ? 140 : RT_ROW_HEIGHT),
        measure: vi.fn(),
        scrollToIndex: vi.fn(),
    }),
}));

function Grid() {
    const { parentRef } = useDataTableVirtualization({
        isDone: true,
        hasMore: false,
        isFetchingMore: false,
        tableRowsLength: 1000,
        columnsLength: 3,
        loadedRowsLength: 1000,
    });
    return <div ref={parentRef} data-testid='scroller' />;
}

function renderGrid() {
    const view = render(<Grid />);
    const scroller = screen.getByTestId('scroller');
    // jsdom does no layout; give the scroll host a range so a notch has room to move.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 20000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
    return { ...view, scroller };
}

describe('useDataTableVirtualization wheel easing', () => {
    it('takes over a mouse-wheel notch on the scroll host', () => {
        const { scroller } = renderGrid();
        const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });

        scroller.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it('leaves trackpad-sized deltas to the browser', () => {
        const { scroller } = renderGrid();
        const event = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });

        scroller.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });

    it('stops handling wheel events once the grid unmounts', () => {
        const { scroller, unmount } = renderGrid();
        unmount();
        const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });

        scroller.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });
});
