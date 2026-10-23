// SPDX-License-Identifier: GPL-3.0-only

import { useResultStore } from '../../../stores/resultStore';
import { getDataDirtyCount } from '../../../lib/pendingChanges';
import { resultKeysForTab } from '../../../lib/resultKeys';

/**
 * Whether any result grid of the query tab `tabId` holds edits that were never
 * saved: its main result or one kept beside it.
 *
 * Read from the result store, not from the mounted panel: the panel mirrors its
 * pending edits there and restores them on mount, so they outlive it. That is
 * what lets the tab strip flag a query tab whose panel isn't on screen.
 */
export function useResultHasUnsavedChanges(tabId: string): boolean {
    return useResultStore(state =>
        resultKeysForTab(tabId, Object.keys(state.results)).some(
            key => getDataDirtyCount(state.results[key]) > 0,
        ),
    );
}
