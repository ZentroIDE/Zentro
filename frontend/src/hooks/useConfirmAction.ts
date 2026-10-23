// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useState } from 'react';

export interface UseConfirmActionResult<T> {
    pending: T | null;
    /** Opens the confirm dialog for `target`. */
    request: (target: T) => void;
    /** Closes the confirm dialog without running the action. */
    cancel: () => void;
    /** Runs `action` against the pending target — the dialog stays open
     *  (so a caller can show its own busy/disabled state) until `action`
     *  settles, then closes regardless of whether it threw. Does nothing
     *  if there's no pending target. `action` is the caller's own
     *  handler, including its own error handling — any further gating
     *  (e.g. a write-safety guard) stays there, unchanged. */
    confirm: (action: (target: T) => Promise<void> | void) => Promise<void>;
}

/** Generic "are you sure?" pending-target gate for a single consequential
 *  action. Pair with `ConfirmDialog` for the UI. This hook has no opinion
 *  on what happens on confirm — it only owns whether a dialog is open and
 *  for which target. */
export function useConfirmAction<T>(): UseConfirmActionResult<T> {
    const [pending, setPending] = useState<T | null>(null);

    const request = useCallback((target: T) => setPending(target), []);
    const cancel = useCallback(() => setPending(null), []);

    const confirm = useCallback(
        async (action: (target: T) => Promise<void> | void) => {
            if (pending === null) return;
            const target = pending;
            try {
                await action(target);
            } finally {
                setPending(null);
            }
        },
        [pending],
    );

    return { pending, request, cancel, confirm };
}
