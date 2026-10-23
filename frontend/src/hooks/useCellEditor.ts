// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useLayoutEffect, useRef } from 'react';
import type React from 'react';

const MIN_HEIGHT = 96;
const MAX_HEIGHT = 240;

interface UseCellEditorOptions {
    /** Current displayed value — used only for auto-resize on change. */
    value: string;
    onCommit: () => void | Promise<void>;
    onCancel: () => void;
    /** Ctrl/Cmd+S: commit then fire this (result-table save flow). */
    onSaveShortcut?: () => void;
    /** Tab key: commit and move to adjacent cell. Omit to ignore Tab. */
    onTabMove?: (direction: 1 | -1) => void | Promise<void>;
}

export interface UseCellEditorResult {
    textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleBlur: () => void;
}

/**
 * Shared editing behaviour for inline cell editors.
 * Handles: focus-on-mount, auto-resize, suppress-blur-after-keyboard-commit,
 * Enter/Esc/Tab/Ctrl+S keydown.
 *
 * Used by DataTableFloatingEditor (result table) and RowDetailEditor (sidebar).
 */
export function useCellEditor({
    value,
    onCommit,
    onCancel,
    onSaveShortcut,
    onTabMove,
}: UseCellEditorOptions): UseCellEditorResult {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const suppressBlurRef = useRef(false);

    // Latest-ref pattern — keeps handleKeyDown/handleBlur stable across re-renders
    const onCommitRef = useRef(onCommit);
    const onCancelRef = useRef(onCancel);
    const onSaveShortcutRef = useRef(onSaveShortcut);
    const onTabMoveRef = useRef(onTabMove);
    onCommitRef.current = onCommit;
    onCancelRef.current = onCancel;
    onSaveShortcutRef.current = onSaveShortcut;
    onTabMoveRef.current = onTabMove;

    const resize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = '0px';
        el.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight))}px`;
    }, []);

    // Focus + initial resize on mount
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.select();
        resize();
    }, [resize]);

    // Resize whenever value changes
    useLayoutEffect(() => {
        resize();
    }, [resize, value]);

    const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            e.stopPropagation();
            suppressBlurRef.current = true;
            await onCommitRef.current();
            const saveCb = onSaveShortcutRef.current;
            if (saveCb) window.setTimeout(saveCb, 0);
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            suppressBlurRef.current = true;
            onCancelRef.current();
            return;
        }
        if (e.key === 'Tab') {
            const tabMove = onTabMoveRef.current;
            if (tabMove) {
                e.preventDefault();
                suppressBlurRef.current = true;
                await tabMove(e.shiftKey ? -1 : 1);
            }
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            suppressBlurRef.current = true;
            await onCommitRef.current();
        }
    }, []);

    const handleBlur = useCallback(() => {
        if (suppressBlurRef.current) {
            suppressBlurRef.current = false;
            return;
        }
        void onCommitRef.current();
    }, []);

    return { textareaRef, handleKeyDown, handleBlur };
}
