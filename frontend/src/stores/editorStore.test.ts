// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useEditorStore } from './editorStore';
import { TAB_TYPE } from '../lib/constants';
import { useScriptStore } from './scriptStore';
import { useProjectStore } from './projectStore';
import { useConnectionStore } from './connectionStore';

describe('editorStore', () => {
    beforeEach(() => {
        vi.stubGlobal('crypto', {
            randomUUID: vi
                .fn()
                .mockReturnValueOnce('tab-1')
                .mockReturnValueOnce('group-2')
                .mockReturnValue('uuid'),
        });
        useEditorStore.setState({
            projectSessions: {
                __default__: {
                    groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
                    activeGroupId: 'group-1',
                },
            },
            activeProjectId: '__default__',
            groups: [{ id: 'group-1', tabs: [], activeTabId: null }],
            activeGroupId: 'group-1',
        } as any);
        useScriptStore.setState({
            scripts: [],
            activeProjectId: null,
            activeConnection: null,
        });
        useProjectStore.setState({
            activeProject: { id: 'project-1' },
        } as any);
        useConnectionStore.setState({
            activeProfile: { name: 'conn-1' },
        } as any);
    });

    it('adds and activates a tab', () => {
        const id = useEditorStore.getState().addTab({ name: 'Tab A' });
        const state = useEditorStore.getState();
        expect(id).toBe('tab-1');
        expect(state.groups[0].tabs).toHaveLength(1);
        expect(state.groups[0].activeTabId).toBe('tab-1');
    });

    describe('without a project', () => {
        beforeEach(() => {
            useProjectStore.setState({ activeProject: null, hasBootstrapped: true } as any);
        });

        it('refuses to create query and data tabs', () => {
            expect(useEditorStore.getState().addTab({ name: 'Tab A' })).toBe('');
            expect(useEditorStore.getState().addTab({ type: TAB_TYPE.TABLE, content: 't' })).toBe(
                '',
            );
            expect(useEditorStore.getState().groups[0].tabs).toHaveLength(0);
        });

        it('still opens app-level settings and shortcuts tabs', () => {
            useEditorStore.getState().addTab({ type: TAB_TYPE.SETTINGS, name: 'Settings' });
            useEditorStore.getState().addTab({ type: TAB_TYPE.SHORTCUTS, name: 'Shortcuts' });
            expect(useEditorStore.getState().groups[0].tabs).toHaveLength(2);
        });

        it('does not block before the project store has bootstrapped', () => {
            useProjectStore.setState({ hasBootstrapped: false } as any);
            expect(useEditorStore.getState().addTab({ name: 'Tab A' })).not.toBe('');
        });
    });

    it('moves tab to a split group', () => {
        const id = useEditorStore.getState().addTab({ name: 'Tab A' });
        useEditorStore.getState().splitGroup('group-1', id);

        const state = useEditorStore.getState();
        expect(state.groups).toHaveLength(2);
        expect(state.groups[1].tabs[0].id).toBe(id);
    });

    it('renames only query tabs', () => {
        const queryId = useEditorStore.getState().addTab({ name: 'Query A', type: TAB_TYPE.QUERY });
        const settingsId = useEditorStore
            .getState()
            .addTab({ name: 'Settings', type: TAB_TYPE.SETTINGS });

        useEditorStore.getState().renameTab(queryId, 'Renamed Query');
        useEditorStore.getState().renameTab(settingsId, 'Should Not Rename');

        const tabs = useEditorStore.getState().groups.flatMap(group => group.tabs);
        expect(tabs.find(tab => tab.id === queryId)?.name).toBe('Renamed Query');
        expect(tabs.find(tab => tab.id === settingsId)?.name).toBe('Settings');
    });

    it('uses saved script names to compute next New Query name for active scope', () => {
        useScriptStore.setState({
            scripts: [
                {
                    id: 's1',
                    name: 'New Query',
                    project_id: 'project-1',
                    connection_name: 'conn-1',
                } as any,
                {
                    id: 's2',
                    name: 'New Query 2',
                    project_id: 'project-1',
                    connection_name: 'conn-1',
                } as any,
                {
                    id: 's3',
                    name: 'New Query 3',
                    project_id: 'project-1',
                    connection_name: 'conn-1',
                } as any,
            ],
            activeProjectId: 'project-1',
            activeConnection: 'conn-1',
        });

        useEditorStore.getState().addTab();
        const state = useEditorStore.getState();
        const activeGroup = state.groups.find(group => group.id === state.activeGroupId);
        const tab = activeGroup?.tabs.find(item => item.id === activeGroup.activeTabId);
        expect(tab?.name).toBe('New Query 4');
    });

    // zustand's persist middleware calls storage.setItem on EVERY set(), and
    // the editor session is a large object, so an unthrottled write per
    // keystroke mirror was the main-thread stall behind delayed typing.
    it('coalesces rapid query mirrors into far fewer session writes', () => {
        vi.useFakeTimers();
        try {
            const tabId = useEditorStore
                .getState()
                .addTab({ name: 'Query A', type: TAB_TYPE.QUERY });
            const setItemSpy = vi.spyOn(localStorage, 'setItem');

            for (let index = 0; index < 20; index += 1) {
                useEditorStore.getState().updateTabQuery(tabId, `select ${index}`);
                vi.advanceTimersByTime(150); // Monaco's mirror debounce
            }
            act(() => {
                vi.advanceTimersByTime(1000);
            });

            // 20 mirrors spanning 3s at a 500ms window, not 20 writes.
            expect(setItemSpy.mock.calls.length).toBeLessThan(10);
            expect(useEditorStore.getState().groups[0]?.tabs[0]?.query).toBe('select 19');
        } finally {
            vi.useRealTimers();
        }
    });
});
