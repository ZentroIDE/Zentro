// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { eventToKeyToken, getCommandRegistry, normalizeBinding } from '../../lib/shortcutRegistry';
import { useShortcutStore } from '../../stores/shortcutStore';
import { appLogger } from '../../lib/logger';
import { evaluateWhenExpression } from './whenExpression';
import { buildShortcutWhenContext } from './shortcutContext';

const TERMINAL_TOGGLE_COMMAND = 'layout.toggleTerminal';

export function useGlobalShortcuts(toast: { error: (message: string) => void }) {
    const { effectiveRules } = useShortcutStore();

    useEffect(() => {
        const commands = getCommandRegistry();
        const commandMap = new Map(commands.map(entry => [entry.id, entry]));

        const execute = (entry: (typeof commands)[number]) => {
            Promise.resolve(entry.action()).catch(err => {
                appLogger.error(`shortcut ${entry.id} failed`, err);
                toast.error(`Shortcut failed: ${entry.label}`);
            });
        };

        const consumeEvent = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handler = (e: KeyboardEvent) => {
            // Match only a dialog that's actually open — a Radix dialog mid
            // exit-animation (or stuck there because the animation never
            // fired an end event) still matches `[role="dialog"]` and would
            // otherwise wedge every global shortcut off for the session.
            if (document.querySelector('[role="dialog"][data-state="open"]')) return;
            const target = e.target as HTMLElement | null;
            const whenContext = buildShortcutWhenContext(target);
            // Shortcut-capture fields (rebinding UI) must see the raw key.
            // Every other focus target, including inputs, still runs globals:
            // a match is consumed below; an unmatched key is left for the field.
            if (whenContext.captureFocus) return;

            const inSqlMonaco = Boolean(target?.closest('.zentro-sql-editor .monaco-editor'));
            const isCtrlSpace =
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                (e.code === 'Space' || e.key === ' ' || e.key.toLowerCase() === 'spacebar');

            // SQL Monaco should keep Ctrl/Cmd+Space for suggest, never global shortcut.
            if (inSqlMonaco && isCtrlSpace) {
                return;
            }

            const token = eventToKeyToken(e);
            const now = Date.now();
            const inFilterMonaco = Boolean(target?.closest('.zentro-filter-monaco .monaco-editor'));

            // Filter editor should not trigger global run query on Ctrl/Cmd+Enter.
            if (inFilterMonaco && token === 'ctrl+enter') {
                return;
            }

            // A focused terminal owns the keyboard: readline keys (Ctrl+L clear,
            // Ctrl+P history, Ctrl+E/W/K line editing, ...) are the shell's, not
            // the app's. Only the key that toggles the terminal stays global, so
            // there is always a way back out.
            const inTerminal = Boolean(target?.closest('.zentro-terminal'));

            const applicable = effectiveRules.flatMap(rule => {
                if (inTerminal && rule.commandId !== TERMINAL_TOGGLE_COMMAND) return [];
                const entry = commandMap.get(rule.commandId);
                if (!entry) return [];
                if (entry.isEnabled && !entry.isEnabled()) return [];
                if (!evaluateWhenExpression((rule.when || '').trim(), whenContext)) return [];
                const parts = normalizeBinding(rule.binding || entry.defaultBinding).split(' ');
                return [{ entry, parts }];
            });

            const { chordStart, chordUntil, setChord } = useShortcutStore.getState();
            if (chordStart !== null) {
                const pending = now <= chordUntil;
                setChord(null);
                const completion = pending
                    ? applicable.find(
                          c =>
                              c.parts.length === 2 &&
                              c.parts[0] === chordStart &&
                              c.parts[1] === token,
                      )
                    : undefined;
                if (completion) {
                    consumeEvent(e);
                    execute(completion.entry);
                    return;
                }
            }

            const chordStarter = applicable.find(c => c.parts.length === 2 && c.parts[0] === token);
            if (chordStarter) {
                consumeEvent(e);
                setChord(token);
                return;
            }

            const single = applicable.find(c => c.parts.length === 1 && c.parts[0] === token);
            if (single) {
                consumeEvent(e);
                execute(single.entry);
            }
        };

        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [effectiveRules, toast]);
}
