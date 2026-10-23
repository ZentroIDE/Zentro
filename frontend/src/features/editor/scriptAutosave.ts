// SPDX-License-Identifier: GPL-3.0-only

import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore, type Tab, type TabGroup } from '../../stores/editorStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useScriptStore } from '../../stores/scriptStore';
import { useAutosaveStore } from '../../stores/autosaveStore';
import { TAB_TYPE } from '../../lib/constants';

export const QUERY_AUTOSAVE_DEBOUNCE_MS = 2000;
export const QUERY_AUTOSAVE_INTERVAL_MS = 15000;

export interface AutosaveTimerApi {
    setTimeout: (callback: () => void, delayMs: number) => number;
    clearTimeout: (handle: number) => void;
}

export interface AutosaveTimerBucket {
    /** Debounce timers, keyed by tab id. */
    timers: Map<string, number>;
    api: AutosaveTimerApi;
}

const DOM_TIMER_API: AutosaveTimerApi = {
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: handle => window.clearTimeout(handle),
};

export function createAutosaveTimerBucket(
    api: AutosaveTimerApi = DOM_TIMER_API,
): AutosaveTimerBucket {
    return { timers: new Map(), api };
}

function getQueryTab(tabId: string): Tab | null {
    const state = useEditorStore.getState();
    for (const group of state.groups) {
        const candidate = group.tabs.find(tab => tab.id === tabId);
        if (candidate?.type === TAB_TYPE.QUERY) {
            return candidate;
        }
    }
    return null;
}

interface AutosaveScope {
    projectId: string | null;
    profileName: string | null;
}

function resolveScopeForTab(tab: Tab): AutosaveScope {
    const activeProject = useProjectStore.getState().activeProject;
    const activeEnvironmentKey =
        useEnvironmentStore.getState().activeEnvironmentKey ||
        activeProject?.last_active_environment_key ||
        activeProject?.default_environment_key;
    // connection_ref is a pool connection ID — resolve it to the display
    // name scripts are actually scoped by on the backend.
    const envConnectionRef = activeProject?.environments?.find(
        item => item.key === activeEnvironmentKey,
    )?.connection_ref;
    const envConnectionName =
        useConnectionStore.getState().connections.find(c => c.id === envConnectionRef)?.name ||
        null;

    const projectId = activeProject?.id || tab.context?.scriptProjectId || null;
    const profileName =
        useConnectionStore.getState().activeProfile?.name ||
        tab.context?.scriptConnectionName ||
        envConnectionName ||
        null;

    return { projectId, profileName };
}

/**
 * A tab can only be auto-saved when it is a query tab with text, is not backed
 * by a source-control file, and has a resolvable project + connection scope.
 * Resolving that scope costs several store lookups, so callers that need
 * several answers derive them from one scope instead of re-resolving per
 * question.
 */
function isAutosaveCandidate(tab: Tab, scope: AutosaveScope): boolean {
    if (tab.type !== TAB_TYPE.QUERY) return false;
    if (tab.context?.sourceControlFile) return false;
    if (!tab.query?.trim()) return false;
    return Boolean(scope.projectId && scope.profileName);
}

export interface DirtyAutosaveSignal {
    /** Live query tabs, in tree order, whether dirty or not. */
    liveTabIds: Set<string>;
    /** Live query tabs that are dirty and currently eligible for autosave. */
    dirtyTabIds: string[];
    /**
     * Baselines to record for tabs seen for the first time. A baseline is the
     * query text a tab was opened with, so recording it here — during the
     * reconcile pass that always runs before the next keystroke mirror — is
     * what lets a later edit register as dirty.
     */
    baselinePatches: Array<{ tabId: string; query: string }>;
}

export function resolveDirtyAutosaveSignal(groups: TabGroup[]): DirtyAutosaveSignal {
    const autosave = useAutosaveStore.getState();
    const liveTabIds = new Set<string>();
    const dirtyTabIds: string[] = [];
    const baselinePatches: Array<{ tabId: string; query: string }> = [];

    for (const group of groups) {
        for (const tab of group.tabs) {
            if (tab.type !== TAB_TYPE.QUERY) continue;
            liveTabIds.add(tab.id);

            const baseline = autosave.getBaseline(tab.id);
            if (baseline === undefined) {
                baselinePatches.push({ tabId: tab.id, query: tab.query || '' });
                continue;
            }
            if (baseline === tab.query) continue;
            if (!isAutosaveCandidate(tab, resolveScopeForTab(tab))) continue;

            dirtyTabIds.push(tab.id);
        }
    }

    return { liveTabIds, dirtyTabIds, baselinePatches };
}

/**
 * Cheap, stable React selector value. The editor tree is replaced on every
 * keystroke mirror and on every context patch, so subscribing to `groups`
 * itself would re-run the autosave effect each time; subscribing to this
 * string instead means the effect only re-runs when the set of candidate tabs
 * changes.
 */
export function selectDirtyAutosaveTabIds(groups: TabGroup[]): string {
    const signal = resolveDirtyAutosaveSignal(groups);
    return `${signal.dirtyTabIds.join('\u0000')}|${signal.baselinePatches.length}`;
}

/**
 * Brings autosave state and debounce timers in line with the current editor
 * tree:
 *
 * - records baselines for tabs seen for the first time;
 * - gives each dirty tab one pending save (or fires it immediately when
 *   `delayMs <= 0`, which the periodic sweep uses to skip a second debounce);
 * - cancels the pending save of a tab that became clean, ineligible, or was
 *   closed — the callback re-reads the live query anyway, so letting it fire
 *   after the tab changed would only cost a redundant backend round trip;
 * - prunes autosave state for closed tabs.
 *
 * The dirty set is computed internally so the reconcile pass has exactly one
 * definition of "needs saving". When `delayMs <= 0` the started saves are
 * returned so callers (and tests) can await them; otherwise the result is
 * empty and the saves run from their timers.
 */
