// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// vi.mock factories are hoisted above imports, so what they close over has to be
// hoisted with them.
const { registered, registerBottomPanel, unregisterBottomPanel, closeAllTerminals } = vi.hoisted(
    () => {
        const registered: Array<{ id: string; commandId?: string }> = [];
        return {
            registered,
            registerBottomPanel: vi.fn((def: { id: string; commandId?: string }) => {
                registered.push(def);
            }),
            unregisterBottomPanel: vi.fn((id: string) => {
                const i = registered.findIndex(d => d.id === id);
                if (i >= 0) registered.splice(i, 1);
            }),
            closeAllTerminals: vi.fn(),
        };
    },
);

vi.mock('../features/editor', () => ({ registerBottomPanel, unregisterBottomPanel }));
vi.mock('../features/terminal', () => ({
    TerminalPanel: () => null,
    closeAllTerminals,
    useTerminalEvents: vi.fn(),
}));

import { useTerminalSettingsStore } from '../stores/terminalSettingsStore';
import { TERMINAL_PANEL_ID, useTerminalPanelRegistration } from './useTerminalPanelRegistration';

describe('useTerminalPanelRegistration', () => {
    beforeEach(() => {
        registered.length = 0;
        registerBottomPanel.mockClear();
        unregisterBottomPanel.mockClear();
        closeAllTerminals.mockClear();
        useTerminalSettingsStore.setState({ enabled: false });
    });

    it('adds no Terminal tab while the terminal is switched off (the default)', () => {
        renderHook(() => useTerminalPanelRegistration());

        expect(registerBottomPanel).not.toHaveBeenCalled();
        expect(registered).toEqual([]);
    });

    it('registers the panel, wired to its toggle command, once it is switched on', () => {
        renderHook(() => useTerminalPanelRegistration());

        act(() => useTerminalSettingsStore.getState().setEnabled(true));

        expect(registered).toHaveLength(1);
        expect(registered[0]).toMatchObject({
            id: TERMINAL_PANEL_ID,
            commandId: 'layout.toggleTerminal',
        });
    });

    it('removes the tab and ends every shell when it is switched off again', () => {
        useTerminalSettingsStore.setState({ enabled: true });
        renderHook(() => useTerminalPanelRegistration());
        expect(registered).toHaveLength(1);

        act(() => useTerminalSettingsStore.getState().setEnabled(false));

        expect(unregisterBottomPanel).toHaveBeenCalledWith(TERMINAL_PANEL_ID);
        expect(closeAllTerminals).toHaveBeenCalledTimes(1);
        expect(registered).toEqual([]);
    });
});
