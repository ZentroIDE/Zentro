// SPDX-License-Identifier: GPL-3.0-only

import {
    TerminalClose,
    TerminalOpen,
    TerminalResize,
    TerminalWrite,
} from '../../../wailsjs/go/app/App';
import type { TerminalInfo, TerminalKind } from './contracts/terminal';

export const terminalAdapter = {
    // wailsjs types the generated app.TerminalInfo loosely (kind: string); narrow
    // it to the contract's union without re-validating field by field.
    TerminalOpen: async (
        kind: TerminalKind,
        profileId: string,
        cols: number,
        rows: number,
    ): Promise<TerminalInfo> => {
        const raw = await TerminalOpen(kind, profileId, cols, rows);
        return { id: raw.id, kind: raw.kind as TerminalKind, title: raw.title };
    },
    TerminalWrite,
    TerminalResize,
    TerminalClose,
};
