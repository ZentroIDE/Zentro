// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { withStoreLogger } from './logger';

interface AutosaveStoreState {
    lastSavedQueryByTabId: Record<string, string>;
    inFlightSaveByTabId: Record<string, Promise<boolean>>;
    /** Tabs with a debounce timer pending — a save for them is already coming. */
    scheduledSaveByTabId: Record<string, true>;
    globalSaveMutex: Promise<void>;

    ensureBaseline: (tabId: string, query: string) => void;
    getBaseline: (tabId: string) => string | undefined;
    markSaved: (tabId: string, query: string) => void;
    pruneMissingTabs: (liveTabIds: Set<string>) => void;

    getInFlightSave: (tabId: string) => Promise<boolean> | undefined;
    setInFlightSave: (tabId: string, task: Promise<boolean>) => void;
    clearInFlightSave: (tabId: string) => void;

    isSaveScheduled: (tabId: string) => boolean;
    setSaveScheduled: (tabId: string, scheduled: boolean) => void;

    getGlobalSaveMutex: () => Promise<void>;
    setGlobalSaveMutex: (mutex: Promise<void>) => void;
    reset: () => void;
}

const INITIAL_MUTEX = Promise.resolve();

export const useAutosaveStore = create<AutosaveStoreState>()(
    withStoreLogger('autosaveStore', (set, get) => ({
        lastSavedQueryByTabId: {},
        inFlightSaveByTabId: {},
        scheduledSaveByTabId: {},
        globalSaveMutex: INITIAL_MUTEX,

        ensureBaseline: (tabId, query) =>
            set(state => {
                if (Object.prototype.hasOwnProperty.call(state.lastSavedQueryByTabId, tabId)) {
                    return state;
                }

                return {
                    lastSavedQueryByTabId: {
                        ...state.lastSavedQueryByTabId,
                        [tabId]: query,
                    },
                };
            }),

        getBaseline: tabId => get().lastSavedQueryByTabId[tabId],

        markSaved: (tabId, query) =>
            set(state => ({
                lastSavedQueryByTabId: {
                    ...state.lastSavedQueryByTabId,
                    [tabId]: query,
                },
            })),

        pruneMissingTabs: liveTabIds =>
            set(state => {
                let didChange = false;
                const nextBaselineByTabId: Record<string, string> = {};

                Object.entries(state.lastSavedQueryByTabId).forEach(([tabId, query]) => {
                    if (liveTabIds.has(tabId)) {
                        nextBaselineByTabId[tabId] = query;
                    } else {
                        didChange = true;
                    }
                });

                const nextScheduledByTabId: Record<string, true> = {};
                Object.keys(state.scheduledSaveByTabId).forEach(tabId => {
                    if (liveTabIds.has(tabId)) {
                        nextScheduledByTabId[tabId] = true;
                    } else {
                        didChange = true;
                    }
                });

                if (!didChange) {
                    return state;
                }

                return {
                    lastSavedQueryByTabId: nextBaselineByTabId,
                    scheduledSaveByTabId: nextScheduledByTabId,
                };
            }),

        getInFlightSave: tabId => get().inFlightSaveByTabId[tabId],

        setInFlightSave: (tabId, task) =>
            set(state => ({
                inFlightSaveByTabId: {
                    ...state.inFlightSaveByTabId,
                    [tabId]: task,
                },
            })),

        clearInFlightSave: tabId =>
            set(state => {
                if (!Object.prototype.hasOwnProperty.call(state.inFlightSaveByTabId, tabId)) {
                    return state;
                }

                const nextInFlightSaveByTabId = { ...state.inFlightSaveByTabId };
                delete nextInFlightSaveByTabId[tabId];

                return {
                    inFlightSaveByTabId: nextInFlightSaveByTabId,
                };
            }),

        isSaveScheduled: tabId => get().scheduledSaveByTabId[tabId] === true,

        setSaveScheduled: (tabId, scheduled) =>
            set(state => {
                const isScheduled = state.scheduledSaveByTabId[tabId] === true;
                if (isScheduled === scheduled) {
                    return state;
                }

                const nextScheduledByTabId = { ...state.scheduledSaveByTabId };
                if (scheduled) {
                    nextScheduledByTabId[tabId] = true;
                } else {
                    delete nextScheduledByTabId[tabId];
                }

                return {
                    scheduledSaveByTabId: nextScheduledByTabId,
                };
            }),

        getGlobalSaveMutex: () => get().globalSaveMutex,

        setGlobalSaveMutex: mutex =>
            set({
                globalSaveMutex: mutex,
            }),

        reset: () =>
            set({
                lastSavedQueryByTabId: {},
                inFlightSaveByTabId: {},
                scheduledSaveByTabId: {},
                globalSaveMutex: INITIAL_MUTEX,
            }),
    })),
);
