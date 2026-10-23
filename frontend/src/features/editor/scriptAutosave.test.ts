// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { models } from '../../../wailsjs/go/models';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { useAutosaveStore } from '../../stores/autosaveStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { useScriptStore } from '../../stores/scriptStore';
import { TAB_TYPE } from '../../lib/constants';
import {
    QUERY_AUTOSAVE_DEBOUNCE_MS,
    createAutosaveTimerBucket,
    reconcileAutosaveTimers,
    resolveDirtyAutosaveSignal,
    selectDirtyAutosaveTabIds,
} from './scriptAutosave';

const PROJECT_ID = 'project-1';
const CONNECTION = 'conn-1';

function installGateway() {
    const saveScript = vi.fn(async (_script: models.SavedScript, _content: string) => ({
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

function seedQueryTab(query: string): string {
    useEditorStore.setState({
        projectSessions: {
            __default__: {
                groups: [
                    {
                        id: 'group-1',
                        tabs: [
                            {
                                id: 'tab-1',
                                name: 'Query A',
                                query,
                                isRunning: false,
                                type: TAB_TYPE.QUERY,
                            },
                        ],
                        activeTabId: 'tab-1',
                    },
                ],
                activeGroupId: 'group-1',
            },
        },
        activeProjectId: '__default__',
        groups: [
            {
                id: 'group-1',
                tabs: [
                    {
                        id: 'tab-1',
                        name: 'Query A',
                        query,
                        isRunning: false,
                        type: TAB_TYPE.QUERY,
                    },
                ],
                activeTabId: 'tab-1',
            },
        ],
        activeGroupId: 'group-1',
    });
    return 'tab-1';
}

function setTabQuery(query: string) {
    useEditorStore.getState().updateTabQuery('tab-1', query);
}

const fakeTimerApi = () => ({
    setTimeout: (callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle: number) => window.clearTimeout(handle),
});

describe('autosave reconciliation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useAutosaveStore.getState().reset();
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

    it('records a baseline for a tab it sees for the first time', () => {
        seedQueryTab('select 1');

        const signal = resolveDirtyAutosaveSignal(useEditorStore.getState().groups);

        expect(signal.liveTabIds.has('tab-1')).toBe(true);
        expect(signal.dirtyTabIds).toEqual([]);
        expect(signal.baselinePatches).toEqual([{ tabId: 'tab-1', query: 'select 1' }]);
    });

    it('reports a tab as dirty once its query diverges from the baseline', () => {
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        setTabQuery('select 2');

        const signal = resolveDirtyAutosaveSignal(useEditorStore.getState().groups);

        expect(signal.dirtyTabIds).toEqual(['tab-1']);
    });

    it('the selector signature ignores edits that do not change the dirty set', () => {
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        setTabQuery('select 2');
        const dirtySignature = selectDirtyAutosaveTabIds(useEditorStore.getState().groups);

        // Still dirty, but with different text: the effect must not re-run.
        setTabQuery('select 2, 3');

        expect(selectDirtyAutosaveTabIds(useEditorStore.getState().groups)).toBe(dirtySignature);
    });

    it('excludes a tab whose query is blank', () => {
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        setTabQuery('   ');

        const signal = resolveDirtyAutosaveSignal(useEditorStore.getState().groups);

        expect(signal.liveTabIds.has('tab-1')).toBe(true);
        expect(signal.dirtyTabIds).toEqual([]);
    });

    it('excludes a tab with no resolvable scope', () => {
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        useEditorStore.getState().updateTabContext('tab-1', {
            scriptProjectId: undefined,
            scriptConnectionName: undefined,
        });
        useConnectionStore.setState({ activeProfile: null } as never);
        useProjectStore.setState({ activeProject: null } as never);
        setTabQuery('select 2');

        expect(resolveDirtyAutosaveSignal(useEditorStore.getState().groups).dirtyTabIds).toEqual(
            [],
        );
    });

    it('excludes a tab backed by a source-control file', () => {
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        useEditorStore.getState().updateTabContext('tab-1', { sourceControlFile: 'gitignore' });
        setTabQuery('select 2');

        expect(resolveDirtyAutosaveSignal(useEditorStore.getState().groups).dirtyTabIds).toEqual(
            [],
        );
    });

    it('schedules one save per dirty tab and fires it after the delay', async () => {
        const gateway = installGateway();
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        setTabQuery('select 2');

        const bucket = createAutosaveTimerBucket(fakeTimerApi());
        reconcileAutosaveTimers(useEditorStore.getState().groups, bucket);

        expect(bucket.timers.size).toBe(1);

        await vi.advanceTimersByTimeAsync(QUERY_AUTOSAVE_DEBOUNCE_MS);
        await Promise.resolve();

        expect(gateway.saveScript).toHaveBeenCalledTimes(1);
        expect(gateway.saveScript.mock.calls[0]?.[1]).toBe('select 2');
    });

    it('cancels the pending save when the tab becomes clean', async () => {
        const gateway = installGateway();
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        setTabQuery('select 2');

        const bucket = createAutosaveTimerBucket(fakeTimerApi());
        reconcileAutosaveTimers(useEditorStore.getState().groups, bucket);
        expect(bucket.timers.size).toBe(1);

        setTabQuery('select 1');
        reconcileAutosaveTimers(useEditorStore.getState().groups, bucket);

        expect(bucket.timers.size).toBe(0);
        await vi.advanceTimersByTimeAsync(5000);
        expect(gateway.saveScript).not.toHaveBeenCalled();
    });

    it('saves immediately when the delay is zero (periodic sweep)', async () => {
        const gateway = installGateway();
        seedQueryTab('select 1');
        useAutosaveStore.getState().ensureBaseline('tab-1', 'select 1');
        setTabQuery('select 2');

        const bucket = createAutosaveTimerBucket(fakeTimerApi());
        const started = reconcileAutosaveTimers(useEditorStore.getState().groups, bucket, 0);

        expect(bucket.timers.size).toBe(0);
        expect(started).toHaveLength(1);

        await Promise.all(started);

        expect(gateway.saveScript).toHaveBeenCalledTimes(1);
        expect(gateway.saveScript.mock.calls[0]?.[1]).toBe('select 2');
    });
});
