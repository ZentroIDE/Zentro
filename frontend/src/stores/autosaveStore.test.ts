// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';

import { useAutosaveStore } from './autosaveStore';

describe('autosaveStore', () => {
    beforeEach(() => {
        useAutosaveStore.getState().reset();
    });

    it('keeps the first baseline until an explicit save updates it', () => {
        const store = useAutosaveStore.getState();

        store.ensureBaseline('tab-1', 'select 1');
        store.ensureBaseline('tab-1', 'select 2');

        expect(useAutosaveStore.getState().getBaseline('tab-1')).toBe('select 1');

        store.markSaved('tab-1', 'select 3');
        expect(useAutosaveStore.getState().getBaseline('tab-1')).toBe('select 3');
    });

    it('prunes baseline state for tabs that no longer exist', () => {
        const store = useAutosaveStore.getState();

        store.ensureBaseline('tab-1', 'select 1');
        store.ensureBaseline('tab-2', 'select 2');
        store.pruneMissingTabs(new Set(['tab-2']));

        expect(useAutosaveStore.getState().lastSavedQueryByTabId).toEqual({
            'tab-2': 'select 2',
        });
    });

    it('tracks in-flight saves by tab id', () => {
        const task = Promise.resolve(true);
        const store = useAutosaveStore.getState();

        store.setInFlightSave('tab-1', task);
        expect(useAutosaveStore.getState().getInFlightSave('tab-1')).toBe(task);

        store.clearInFlightSave('tab-1');
        expect(useAutosaveStore.getState().getInFlightSave('tab-1')).toBeUndefined();
    });

    it('stores the shared save mutex', async () => {
        const releaseOrder: string[] = [];
        let resolveMutex: (() => void) | undefined;
        const mutex = new Promise<void>(resolve => {
            resolveMutex = () => {
                releaseOrder.push('released');
                resolve();
            };
        });

        useAutosaveStore.getState().setGlobalSaveMutex(mutex);
        const pending = useAutosaveStore
            .getState()
            .getGlobalSaveMutex()
            .then(() => {
                releaseOrder.push('awaited');
            });

        expect(releaseOrder).toEqual([]);
        if (!resolveMutex) {
            throw new Error('Expected mutex resolver to be initialized');
        }
        resolveMutex();
        await pending;
        expect(releaseOrder).toEqual(['released', 'awaited']);
    });

    it('resets all autosave state', () => {
        const store = useAutosaveStore.getState();

        store.ensureBaseline('tab-1', 'select 1');
        store.setInFlightSave('tab-1', Promise.resolve(true));
        store.setGlobalSaveMutex(Promise.resolve());
        store.reset();

        expect(useAutosaveStore.getState().lastSavedQueryByTabId).toEqual({});
        expect(useAutosaveStore.getState().inFlightSaveByTabId).toEqual({});
        expect(useAutosaveStore.getState().getBaseline('tab-1')).toBeUndefined();
    });
});
