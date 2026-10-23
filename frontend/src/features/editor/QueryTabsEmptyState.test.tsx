// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { QueryTabsEmptyState } from './QueryTabsEmptyState';
import { DOM_EVENT } from '../../lib/constants';
import { onCommand } from '../../lib/commandBus';

const shortcutState = {
    getBinding: vi.fn((id: string) => {
        const defaults: Record<string, string> = {
            'editor.newTab': 'Ctrl+T',
            'view.commandPalette': 'Ctrl+Shift+P',
            'editor.contextSearch': 'Ctrl+E',
        };
        return defaults[id] || '';
    }),
};

vi.mock('../../stores/shortcutStore', () => ({
    useShortcutStore: (selector: (state: typeof shortcutState) => unknown) =>
        selector(shortcutState),
}));

describe('QueryTabsEmptyState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the New Query Tab, Show All Commands, and Search hints with their bindings', () => {
        render(<QueryTabsEmptyState onNewQuery={vi.fn()} isConnected />);

        const newQueryRow = screen.getByText('New Query Tab').closest('button')!;
        expect(within(newQueryRow).getByText('Ctrl')).toBeInTheDocument();
        expect(within(newQueryRow).getByText('T')).toBeInTheDocument();

        const paletteRow = screen.getByText('Show All Commands').closest('button')!;
        expect(within(paletteRow).getByText('Shift')).toBeInTheDocument();
        expect(within(paletteRow).getByText('P')).toBeInTheDocument();

        const searchRow = screen.getByText('Search').closest('button')!;
        expect(within(searchRow).getByText('E')).toBeInTheDocument();
    });

    it('calls onNewQuery when the New Query Tab hint is clicked', () => {
        const onNewQuery = vi.fn();
        render(<QueryTabsEmptyState onNewQuery={onNewQuery} isConnected />);

        fireEvent.click(screen.getByText('New Query Tab'));

        expect(onNewQuery).toHaveBeenCalled();
    });

    it('emits OPEN_COMMAND_PALETTE when the Show All Commands hint is clicked', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.OPEN_COMMAND_PALETTE, handler);
        render(<QueryTabsEmptyState onNewQuery={vi.fn()} isConnected />);

        fireEvent.click(screen.getByText('Show All Commands'));

        expect(handler).toHaveBeenCalled();
        off();
    });

    it('emits OPEN_CONTEXT_SEARCH when the Search hint is clicked', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, handler);
        render(<QueryTabsEmptyState onNewQuery={vi.fn()} isConnected />);

        fireEvent.click(screen.getByText('Search'));

        expect(handler).toHaveBeenCalled();
        off();
    });

    it('shows a hint to connect a database when not connected', () => {
        render(<QueryTabsEmptyState onNewQuery={vi.fn()} isConnected={false} />);

        expect(
            screen.getByText('Connect to a database using the sidebar first.'),
        ).toBeInTheDocument();
    });

    it('hides the connect hint once connected', () => {
        render(<QueryTabsEmptyState onNewQuery={vi.fn()} isConnected />);

        expect(
            screen.queryByText('Connect to a database using the sidebar first.'),
        ).not.toBeInTheDocument();
    });
});
