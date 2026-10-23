// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { openFocusedContextMenu } from './openContextMenu';

describe('openFocusedContextMenu', () => {
    it('dispatches a contextmenu event on the focused element', () => {
        const element = document.createElement('div');
        element.tabIndex = 0;
        element.getBoundingClientRect = () =>
            ({
                left: 4,
                top: 8,
                width: 20,
                height: 12,
                right: 24,
                bottom: 20,
                x: 4,
                y: 8,
                toJSON() {
                    return {};
                },
            }) as DOMRect;
        document.body.appendChild(element);
        element.focus();
        const handler = vi.fn();
        element.addEventListener('contextmenu', handler);

        openFocusedContextMenu();

        expect(handler).toHaveBeenCalledTimes(1);
        document.body.removeChild(element);
    });

    it('targets the active result cell when the grid container is focused', () => {
        const grid = document.createElement('div');
        grid.setAttribute('data-zone', 'resultGrid');
        grid.tabIndex = 0;
        const cell = document.createElement('div');
        cell.className = 'rt-cell-active';
        cell.getBoundingClientRect = () =>
            ({
                left: 10,
                top: 20,
                width: 40,
                height: 16,
                right: 50,
                bottom: 36,
                x: 10,
                y: 20,
                toJSON() {
                    return {};
                },
            }) as DOMRect;
        grid.appendChild(cell);
        document.body.appendChild(grid);
        grid.focus();
        const handler = vi.fn();
        cell.addEventListener('contextmenu', handler);

        openFocusedContextMenu();

        expect(handler).toHaveBeenCalledTimes(1);
        document.body.removeChild(grid);
    });
});
