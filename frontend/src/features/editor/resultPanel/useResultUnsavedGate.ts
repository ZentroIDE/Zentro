// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    registerResultUnsavedGate,
    type RequestResultLeave,
    type ResultLeaveIntent,
} from './resultUnsavedGate';

const LEAVE_LABELS: Record<ResultLeaveIntent, { save: string; discard: string }> = {
    reload: { save: 'Save & Reload', discard: 'Discard' },
    run: { save: 'Save & Run', discard: 'Discard' },
    filter: { save: 'Save & Apply', discard: 'Discard' },
    close: { save: 'Save & Close', discard: 'Discard & Close' },
};

interface PendingLeave {
    intent: ResultLeaveIntent;
    proceed: () => void;
}

interface UseResultUnsavedGateOptions {
    tabId: string;
    hasPendingChanges: boolean;
    /** Persists the pending edits without reloading. Resolves false if nothing was saved. */
    save: () => Promise<boolean>;
    /** Throws the pending edits away. */
    discard: () => void;
}

/**
 * Guards every action that would replace the result grid (reload, F5, filter /
 * order run, Run from the SQL editor, closing the tab). With unsaved edits the
 * action is parked and a "Save your changes?" banner is shown instead:
 * - Save    → save, then run the parked action (only if the save went through)
 * - Discard → drop the edits and stop, except for close, which then closes
 * - Keep editing → drop the parked action
 */
export function useResultUnsavedGate({
    tabId,
    hasPendingChanges,
    save,
    discard,
}: UseResultUnsavedGateOptions) {
    const [pending, setPending] = React.useState<PendingLeave | null>(null);
    const [saving, setSaving] = React.useState(false);
    const hasPendingRef = React.useRef(hasPendingChanges);
    hasPendingRef.current = hasPendingChanges;

    const requestLeave = React.useCallback<RequestResultLeave>((intent, proceed) => {
        if (!hasPendingRef.current) {
            proceed();
            return;
        }
        setPending({ intent, proceed });
    }, []);

    React.useEffect(
        () =>
            registerResultUnsavedGate(tabId, {
                hasUnsaved: () => hasPendingRef.current,
                request: requestLeave,
            }),
        [requestLeave, tabId],
    );

    // Edits vanished some other way (toolbar Discard, saved elsewhere): the
    // parked action no longer has anything to wait for.
    React.useEffect(() => {
        if (pending && !hasPendingChanges) setPending(null);
    }, [hasPendingChanges, pending]);

    const handleSave = React.useCallback(async () => {
        if (!pending) return;
        setSaving(true);
        try {
            const didSave = await save();
            if (!didSave) return;
            setPending(null);
            pending.proceed();
        } finally {
            setSaving(false);
        }
    }, [pending, save]);

    const handleDiscard = React.useCallback(() => {
        if (!pending) return;
        discard();
        setPending(null);
        if (pending.intent === 'close') pending.proceed();
    }, [discard, pending]);

    const handleKeepEditing = React.useCallback(() => setPending(null), []);

    const labels = LEAVE_LABELS[pending?.intent ?? 'reload'];

    return {
        requestLeave,
        bannerProps: {
            open: pending !== null,
            saving,
            saveLabel: labels.save,
            discardLabel: labels.discard,
            onSave: () => void handleSave(),
            onDiscard: handleDiscard,
            onKeepEditing: handleKeepEditing,
        },
    } as const;
}
