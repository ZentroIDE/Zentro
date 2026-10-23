// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { onTerminalData, onTerminalExit } from '../../lib/events';
import { handleTerminalData, handleTerminalExit } from './terminalController';

/** Feeds the backend's terminal output and exit events into the xterm
 *  instances. Mounted for the app's lifetime (not the panel's), so output keeps
 *  flowing into a session's scrollback while another bottom-panel tab is shown. */
export function useTerminalEvents(): void {
    useEffect(() => {
        const subs = [onTerminalData(handleTerminalData), onTerminalExit(handleTerminalExit)];
        return () => subs.forEach(unsub => unsub());
    }, []);
}
