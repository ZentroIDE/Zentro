// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEditorStore } from '../../../stores/editorStore';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useResultStore } from '../../../stores/resultStore';
import { guardTabResultLeave } from './guardTabResultLeave';
import { registerResultUnsavedGate } from './resultUnsavedGate';

const tab = (id: string) => ({ id, name: id, query: '', isRunning: false, type: 'query' }) as any;

function setUpTabs() {
    useEditorStore.setState({
        groups: [
            { id: 'g1', tabs: [tab('q1')], activeTabId: 'q1' },
            { id: 'g2', tabs: [tab('q2')], activeTabId: 'q2' },
        ] as any,
        activeGroupId: 'g1',
    });
    useLayoutStore.setState({ showResultPanel: false, bottomPanelView: 'panel' });
}

afterEach(() => {
    useResultStore.setState({ results: {} });
});

describe('guardTabResultLeave', () => {
    it('brings a dirty tab to the front with its result panel showing, and holds the action', () => {
        setUpTabs();
        useResultStore.setState({
            results: { q2: { pendingEdits: new Map([['0:0', 'x']]) } as any },
        });
        const proceed = vi.fn();

        const ranNow = guardTabResultLeave('q2', 'close', proceed, vi.fn());

        expect(ranNow).toBe(false);
        expect(proceed).not.toHaveBeenCalled();
        expect(useEditorStore.getState().activeGroupId).toBe('g2');
        expect(useLayoutStore.getState().showResultPanel).toBe(true);
        expect(useLayoutStore.getState().bottomPanelView).toBe('result');

        // The panel mounting is what lets the banner ask.
        const panel = { hasUnsaved: () => true, request: vi.fn() };
        const unregister = registerResultUnsavedGate('q2', panel);
        expect(panel.request).toHaveBeenCalledWith('close', expect.any(Function));

        // Answering the banner is what lets the action through.
        panel.request.mock.calls[0][1]();
        expect(proceed).toHaveBeenCalledTimes(1);
        unregister();
    });

    it('leaves the layout alone and proceeds when the tab has no pending edits', () => {
        setUpTabs();
        const proceed = vi.fn();

        expect(guardTabResultLeave('q2', 'close', proceed, vi.fn())).toBe(true);

        expect(proceed).toHaveBeenCalledTimes(1);
        expect(useEditorStore.getState().activeGroupId).toBe('g1');
        expect(useLayoutStore.getState().showResultPanel).toBe(false);
    });

    describe('a tab with more than one edited result', () => {
        const dirty = () => ({ pendingEdits: new Map([['0:0', 'x']]) }) as any;

        it('asks about the main result and the kept one in turn, then proceeds', () => {
            setUpTabs();
            useResultStore.setState({
                results: { q2: dirty(), 'q2::result:kept-1': dirty() },
            });
            const proceed = vi.fn();
            const main = { hasUnsaved: () => true, request: vi.fn() };
            const kept = { hasUnsaved: () => true, request: vi.fn() };
            const offMain = registerResultUnsavedGate('q2', main);
            const offKept = registerResultUnsavedGate('q2::result:kept-1', kept);

            const ranNow = guardTabResultLeave('q2', 'close', proceed, vi.fn());

            expect(ranNow).toBe(false);
            expect(main.request).toHaveBeenCalledTimes(1);
            expect(kept.request).not.toHaveBeenCalled();

            // Answer the first; the second is asked next, and only then does the action run.
            main.request.mock.calls[0][1]();
            expect(kept.request).toHaveBeenCalledTimes(1);
            expect(proceed).not.toHaveBeenCalled();

            kept.request.mock.calls[0][1]();
            expect(proceed).toHaveBeenCalledTimes(1);
            offMain();
            offKept();
        });

        it('does not ask again about a result it was just answered for, even before the store catches up', () => {
            setUpTabs();
            // The store still says both are dirty after the first answer.
            useResultStore.setState({
                results: { q2: dirty(), 'q2::result:kept-1': dirty() },
            });
            const proceed = vi.fn();
            const main = { hasUnsaved: () => true, request: vi.fn() };
            const kept = { hasUnsaved: () => true, request: vi.fn() };
            const offMain = registerResultUnsavedGate('q2', main);
            const offKept = registerResultUnsavedGate('q2::result:kept-1', kept);

            guardTabResultLeave('q2', 'close', proceed, vi.fn());
            main.request.mock.calls[0][1]();
            kept.request.mock.calls[0][1]();

            expect(main.request).toHaveBeenCalledTimes(1);
            expect(kept.request).toHaveBeenCalledTimes(1);
            expect(proceed).toHaveBeenCalledTimes(1);
            offMain();
            offKept();
        });

        it('reveals the kept result, not just the tab, when its panel is not showing', () => {
            setUpTabs();
            useResultStore.setState({ results: { 'q2::result:kept-1': dirty() } });

            guardTabResultLeave('q2', 'close', vi.fn(), vi.fn());

            expect(useResultStore.getState().resultRevealRequest?.key).toBe('q2::result:kept-1');
            expect(useEditorStore.getState().activeGroupId).toBe('g2');
        });

        it('proceeds straight away when the kept result was already saved', () => {
            setUpTabs();
            useResultStore.setState({
                results: { 'q2::result:kept-1': { pendingEdits: new Map() } as any },
            });
            const proceed = vi.fn();

            expect(guardTabResultLeave('q2', 'close', proceed, vi.fn())).toBe(true);
            expect(proceed).toHaveBeenCalledTimes(1);
        });
    });
});
