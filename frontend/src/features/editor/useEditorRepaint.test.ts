// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorRepaint } from './useEditorRepaint';

describe('useEditorRepaint', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const flush = () => vi.advanceTimersByTime(50);

    it('repaints a visible editor once a frame after mounting', () => {
        const editor = { render: vi.fn() };
        renderHook(() => useEditorRepaint(editor, true, 'a'));
        flush();
        expect(editor.render).toHaveBeenCalledWith(true);
        expect(editor.render).toHaveBeenCalledTimes(1);
    });

    it('repaints again when a key changes, e.g. the SQL colours', () => {
        const editor = { render: vi.fn() };
        const { rerender } = renderHook(({ style }) => useEditorRepaint(editor, true, style), {
            initialProps: { style: 'one' },
        });
        flush();
        rerender({ style: 'two' });
        flush();
        expect(editor.render).toHaveBeenCalledTimes(2);
    });

    it('repaints when a hidden editor becomes the visible one', () => {
        const editor = { render: vi.fn() };
        const { rerender } = renderHook(({ active }) => useEditorRepaint(editor, active, 'a'), {
            initialProps: { active: false },
        });
        flush();
        expect(editor.render).not.toHaveBeenCalled();
        rerender({ active: true });
        flush();
        expect(editor.render).toHaveBeenCalledTimes(1);
    });

    it('does nothing without an editor', () => {
        expect(() => {
            renderHook(() => useEditorRepaint(null, true, 'a'));
            flush();
        }).not.toThrow();
    });
});
