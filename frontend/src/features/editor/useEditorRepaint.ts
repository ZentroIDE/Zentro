// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';

interface Repaintable {
    render: (forceRedraw?: boolean) => void;
}

/**
 * Repaints a Monaco editor when its look may have changed behind its back.
 *
 * A theme change re-tokenizes lazily, on the next render request, and an
 * editor that is not the visible tab never gets one — it kept drawing the old
 * colours until something else (focus) forced a repaint. So the visible editor
 * is repainted whenever it becomes visible or any of `keys` changes.
 */
export function useEditorRepaint(
    editor: Repaintable | null,
    isActive: boolean | undefined,
    ...keys: unknown[]
): void {
    useEffect(() => {
        if (!editor || !isActive) return;
        const frame = window.requestAnimationFrame(() => editor.render(true));
        return () => window.cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `keys` are the triggers
    }, [editor, isActive, ...keys]);
}
