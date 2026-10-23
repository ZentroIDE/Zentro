// SPDX-License-Identifier: GPL-3.0-only

import { useShortcutStore } from '../stores/shortcutStore';
import { usePlatform } from '../hooks/usePlatform';
import { getCommandById, type CommandId } from './shortcutRegistry';

export type ShortcutDisplayPlatform = 'mac' | 'windows' | 'linux';
type RuntimePlatform = 'darwin' | 'windows' | 'linux' | null;

export function toShortcutDisplayPlatform(platform: RuntimePlatform): ShortcutDisplayPlatform {
    if (platform === 'darwin') return 'mac';
    if (platform === 'linux') return 'linux';
    return 'windows';
}

// macOS renders modifiers and a few named keys as symbols, with no "+"
// between them (⌘⇧P, not Ctrl+Shift+P) — this is the OS-wide convention
// every native mac app follows.
const MAC_SYMBOLS: Record<string, string> = {
    ctrl: '⌘',
    meta: '⌘',
    alt: '⌥',
    shift: '⇧',
    enter: '↵',
    backspace: '⌫',
    delete: '⌦',
    tab: '⇥',
    escape: '⎋',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    ' ': '␣',
    space: '␣',
};

const WINDOWS_LINUX_LABELS: Record<string, string> = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    enter: 'Enter',
    backspace: 'Backspace',
    delete: 'Delete',
    tab: 'Tab',
    escape: 'Esc',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    ' ': 'Space',
    space: 'Space',
};

function capitalize(token: string): string {
    return token.length <= 1 ? token.toUpperCase() : token[0].toUpperCase() + token.slice(1);
}

export function formatShortcutToken(token: string, platform: ShortcutDisplayPlatform): string {
    const key = token.trim().toLowerCase();
    if (!key) return key;

    if (platform === 'mac') {
        return MAC_SYMBOLS[key] || capitalize(key);
    }

    if (key === 'meta') return platform === 'linux' ? 'Super' : 'Win';
    return WINDOWS_LINUX_LABELS[key] || capitalize(key);
}

/** Joins a stroke's tokens the native way for the platform: mac shows bare
 *  symbols side by side (⌘⇧P), Windows/Linux join with "+" (Ctrl+Shift+P). */
export function formatShortcutStroke(stroke: string, platform: ShortcutDisplayPlatform): string {
    const tokens = stroke
        .split('+')
        .filter(Boolean)
        .map(token => formatShortcutToken(token, platform));
    return platform === 'mac' ? tokens.join('') : tokens.join('+');
}

/** Formats a full binding — one stroke ("Ctrl+S") or a chord of strokes
 *  ("Ctrl+K Ctrl+B") — for display on the given runtime platform. The
 *  underlying binding string itself never changes per platform: "ctrl"
 *  already matches both physical Ctrl and Cmd (see eventToKeyToken), so
 *  this is presentation only. */
export function formatBindingForDisplay(binding: string, platform: RuntimePlatform): string {
    const displayPlatform = toShortcutDisplayPlatform(platform);
    return binding
        .split(' ')
        .filter(Boolean)
        .map(stroke => formatShortcutStroke(stroke, displayPlatform))
        .join(' ');
}

/** Platform-formatted current binding for a command, live-updating with
 *  both the active platform and any user rebind. Use this instead of a
 *  hardcoded "(Ctrl+X)" string in tooltips/menu labels. */
export function useShortcutHint(commandId: CommandId): string {
    const binding =
        useShortcutStore(s => s.bindings[commandId]) ||
        getCommandById(commandId)?.defaultBinding ||
        '';
    const platform = usePlatform();
    return formatBindingForDisplay(binding, platform);
}
