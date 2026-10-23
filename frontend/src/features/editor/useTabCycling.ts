// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Tab } from '../../stores/editorStore';

interface TabCyclerArgs {
    /** Globally active tab id (per editor store) — drives MRU tracking. */
    activeTabId: string | undefined;
    /** Map of all known tabs → activate function. Cycle skips any id missing here. */
    tabsById: Map<string, { tab: Tab; groupId: string }>;
    /** Called when the user releases Ctrl to commit the selected tab. */
    onActivateTab: (tabId: string) => void;
}

interface TabSwitcherState {
    open: boolean;
    orderedIds: string[];
    index: number;
}

/**
 * Ctrl+Tab / Ctrl+Shift+Tab cycler. Maintains MRU order in a ref so the most-
 * recently-active tab is always second in the cycle (mirrors browser behaviour).
 * On Ctrl release commits the highlighted tab; on window blur cancels.
 *
 * Returns the popover state so the consumer can render the cycle overlay.
 */
export function useTabCycling({ activeTabId, tabsById, onActivateTab }: TabCyclerArgs): {
    tabSwitcher: TabSwitcherState;
    recentTabIds: string[];
    /** Immediately activate tabId and close the switcher (mouse click on a row). */
    selectTab: (tabId: string) => void;
} {
    const recentTabIdsRef = useRef<string[]>([]);
    const [tabSwitcher, setTabSwitcher] = useState<TabSwitcherState>({
        open: false,
        orderedIds: [],
        index: 0,
    });

    // Prune ids that no longer exist, and append tabs that were never active
    // this session (restored or opened in the background) after the used ones,
    // so they are still reachable.
    useEffect(() => {
        const alive = new Set<string>();
        tabsById.forEach((_, id) => alive.add(id));
        const kept = recentTabIdsRef.current.filter(id => alive.has(id));
        const keptSet = new Set(kept);
        alive.forEach(id => {
            if (!keptSet.has(id)) kept.push(id);
        });
        recentTabIdsRef.current = kept;
    }, [tabsById]);

    useEffect(() => {
        if (!activeTabId) return;
        recentTabIdsRef.current = [
            activeTabId,
            ...recentTabIdsRef.current.filter(id => id !== activeTabId),
        ];
    }, [activeTabId]);

    const handleCommit = useCallback(
        (state: TabSwitcherState) => {
            if (state.open && state.orderedIds.length > 0) {
                const targetTabId = state.orderedIds[state.index];
                if (targetTabId) {
                    onActivateTab(targetTabId);
                }
            }
        },
        [onActivateTab],
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey || e.key !== 'Tab') return;
            if (e.repeat) return;
            // Match only a dialog that's actually open, not one Radix is still
            // mounting during its exit animation (or one stuck there because
            // the animation never fired an end event) — either would
            // otherwise wedge this shortcut off for the rest of the session.
            if (document.querySelector('[role="dialog"][data-state="open"]')) return;

            const availableIds = recentTabIdsRef.current.filter(id => tabsById.has(id));
            if (availableIds.length < 2) return;
            e.preventDefault();

            setTabSwitcher(prev => {
                if (!prev.open) {
                    const current = activeTabId || availableIds[0];
                    const ordered = [current, ...availableIds.filter(id => id !== current)];
                    const direction = e.shiftKey ? -1 : 1;
                    const nextIndex = (direction + ordered.length) % ordered.length;
                    return { open: true, orderedIds: ordered, index: nextIndex };
                }

                const direction = e.shiftKey ? -1 : 1;
                const nextIndex =
                    (prev.index + direction + prev.orderedIds.length) % prev.orderedIds.length;
                return { ...prev, index: nextIndex };
            });
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                setTabSwitcher(prev => {
                    handleCommit(prev);
                    return { ...prev, open: false };
                });
                return;
            }
            if (!e.ctrlKey) {
                setTabSwitcher(prev => ({ ...prev, open: false }));
            }
        };

        const handleWindowBlur = () => {
            setTabSwitcher(prev => ({ ...prev, open: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleWindowBlur);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [activeTabId, handleCommit, tabsById]);

    const selectTab = useCallback(
        (tabId: string) => {
            onActivateTab(tabId);
            setTabSwitcher(prev => ({ ...prev, open: false }));
        },
        [onActivateTab],
    );

    return { tabSwitcher, recentTabIds: recentTabIdsRef.current, selectTab };
}
