// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEY } from '../lib/constants';

export type BottomPanelView = 'result' | 'panel';

interface LayoutState {
    showSidebar: boolean;
    showResultPanel: boolean;
    showRightSidebar: boolean;
    bottomPanelView: BottomPanelView;
    /** A registered Bottom Panel id (see bottomPanelRegistry.tsx), or one of
     * the two per-query-tab explain pseudo-ids ('explain-plan' |
     * 'explain-analyze'), which are not registry entries. */
    activeBottomPanelId: string;

    toggleSidebar: () => void;
    toggleResultPanel: () => void;
    toggleRightSidebar: () => void;

    setShowSidebar: (show: boolean) => void;
    setShowResultPanel: (show: boolean) => void;
    setShowRightSidebar: (show: boolean) => void;
    setBottomPanelView: (view: BottomPanelView) => void;
    setActiveBottomPanelId: (id: string) => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        set => ({
            showSidebar: true,
            showResultPanel: true,
            showRightSidebar: false,
            bottomPanelView: 'result' as BottomPanelView,
            activeBottomPanelId: 'audit',

            toggleSidebar: () => set(state => ({ showSidebar: !state.showSidebar })),
            toggleResultPanel: () => set(state => ({ showResultPanel: !state.showResultPanel })),
            toggleRightSidebar: () => set(state => ({ showRightSidebar: !state.showRightSidebar })),

            setShowSidebar: show => set({ showSidebar: show }),
            setShowResultPanel: show => set({ showResultPanel: show }),
            setShowRightSidebar: show => set({ showRightSidebar: show }),
            setBottomPanelView: view => set({ bottomPanelView: view }),
            setActiveBottomPanelId: id => set({ activeBottomPanelId: id }),
        }),
        {
            name: STORAGE_KEY.LAYOUT_STORE,
            partialize: state => ({
                showSidebar: state.showSidebar,
                showResultPanel: state.showResultPanel,
                showRightSidebar: state.showRightSidebar,
                bottomPanelView: state.bottomPanelView,
                activeBottomPanelId: state.activeBottomPanelId,
            }),
        },
    ),
);