export function reconcileAutosaveTimers(
    groups: TabGroup[],
    bucket: AutosaveTimerBucket,
    delayMs = QUERY_AUTOSAVE_DEBOUNCE_MS,
): Promise<unknown>[] {
    const signal = resolveDirtyAutosaveSignal(groups);
    const autosave = useAutosaveStore.getState();
    const immediateSaves: Promise<unknown>[] = [];

    for (const patch of signal.baselinePatches) {
        autosave.ensureBaseline(patch.tabId, patch.query);
    }

    const dirtyTabIdSet = new Set(signal.dirtyTabIds);

    for (const group of groups) {
        for (const tab of group.tabs) {
            if (tab.type !== TAB_TYPE.QUERY) continue;

            const existing = bucket.timers.get(tab.id);
            const wantsSave = dirtyTabIdSet.has(tab.id);

            if (!wantsSave) {
                if (existing !== undefined) {
                    bucket.api.clearTimeout(existing);
                    bucket.timers.delete(tab.id);
                }
                continue;
            }

            if (existing !== undefined) continue;

            const tabId = tab.id;
            if (delayMs <= 0) {
                immediateSaves.push(saveQueryTabById(tabId).catch(() => undefined));
                continue;
            }

            bucket.timers.set(
                tabId,
                bucket.api.setTimeout(() => {
                    // Clear the scheduled slot first: the timer has fired, so a
                    // save for this tab is no longer merely pending, and
                    // saveQueryTabById would otherwise treat its own hint as
                    // "another save is coming" and bail out.
                    bucket.timers.delete(tabId);
                    useAutosaveStore.getState().setSaveScheduled(tabId, false);
                    void saveQueryTabById(tabId).catch(() => undefined);
                }, delayMs),
            );
        }
    }

    for (const [tabId, handle] of Array.from(bucket.timers.entries())) {
        if (signal.liveTabIds.has(tabId)) continue;
        bucket.api.clearTimeout(handle);
        bucket.timers.delete(tabId);
    }

    autosave.pruneMissingTabs(signal.liveTabIds);
    return immediateSaves;
}

/**
 * Serializes every script write through one chain so the backend never has two
 * saves racing on the same index.json. The chain lives in this module-local
 * tail rather than in store state, and each save always continues from the
 * previous tail, so a failed save can never leave a rejected promise at the
 * head of the queue and stall every later save.
 */
let saveQueueTail: Promise<void> = Promise.resolve();

export async function saveQueryTabById(tabId: string): Promise<boolean> {
    const autosaveStore = useAutosaveStore.getState();
    // A save for this tab is already scheduled to run shortly; folding into it
    // is the point of the debounce.
    if (autosaveStore.isSaveScheduled(tabId)) {
        return false;
    }

    const existing = autosaveStore.getInFlightSave(tabId);
    if (existing) {
        return existing;
    }

    autosaveStore.setSaveScheduled(tabId, true);

    let releaseMutex: () => void = () => {};
    const lock = new Promise<void>(resolve => {
        releaseMutex = resolve;
    });

    const previous = saveQueueTail;
    saveQueueTail = previous.then(() => lock).catch(() => undefined);

    const task = (async () => {
        await previous.catch(() => undefined);
        try {
            const tab = getQueryTab(tabId);
            if (!tab || !tab.query?.trim()) return false;
            if (tab.context?.sourceControlFile) return false;

            const { projectId, profileName } = resolveScopeForTab(tab);
            if (!projectId || !profileName) return false;

            const savedScriptId = await useScriptStore
                .getState()
                .saveScript(
                    projectId,
                    profileName,
                    tab.name,
                    tab.query,
                    tab.context?.savedScriptId,
                );

            useEditorStore.getState().updateTabContext(tabId, {
                savedScriptId,
                scriptProjectId: projectId,
                scriptConnectionName: profileName,
            });

            useAutosaveStore.getState().markSaved(tabId, tab.query);
            return true;
        } finally {
            releaseMutex();
        }
    })();

    autosaveStore.setInFlightSave(tabId, task);
    try {
        return await task;
    } finally {
        const store = useAutosaveStore.getState();
        store.clearInFlightSave(tabId);
        store.setSaveScheduled(tabId, false);
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`save timeout (${timeoutMs}ms)`)),
            timeoutMs,
        );
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            err => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

export async function saveAllOpenQueryTabs(options?: {
    timeoutMs?: number;
    concurrency?: number;
}): Promise<void> {
    const timeoutMs = Math.max(1000, options?.timeoutMs ?? 8000);
    const concurrency = Math.max(1, options?.concurrency ?? 4);

    const groups = useEditorStore.getState().groups;
    const tabIds = groups
        .flatMap(group => group.tabs)
        .filter(tab => tab.type === TAB_TYPE.QUERY && Boolean(tab.query?.trim()))
        .map(tab => tab.id);

    if (tabIds.length === 0) return;

    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, tabIds.length) }, () =>
        (async () => {
            while (index < tabIds.length) {
                const current = tabIds[index];
                index += 1;
                try {
                    await withTimeout(saveQueryTabById(current), timeoutMs);
                } catch {
                    // best effort on app close
                }
            }
        })(),
    );

    await Promise.race([
        Promise.all(workers),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
}
