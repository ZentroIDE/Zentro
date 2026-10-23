// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import {
    QUERY_AUTOSAVE_INTERVAL_MS,
    createAutosaveTimerBucket,
    reconcileAutosaveTimers,
    selectDirtyAutosaveTabIds,
} from './scriptAutosave';

/**
 * Debounced per-tab autosave plus a periodic safety sweep.
 *
 * The effect deliberately derives a stable signature of autosave candidates
 * instead of subscribing to the `groups` tree. `groups` is replaced by every
 * keystroke mirror and by every `updateTabContext` a save performs, so
 * subscribing to it re-ran the reconcile effect constantly — including from
 * the autosave's own post-save bookkeeping. The timer bookkeeping lives in a
 * ref, and the reconciler itself does the real work off live state.
 */
export function useQueryTabAutosave() {
    const autosaveSignature = useEditorStore(state => selectDirtyAutosaveTabIds(state.groups));
    const timerBucketRef = useRef(createAutosaveTimerBucket());

    useEffect(() => {
        reconcileAutosaveTimers(useEditorStore.getState().groups, timerBucketRef.current);
    }, [autosaveSignature]);

    useEffect(() => {
        const bucket = timerBucketRef.current;
        const interval = window.setInterval(() => {
            // delayMs 0: the sweep has already waited a full interval, so the
            // save starts now instead of waiting out another debounce.
            reconcileAutosaveTimers(useEditorStore.getState().groups, bucket, 0);
        }, QUERY_AUTOSAVE_INTERVAL_MS);

        return () => {
            window.clearInterval(interval);
            for (const handle of bucket.timers.values()) {
                bucket.api.clearTimeout(handle);
            }
            bucket.timers.clear();
        };
    }, []);
}
