// SPDX-License-Identifier: GPL-3.0-only

import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';

// The xterm.js instances live here, outside React and outside the store: they
// hold scrollback and a live renderer, and the Terminal panel unmounts every
// time another bottom-panel tab is selected. The panel re-attaches the active
// terminal's element when it mounts again, so nothing typed or printed is lost.

export interface LiveTerminal {
    id: string;
    term: Terminal;
    fit: FitAddon;
    opened: boolean;
}

export interface TerminalHandlers {
    /** Keystrokes from the user, to be sent to the shell. */
    onInput: (data: string) => void;
    /** The viewport changed size; the shell's PTY has to follow. */
    onResize: (cols: number, rows: number) => void;
}

const live = new Map<string, LiveTerminal>();
// Output (and an exit) can reach the frontend before TerminalOpen has returned
// and the terminal exists: the shell is already printing its prompt by then.
const pendingOutput = new Map<string, Uint8Array[]>();
const pendingExit = new Map<string, number>();
// Ids the user already closed: the backend still reports their last output and
// exit, which must be dropped rather than parked in the pending maps forever.
const disposed = new Set<string>();

const FALLBACK_BACKGROUND = '#1e1e1e';
const FALLBACK_FOREGROUND = '#d4d4d4';

/** Resolves a theme token (which may be a var() or a color-mix()) to a color
 *  xterm can parse, by letting the browser compute it on a probe element. */
function resolveColor(token: string, fallback: string): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (!raw) return fallback;
    const probe = document.createElement('span');
    probe.style.color = raw;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved || fallback;
}

export function readTerminalTheme(): ITheme {
    const background = resolveColor('--background', FALLBACK_BACKGROUND);
    const foreground = resolveColor('--foreground', FALLBACK_FOREGROUND);
    const dim = resolveColor('--content-secondary', foreground);
    // xterm's built-in palette is tuned for a dark screen: its white and yellow
    // vanish on the light theme. The status colors and text tokens already pass
    // contrast in both themes, so the ANSI colors follow them.
    const red = resolveColor('--status-destructive', '#cd3131');
    const green = resolveColor('--status-success', '#388a34');
    const yellow = resolveColor('--status-warning', '#bf8803');
    const blue = resolveColor('--status-info', '#2472c8');
    return {
        background,
        foreground,
        cursor: foreground,
        selectionBackground: resolveColor('--accent', 'rgba(120, 120, 120, 0.35)'),
        black: background,
        white: foreground,
        brightBlack: dim,
        brightWhite: foreground,
        red,
        brightRed: red,
        green,
        brightGreen: green,
        yellow,
        brightYellow: yellow,
        blue,
        brightBlue: blue,
    };
}

/** Ctrl+C copies while text is selected and otherwise stays the shell's
 *  interrupt, as in VS Code and Windows Terminal. Returning false tells xterm
 *  not to forward the key to the shell. */
export function shouldCopySelection(term: Terminal, event: KeyboardEvent): boolean {
    if (event.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return false;
    return event.key.toLowerCase() === 'c' && term.hasSelection();
}

function monoFontFamily(): string {
    const family = getComputedStyle(document.documentElement)
        .getPropertyValue('--font-family-mono')
        .trim();
    return family || 'ui-monospace, Menlo, Consolas, monospace';
}

export function createLiveTerminal(id: string, handlers: TerminalHandlers): LiveTerminal {
    const term = new Terminal({
        fontFamily: monoFontFamily(),
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
        theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.onData(handlers.onInput);
    term.onResize(({ cols, rows }) => handlers.onResize(cols, rows));
    term.attachCustomKeyEventHandler(event => {
        if (!shouldCopySelection(term, event)) return true;
        void navigator.clipboard?.writeText(term.getSelection());
        term.clearSelection();
        return false;
    });

    const entry: LiveTerminal = { id, term, fit, opened: false };
    live.set(id, entry);

    const buffered = pendingOutput.get(id);
    if (buffered) {
        for (const chunk of buffered) term.write(chunk);
        pendingOutput.delete(id);
    }
    return entry;
}

export function getLiveTerminal(id: string): LiveTerminal | undefined {
    return live.get(id);
}

/** Fits the terminal to its host. A host that has no size yet (panel hidden,
 *  mid-layout) makes the fit addon throw; the next resize retries. */
export function safeFit(entry: LiveTerminal): void {
    try {
        entry.fit.fit();
    } catch {
        // host not laid out yet
    }
}

/** Shows `entry` in `host`, replacing whichever terminal was there. */
export function attachLiveTerminal(entry: LiveTerminal, host: HTMLElement): void {
    entry.term.options.theme = readTerminalTheme();
    if (!entry.opened) {
        host.replaceChildren();
        entry.term.open(host);
        entry.opened = true;
    } else if (entry.term.element) {
        host.replaceChildren(entry.term.element);
    }
    safeFit(entry);
}

/** Writes shell output, holding it until the terminal exists if need be. */
export function writeTerminalOutput(id: string, bytes: Uint8Array): void {
    const entry = live.get(id);
    if (entry) {
        entry.term.write(bytes);
        return;
    }
    if (disposed.has(id)) return;
    const queue = pendingOutput.get(id) ?? [];
    queue.push(bytes);
    pendingOutput.set(id, queue);
}

export function notePendingExit(id: string, exitCode: number): void {
    if (disposed.has(id)) return;
    pendingExit.set(id, exitCode);
}

export function takePendingExit(id: string): number | undefined {
    const code = pendingExit.get(id);
    pendingExit.delete(id);
    return code;
}

export function disposeLiveTerminal(id: string): void {
    live.get(id)?.term.dispose();
    live.delete(id);
    pendingOutput.delete(id);
    pendingExit.delete(id);
    disposed.add(id);
}
