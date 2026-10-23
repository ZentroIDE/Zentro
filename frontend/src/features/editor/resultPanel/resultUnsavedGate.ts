// SPDX-License-Identifier: GPL-3.0-only

/**
 * What the user is about to do that would replace (and so discard the edits
 * in) the result grid. Drives the wording of the "Save your changes?" banner.
 */
export type ResultLeaveIntent = 'reload' | 'run' | 'filter' | 'close';

export type RequestResultLeave = (intent: ResultLeaveIntent, proceed: () => void) => void;

interface ResultUnsavedGateController {
    hasUnsaved: () => boolean;
    request: RequestResultLeave;
}

/**
 * For a tab whose panel isn't mounted but whose edits live on in the result
 * store: bring the panel up, then let it ask.
 */
export interface UnmountedResultLeave {
    isDirty: () => boolean;
    /** Makes the tab's result panel visible so it mounts and registers. */
    reveal: () => void;
    /** The panel never showed up in time; the action was dropped, not run. */
    onUnavailable: () => void;
    timeoutMs?: number;
}

interface DeferredLeave {
    intent: ResultLeaveIntent;
    proceed: () => void;
    timer: ReturnType<typeof setTimeout>;
}

const REVEAL_TIMEOUT_MS = 1500;

// Keyed by the ResultPanel's tabId. A panel registers itself while mounted so
// callers outside it (the SQL editor's Run, tab close) can ask "is it safe to
// replace this result?" without reaching into the panel's state.
const controllers = new Map<string, ResultUnsavedGateController>();
const deferred = new Map<string, DeferredLeave>();

function askController(
    controller: ResultUnsavedGateController,
    intent: ResultLeaveIntent,
    proceed: () => void,
): boolean {
    if (!controller.hasUnsaved()) {
        proceed();
        return true;
    }
    controller.request(intent, proceed);
    return false;
}

export function registerResultUnsavedGate(
    tabId: string,
    controller: ResultUnsavedGateController,
): () => void {
    controllers.set(tabId, controller);

    const waiting = deferred.get(tabId);
    if (waiting) {
        clearTimeout(waiting.timer);
        deferred.delete(tabId);
        askController(controller, waiting.intent, waiting.proceed);
    }

    return () => {
        if (controllers.get(tabId) === controller) {
            controllers.delete(tabId);
        }
    };
}

/**
 * Runs `proceed` right away when the tab's result has no unsaved edits (or no
 * panel is mounted for it). Otherwise hands `proceed` to the panel, which
 * shows the banner and runs it only if the user saves first.
 *
 * Pass `unmounted` when the edits can outlive the panel (they are kept in the
 * result store): with no panel mounted but edits pending, the panel is
 * revealed and the action waits for it instead of running.
 *
 * Returns true when `proceed` ran immediately.
 */
export function guardResultLeave(
    tabId: string,
    intent: ResultLeaveIntent,
    proceed: () => void,
    unmounted?: UnmountedResultLeave,
): boolean {
    const controller = controllers.get(tabId);
    if (controller) {
        return askController(controller, intent, proceed);
    }

    if (unmounted?.isDirty()) {
        const previous = deferred.get(tabId);
        if (previous) clearTimeout(previous.timer);

        const timer = setTimeout(() => {
            deferred.delete(tabId);
            unmounted.onUnavailable();
        }, unmounted.timeoutMs ?? REVEAL_TIMEOUT_MS);
        deferred.set(tabId, { intent, proceed, timer });
        unmounted.reveal();
        return false;
    }

    proceed();
    return true;
}
