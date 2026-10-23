// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { useAutosaveStore } from '../../stores/autosaveStore';
import { useEditorStore } from '../../stores/editorStore';
import { useScriptStore } from '../../stores/scriptStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { QUERY_AUTOSAVE_DEBOUNCE_MS, QUERY_AUTOSAVE_INTERVAL_MS } from './scriptAutosave';
import { useQueryTabAutosave } from './useQueryTabAutosave';

const PROJECT_ID = 'project-1';
const CONNECTION = 'conn-1';

function installGateway() {
    const saveScript = vi.fn(async (_script: unknown, _content: string) => ({
        ok: true as const,
        data: undefined,
    }));
    setApiGateway({
        script: {
            getScripts: vi.fn(async () => ({ ok: true as const, data: [] })),
            saveScript,
            deleteScript: vi.fn(async () => ({ ok: true as const, data: undefined })),
            getScriptContent: vi.fn(async () => ({ ok: true as const, data: '' })),
        },
    } as unknown as ApiGateway);
    return { saveScript };
}

/**
 * Store mutations must run inside `act` so the hook's subscription re-renders
 * and its reconcile effect observes the new tree before timers advance.
 */
function addQueryTab(query: string): string {
    let tabId = '';
    act(() => {
        tabId = useEditorStore.getState().addTab({ name: 'Query A' });
        useEditorStore.getState().updateTabQuery(tabId, query);
    });
    return tabId;
}

function editQuery(tabId: string, query: string) {
    act(() => {
        useEditorStore.getState().updateTabQuery(tabId, query);
    });
}

describe('useQueryTabAutosave', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // editorStore.addTab() derives tab/group ids from crypto.randomUUID,
        // which the jsdom test environment does not provide.
        vi.stubGlobal('crypto', {
            randomUUID: vi.fn(() => 'tab-1'),
        });
        useAutosaveStore.getState().reset();
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
        });
        useScriptStore.setState({
            scripts: [],
            activeProjectId: null,
            activeConnection: null,
            loadedScope: null,
        });
        useProjectStore.setState({ activeProject: { id: PROJECT_ID } } as never);
        useConnectionStore.setState({ activeProfile: { name: CONNECTION } } as never);
    });

    afterEach(() => {
        vi.useRealTimers();
        resetApiGateway();
    });

    it('does not schedule a save for a tab that has not been edited', async () => {
        const gateway = installGateway();
        renderHook(() => useQueryTabAutosave());
        addQueryTab('select 1');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS * 2);
        });

        expect(gateway.saveScript).not.toHaveBeenCalled();
    });

    it('saves once after the debounce window when the query changes', async () => {
        const gateway = installGateway();
        renderHook(() => useQueryTabAutosave());
        const tabId = addQueryTab('select 1');

        editQuery(tabId, 'select 2');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS);
        });

        expect(gateway.saveScript).toHaveBeenCalledTimes(1);
        expect(gateway.saveScript.mock.calls[0]?.[1]).toBe('select 2');
        expect(useAutosaveStore.getState().getBaseline(tabId)).toBe('select 2');
    });

    it('does not re-run the save when only the tab context changes', async () => {
        const gateway = installGateway();
        renderHook(() => useQueryTabAutosave());
        const tabId = addQueryTab('select 1');

        editQuery(tabId, 'select 2');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS);
        });
        expect(gateway.saveScript).toHaveBeenCalledTimes(1);

        // An autosave's own post-save bookkeeping patches the context — that
        // must not schedule another save for an unchanged query.
        act(() => {
            useEditorStore.getState().updateTabContext(tabId, { savedScriptId: 'select-2' });
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS * 2);
        });

        expect(gateway.saveScript).toHaveBeenCalledTimes(1);
    });

    it('cancels a pending save when the tab is closed first', async () => {
        const gateway = installGateway();
        renderHook(() => useQueryTabAutosave());
        const tabId = addQueryTab('select 1');

        editQuery(tabId, 'select 2');
        act(() => {
            useEditorStore.getState().removeTab(tabId, 'group-1');
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS * 2);
        });

        expect(gateway.saveScript).not.toHaveBeenCalled();
    });

    it('the periodic sweep retries a tab left dirty by a failed save', async () => {
        const gateway = installGateway();
        gateway.saveScript.mockRejectedValueOnce(new Error('backend down'));
        renderHook(() => useQueryTabAutosave());
        const tabId = addQueryTab('select 1');

        editQuery(tabId, 'select 2');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS);
        });
        expect(gateway.saveScript).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_INTERVAL_MS);
        });

        expect(gateway.saveScript).toHaveBeenCalledTimes(2);
    });
});
