// SPDX-License-Identifier: GPL-3.0-only

import { buildCommands } from '../commands';

type MonacoEditorLike = {
    addAction: (descriptor: {
        id: string;
        label: string;
        keybindings?: number[];
        contextMenuGroupId?: string;
        contextMenuOrder?: number;
        run: () => void | Promise<void>;
    }) => { dispose: () => void };
};

type MonacoInstance = {
    KeyMod: {
        CtrlCmd: number;
        Shift: number;
        Alt: number;
        WinCtrl: number;
        chord: (firstPart: number, secondPart: number) => number;
    };
    KeyCode: Record<string, number | string>;
};

// Commands that should remain app-global and not be rebound inside Monaco.
const MONACO_BLOCKLISTED_COMMAND_IDS = new Set(['view.commandPalette', 'editor.focusEditor']);

const SPECIAL_KEY_MAP: Record<string, string> = {
    enter: 'Enter',
    escape: 'Escape',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Delete',
    space: 'Space',
    ',': 'Comma',
    '.': 'Period',
    '=': 'Equal',
    '-': 'Minus',
    '/': 'Slash',
    ';': 'Semicolon',
    "'": 'Quote',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    '\\': 'Backslash',
    '`': 'Backquote',
    f1: 'F1',
    f2: 'F2',
    f3: 'F3',
    f4: 'F4',
    f5: 'F5',
    f6: 'F6',
    f7: 'F7',
    f8: 'F8',
    f9: 'F9',
    f10: 'F10',
    f11: 'F11',
    f12: 'F12',
};

function resolveKeyCode(key: string, m: MonacoInstance): number | undefined {
    let val: number | string | undefined;
    if (/^[a-z]$/.test(key)) val = m.KeyCode['Key' + key.toUpperCase()];
    else if (/^[0-9]$/.test(key)) val = m.KeyCode['Digit' + key];
    else {
        const mapped = SPECIAL_KEY_MAP[key];
        val = mapped !== undefined ? m.KeyCode[mapped] : undefined;
    }
    return typeof val === 'number' ? val : undefined;
}

function parseChord(chord: string, m: MonacoInstance): number | undefined {
    const tokens = chord.split('+');
    let result = 0;
    let hasKey = false;
    for (const raw of tokens) {
        const t = raw.trim().toLowerCase();
        if (t === 'ctrl') {
            result |= m.KeyMod.CtrlCmd;
            continue;
        }
        if (t === 'shift') {
            result |= m.KeyMod.Shift;
            continue;
        }
        if (t === 'alt') {
            result |= m.KeyMod.Alt;
            continue;
        }
        const keyCode = resolveKeyCode(t, m);
        if (keyCode === undefined) return undefined;
        result |= keyCode;
        hasKey = true;
    }
    return hasKey ? result : undefined;
}

function toMonacoKeybinding(binding: string, m: MonacoInstance): number | undefined {
    const parts = binding.trim().split(/\s+/);
    if (parts.length === 2) {
        const a = parseChord(parts[0], m);
        const b = parseChord(parts[1], m);
        return a !== undefined && b !== undefined ? m.KeyMod.chord(a, b) : undefined;
    }
    return parts.length === 1 ? parseChord(parts[0], m) : undefined;
}

export function registerAppCommandsInMonaco(
    editor: MonacoEditorLike,
    monacoInstance: MonacoInstance,
): { dispose: () => void } {
    const disposables = buildCommands()
        .filter(entry => !MONACO_BLOCKLISTED_COMMAND_IDS.has(entry.id))
        .map(entry => {
            const kb = entry.keybinding
                ? toMonacoKeybinding(entry.keybinding, monacoInstance)
                : undefined;
            return editor.addAction({
                id: `zentro.${entry.id}`,
                label: entry.label,
                keybindings: kb !== undefined ? [kb] : undefined,
                run: entry.action,
            });
        });

    return {
        dispose: () => disposables.forEach(d => d.dispose()),
    };
}
