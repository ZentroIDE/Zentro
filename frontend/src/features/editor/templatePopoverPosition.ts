// SPDX-License-Identifier: GPL-3.0-only

import type React from 'react';

export const POPOVER_WIDTH = 760;
export const POPOVER_HEIGHT = 420;
export const VIEWPORT_PADDING = 8;
export const ANCHOR_GAP = 8;
export const ROW_H = 28;

/**
 * Compute fixed-position style for the template popover so it docks next to its
 * anchor element while staying inside the viewport. Falls back to centered if
 * no anchor rect is supplied.
 */
export function calculateTemplatePopoverStyle(
    anchorRect: DOMRect | null,
    viewportWidth: number = window.innerWidth,
    viewportHeight: number = window.innerHeight,
): React.CSSProperties {
    const fallbackLeft = Math.max(
        VIEWPORT_PADDING,
        Math.round((viewportWidth - POPOVER_WIDTH) / 2),
    );
    const fallbackTop = Math.max(
        VIEWPORT_PADDING,
        Math.round((viewportHeight - POPOVER_HEIGHT) / 2),
    );

    if (!anchorRect) {
        return {
            position: 'fixed',
            top: fallbackTop,
            left: fallbackLeft,
            width: POPOVER_WIDTH,
            height: POPOVER_HEIGHT,
        };
    }

    let left = anchorRect.right + ANCHOR_GAP;
    let top = anchorRect.top;

    if (left + POPOVER_WIDTH + VIEWPORT_PADDING > viewportWidth) {
        left = anchorRect.left - POPOVER_WIDTH - ANCHOR_GAP;
    }

    left = Math.max(
        VIEWPORT_PADDING,
        Math.min(left, viewportWidth - POPOVER_WIDTH - VIEWPORT_PADDING),
    );
    top = Math.max(
        VIEWPORT_PADDING,
        Math.min(top, viewportHeight - POPOVER_HEIGHT - VIEWPORT_PADDING),
    );

    return {
        position: 'fixed',
        top: Math.round(top),
        left: Math.round(left),
        width: POPOVER_WIDTH,
        height: POPOVER_HEIGHT,
    };
}
