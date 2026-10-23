// SPDX-License-Identifier: GPL-3.0-only

import { useEditorStore } from '../../../stores/editorStore';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useResultStore } from '../../../stores/resultStore';
import { getDataDirtyCount } from '../../../lib/pendingChanges';
import { resultKeysForTab, sortResultKeys } from '../../../lib/resultKeys';
import { guardResultLeave, type ResultLeaveIntent } from './resultUnsavedGate';

export const RESULT_LEAVE_UNAVAILABLE_MESSAGE =
    'This tab has unsaved result changes. Open its result panel to save or discard them.';

function revealResultPanel(tabId: string, resultKey: string): void {
    const editor = useEditorStore.getState();
    const group = editor.groups.find(candidate => candidate.tabs.some(tab => tab.id === tabId));
    // Also makes that group the active one.
    if (group) editor.setActiveTabId(tabId, group.id);

    const layout = useLayoutStore.getState();
    layout.setShowResultPanel(true);
    layout.setBottomPanelView('result');
    // A query tab can hold several results (a kept one beside the current one).
    useResultStore.getState().requestResultReveal(resultKey);
}

/** Result keys of a tab that hold unsaved edits, in display order. */
export function getDirtyResultKeys(tabId: string): string[] {
    const { results } = useResultStore.getState();
    return sortResultKeys(tabId, resultKeysForTab(tabId, Object.keys(results))).filter(
        key => getDataDirtyCount(results[key]) > 0,
    );
}

/**
 * `guardResultLeave` for a query tab. Its edits sit in the result store, so
 * they survive the panel unmounting (another tab in front, result panel
 * collapsed, Explain/Audit shown instead). In that case the tab is brought to
 * the front with its result panel showing, and the banner asks from there.
 *
 * A tab can hold more than one edited result, so each is asked about in turn
 * and `proceed` runs once all of them have been answered.
 */
export function guardTabResultLeave(
    tabId: string,
    intent: ResultLeaveIntent,
    proceed: () => void,
    onUnavailable: () => void,
): boolean {
    // Answering discards or saves a result, but the store only hears about it a
    // render later, so remember which ones were dealt with rather than re-ask.
    const answered = new Set<string>();

    const askNext = (): boolean => {
        const key = getDirtyResultKeys(tabId).find(candidate => !answered.has(candidate));
        if (!key) {
            proceed();
            return true;
        }
        return guardResultLeave(
            key,
            intent,
            () => {
                answered.add(key);
                askNext();
            },
            {
                isDirty: () => getDataDirtyCount(useResultStore.getState().results[key]) > 0,
                reveal: () => revealResultPanel(tabId, key),
                onUnavailable,
            },
        );
    };

    return askNext();
}
