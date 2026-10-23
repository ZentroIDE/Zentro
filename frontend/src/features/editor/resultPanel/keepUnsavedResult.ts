// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { getDataDirtyCount } from '../../../lib/pendingChanges';
import { nextKeptResultKey } from '../../../lib/resultKeys';
import { useResultStore } from '../../../stores/resultStore';

/**
 * Running a query replaces the tab's main result. When that result still has
 * unsaved edits, set it aside instead of asking the user to decide first: it
 * moves, edits and all, to its own result key, so the new run can take the
 * main slot and both can be looked at freely.
 *
 * Returns the key the result was kept under, or `null` when there was nothing
 * to keep. Must run before the new run starts, since that reuses the main key.
 */
export async function keepUnsavedResult(sourceTabId: string): Promise<string | null> {
    const dirty = () => getDataDirtyCount(useResultStore.getState().results[sourceTabId]) > 0;
    if (!dirty()) return null;

    const keptKey = nextKeptResultKey(sourceTabId, Object.keys(useResultStore.getState().results));

    try {
        // Paging and export look the statement up by tab id; without this the
        // kept result could show what it already has but not load more.
        await getApiGateway().query.copyActiveQuery?.(sourceTabId, keptKey);
    } catch (error) {
        console.warn('Could not carry the query over to the kept result', error);
    }

    // The edits may have been saved or discarded while the call was in flight.
    if (!dirty()) return null;

    useResultStore.getState().keepResult(sourceTabId, keptKey);
    return keptKey;
}
