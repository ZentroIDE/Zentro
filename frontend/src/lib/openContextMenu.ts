// SPDX-License-Identifier: GPL-3.0-only

/**
 * Opens the context menu of whatever currently has focus, the same way a
 * right-click would. Result cells keep focus on the grid container, so the
 * active cell is the menu target in that zone.
 */
export function openFocusedContextMenu(): void {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;

    const grid = active.closest('[data-zone="resultGrid"]');
    const cell = grid?.querySelector<HTMLElement>('.rt-cell-active');
    const target = cell ?? active;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    target.dispatchEvent(
        new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + Math.min(16, rect.width / 2),
            clientY: rect.top + Math.min(16, rect.height / 2),
            button: 2,
        }),
    );
}
