// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import type { TerminalKind } from '../platform/app-api/contracts/terminal';

export interface TerminalTab {
    id: string;
    kind: TerminalKind;
    title: string;
    /** The connection an SSH shell was opened for; lets an exited tab restart. */
    profileId?: string;
    /** The shell ended (typed `exit`, or the SSH link dropped). The tab stays
     *  so its scrollback can still be read, until the user closes it. */
    exited: boolean;
    exitCode?: number;
}

interface TerminalState {
    /** Open sessions, oldest first. The xterm instances themselves are not
     *  state: they live in the terminal feature's registry so they survive the
     *  panel unmounting when another bottom-panel tab is selected. */
    tabs: TerminalTab[];
    activeId: string | null;

    addTab: (tab: Pick<TerminalTab, 'id' | 'kind' | 'title' | 'profileId'>) => void;
    setActive: (id: string) => void;
    markExited: (id: string, exitCode: number) => void;
    removeTab: (id: string) => void;
    clear: () => void;
}

export const useTerminalStore = create<TerminalState>(set => ({
    tabs: [],
    activeId: null,

    addTab: tab =>
        set(state => ({
            tabs: [...state.tabs, { ...tab, exited: false }],
            activeId: tab.id,
        })),
    setActive: id => set({ activeId: id }),
    markExited: (id, exitCode) =>
        set(state => ({
            tabs: state.tabs.map(tab => (tab.id === id ? { ...tab, exited: true, exitCode } : tab)),
        })),
    removeTab: id =>
        set(state => {
            const index = state.tabs.findIndex(tab => tab.id === id);
            if (index === -1) return state;
            const tabs = state.tabs.filter(tab => tab.id !== id);
            // Closing the active tab hands focus to its neighbour, like an editor.
            const activeId =
                state.activeId === id
                    ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
                    : state.activeId;
            return { tabs, activeId };
        }),
    clear: () => set({ tabs: [], activeId: null }),
}));
