// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTabCycling } from './useTabCycling';

const tabsById = new Map(
    ['A', 'B', 'C'].map(id => [id, { tab: { id } as never, groupId: 'g1' }] as const),
);

function press(type: 'keydown' | 'keyup', init: KeyboardEventInit) {
    act(() => {
        window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));
    });
}

function setup() {
    const onActivateTab = vi.fn();
    const hook = renderHook(
        ({ activeTabId }) => useTabCycling({ activeTabId, tabsById, onActivateTab }),
        { initialProps: { activeTabId: 'A' } },
    );
    // Visit A, B, C in order: the most recently used is C, then B, then A.
    hook.rerender({ activeTabId: 'B' });
    hook.rerender({ activeTabId: 'C' });
    return { hook, onActivateTab };
}

describe('useTabCycling', () => {
    it('Ctrl+Tab goes to the previously used tab, not the next one in order', () => {
        const { hook, onActivateTab } = setup();

        press('keydown', { key: 'Tab', ctrlKey: true });
        const { orderedIds, index } = hook.result.current.tabSwitcher;
        expect(orderedIds[index]).toBe('B');

        press('keyup', { key: 'Control' });
        expect(onActivateTab).toHaveBeenCalledWith('B');
    });

    it('keeps walking back through recent tabs while Ctrl is held', () => {
        const { hook, onActivateTab } = setup();

        press('keydown', { key: 'Tab', ctrlKey: true });
        press('keydown', { key: 'Tab', ctrlKey: true });
        const { orderedIds, index } = hook.result.current.tabSwitcher;
        expect(orderedIds[index]).toBe('A');

        press('keyup', { key: 'Control' });
        expect(onActivateTab).toHaveBeenCalledWith('A');
    });

    it('Ctrl+Shift+Tab steps the other way', () => {
        const { hook } = setup();

        press('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true });
        const { orderedIds, index } = hook.result.current.tabSwitcher;
        expect(orderedIds[index]).toBe('A');
    });

    it('reaches tabs that were never active this session', () => {
        const hook = renderHook(() =>
            useTabCycling({ activeTabId: 'C', tabsById, onActivateTab: vi.fn() }),
        );

        press('keydown', { key: 'Tab', ctrlKey: true });
        const { orderedIds, index } = hook.result.current.tabSwitcher;
        expect(orderedIds).toHaveLength(3);
        expect(orderedIds[index]).not.toBe('C');
    });
});
