// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { SquareTerminal } from 'lucide-react';
import { registerBottomPanel, unregisterBottomPanel } from '../features/editor';
import { TerminalPanel, closeAllTerminals, useTerminalEvents } from '../features/terminal';
import { useTerminalSettingsStore } from '../stores/terminalSettingsStore';

export const TERMINAL_PANEL_ID = 'terminal';

// Registers the Terminal bottom panel (features/terminal) into the editor
// feature's bottom-panel registry. Like the Activity panel this lives in app/,
// so it can import both features without tripping the cross-feature boundary
// check. The panel only exists while the terminal is switched on in Settings:
// switching it off removes the tab and ends every shell, so none is left
// running unseen.
export function useTerminalPanelRegistration(): void {
    const enabled = useTerminalSettingsStore(s => s.enabled);
    useTerminalEvents();

    useEffect(() => {
        if (!enabled) return;
        registerBottomPanel({
            id: TERMINAL_PANEL_ID,
            label: 'Terminal',
            title: 'Terminal (Ctrl+`)',
            icon: SquareTerminal,
            order: 60,
            render: () => <TerminalPanel />,
            commandId: 'layout.toggleTerminal',
        });
        return () => {
            unregisterBottomPanel(TERMINAL_PANEL_ID);
            closeAllTerminals();
        };
    }, [enabled]);
}
