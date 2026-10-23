// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from './terminalStore';

const local = (id: string) => ({ id, kind: 'local' as const, title: `shell ${id}` });

describe('terminalStore', () => {
    beforeEach(() => useTerminalStore.getState().clear());

    it('adds a tab and makes it the active one', () => {
        const s = useTerminalStore.getState();
        s.addTab(local('a'));
        s.addTab(local('b'));

        const { tabs, activeId } = useTerminalStore.getState();
        expect(tabs.map(t => t.id)).toEqual(['a', 'b']);
        expect(tabs.every(t => !t.exited)).toBe(true);
        expect(activeId).toBe('b');
    });

    it('marks a session exited without dropping it', () => {
        const s = useTerminalStore.getState();
        s.addTab(local('a'));
        s.markExited('a', 2);

        expect(useTerminalStore.getState().tabs[0]).toMatchObject({
            id: 'a',
            exited: true,
            exitCode: 2,
        });
    });

    it('hands focus to the neighbour when the active tab closes', () => {
        const s = useTerminalStore.getState();
        s.addTab(local('a'));
        s.addTab(local('b'));
        s.addTab(local('c'));
        s.setActive('b');

        s.removeTab('b');
        expect(useTerminalStore.getState().activeId).toBe('c');

        s.removeTab('c');
        expect(useTerminalStore.getState().activeId).toBe('a');

        s.removeTab('a');
        expect(useTerminalStore.getState().activeId).toBeNull();
    });

    it('keeps the active tab when a different one closes', () => {
        const s = useTerminalStore.getState();
        s.addTab(local('a'));
        s.addTab(local('b'));
        s.setActive('a');

        s.removeTab('b');

        expect(useTerminalStore.getState().activeId).toBe('a');
    });

    it('ignores removing a tab that does not exist', () => {
        const s = useTerminalStore.getState();
        s.addTab(local('a'));
        const before = useTerminalStore.getState();

        s.removeTab('nope');

        expect(useTerminalStore.getState()).toBe(before);
    });
});
