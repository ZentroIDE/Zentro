// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { TerminalAdapter } from '../contracts/terminal';
import { wailsGateway } from '../wailsGateway';

// A terminal is a process on this machine (or an SSH login made from it), so
// even in team/enterprise mode it is always the local backend's - there is
// nothing to proxy to the server.
export function createTerminalRestAdapter(): TerminalAdapter {
    return withKernelResult('terminal', {
        open: wailsGateway.TerminalOpen,
        write: wailsGateway.TerminalWrite,
        resize: wailsGateway.TerminalResize,
        close: wailsGateway.TerminalClose,
    });
}
