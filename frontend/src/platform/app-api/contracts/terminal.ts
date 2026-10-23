// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';

/** Mirrors internal/app/terminal_service.go's session kinds. */
export type TerminalKind = 'local' | 'ssh';

/** Mirrors internal/app/terminal_service.go's TerminalInfo: one open shell. */
export interface TerminalInfo {
    id: string;
    kind: TerminalKind;
    /** Short tab label: the shell's name, or user@host for an SSH shell. */
    title: string;
}

export interface TerminalAdapter {
    /** Starts a shell. For kind 'ssh', profileId names the connection whose
     *  SSH server to log in to. Output arrives as terminal:data events. */
    open(
        kind: TerminalKind,
        profileId: string,
        cols: number,
        rows: number,
    ): Promise<KernelResult<TerminalInfo>>;
    /** Sends keystrokes to a session. */
    write(id: string, data: string): Promise<KernelResult<void>>;
    /** Tells a session its viewport changed size. */
    resize(id: string, cols: number, rows: number): Promise<KernelResult<void>>;
    /** Ends a session. */
    close(id: string): Promise<KernelResult<void>>;
}
