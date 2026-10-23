// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../platform/apiGatewayRuntime';
import type { TerminalKind } from '../../platform/app-api/contracts/terminal';
import { unwrapOrThrow } from '../../shared/kernel';
import { useTerminalStore } from '../../stores/terminalStore';
import type { TerminalDataPayload, TerminalExitPayload } from '../../lib/events';
import {
    createLiveTerminal,
    disposeLiveTerminal,
    getLiveTerminal,
    notePendingExit,
    takePendingExit,
    writeTerminalOutput,
} from './terminalRegistry';

// Until the panel has measured itself the shell is told a conventional size;
// the first fit() then resizes it to the real viewport.
const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;

/** Opens a shell and its tab. Throws with the backend's message when the shell
 *  cannot start (no PTY, SSH login refused, ...), for the caller to display. */
export async function openTerminal(kind: TerminalKind, profileId = ''): Promise<void> {
    const info = unwrapOrThrow(
        await getApiGateway().terminal.open(kind, profileId, INITIAL_COLS, INITIAL_ROWS),
    );

    createLiveTerminal(info.id, {
        onInput: data => {
            void getApiGateway().terminal.write(info.id, data);
        },
        onResize: (cols, rows) => {
            void getApiGateway().terminal.resize(info.id, cols, rows);
        },
    });
    useTerminalStore.getState().addTab({
        id: info.id,
        kind: info.kind,
        title: info.title,
        profileId: profileId || undefined,
    });

    const exitCode = takePendingExit(info.id);
    if (exitCode !== undefined) {
        handleTerminalExit({ id: info.id, exitCode });
    }
}

/** Closes one tab and ends its shell. */
export function closeTerminal(id: string): void {
    void getApiGateway().terminal.close(id);
    disposeLiveTerminal(id);
    useTerminalStore.getState().removeTab(id);
}

/** Ends every shell, e.g. when the terminal is switched off in Settings. */
export function closeAllTerminals(): void {
    for (const tab of useTerminalStore.getState().tabs) {
        void getApiGateway().terminal.close(tab.id);
        disposeLiveTerminal(tab.id);
    }
    useTerminalStore.getState().clear();
}

export function handleTerminalData({ id, data }: TerminalDataPayload): void {
    writeTerminalOutput(id, data);
}

export function handleTerminalExit({ id, exitCode }: TerminalExitPayload): void {
    const entry = getLiveTerminal(id);
    if (!entry) {
        notePendingExit(id, exitCode);
        return;
    }
    entry.term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
    useTerminalStore.getState().markExited(id, exitCode);
}
