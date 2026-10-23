// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEY } from '../lib/constants';

interface TerminalSettingsState {
    /** Opt-in: a terminal is a shell with the app user's full rights, so the
     *  Terminal tab does not exist until it is switched on in Settings. */
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
}

export const useTerminalSettingsStore = create<TerminalSettingsState>()(
    persist(
        set => ({
            enabled: false,
            setEnabled: enabled => set({ enabled }),
        }),
        {
            name: STORAGE_KEY.TERMINAL_SETTINGS,
            partialize: state => ({ enabled: state.enabled }),
        },
    ),
);
