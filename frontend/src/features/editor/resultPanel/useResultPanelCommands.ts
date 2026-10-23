// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { DOM_EVENT } from '../../../lib/constants';
import { useTabScopedCommand } from '../../../lib/commandBus';
import type { ResultPanelCommandDeps } from './types';

interface UseResultPanelCommandsOptions extends ResultPanelCommandDeps {
    keepFilterFocusRef: React.MutableRefObject<boolean>;
    containerRef: React.RefObject<HTMLDivElement>;
    resetEditState: () => void;
    hasColumns: boolean;
    openExportModal: () => void;
}

export function useResultPanelCommands({
    tabId,
    result,
    viewMode,
    hasPendingChanges,
    isSavingDraftRows,
    onSaveRequest,
    onRun,
    keepFilterFocusRef,
    containerRef,
    resetEditState,
    hasColumns,
    openExportModal,
}: UseResultPanelCommandsOptions) {
    const [pendingOpenExportModal, setPendingOpenExportModal] = React.useState(false);
    const focusTimerRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        return () => {
            if (focusTimerRef.current !== null) {
                window.clearTimeout(focusTimerRef.current);
                focusTimerRef.current = null;
            }
        };
    }, []);

    const prevIsDone = React.useRef(result?.isDone);
    React.useEffect(() => {
        if (!result) return;
        if (prevIsDone.current !== result.isDone) {
            if (!result.isDone) {
                resetEditState();
                if (!keepFilterFocusRef.current) {
                    if (focusTimerRef.current !== null) {
                        window.clearTimeout(focusTimerRef.current);
                    }
                    focusTimerRef.current = window.setTimeout(() => {
                        focusTimerRef.current = null;
                        // Skip stealing focus if the run was triggered from
                        // the SQL editor (Ctrl+Enter / Run button) — it
                        // already refocused itself, and the user expects to
                        // keep typing there instead of jumping to the grid.
                        if (document.activeElement?.closest('.monaco-editor')) return;
                        containerRef.current?.focus({ preventScroll: true });
                    }, 50);
                }
            } else {
                keepFilterFocusRef.current = false;
            }
            prevIsDone.current = result.isDone;
        }
    }, [containerRef, keepFilterFocusRef, resetEditState, result]);

    useTabScopedCommand(DOM_EVENT.SAVE_TAB_ACTION, tabId, () => {
        if (viewMode || !hasPendingChanges || isSavingDraftRows) return;
        void onSaveRequest();
    });

    // Lets a host (e.g. a table tab's F5 / header Reload) trigger the panel's own
    // reload so filter/order handling stays in one place.
    useTabScopedCommand(DOM_EVENT.RELOAD_RESULT, tabId, () => {
        onRun?.();
    });

    useTabScopedCommand(DOM_EVENT.OPEN_RESULT_EXPORT, tabId, () => {
        if (hasColumns) {
            openExportModal();
            return;
        }
        setPendingOpenExportModal(true);
        onRun?.();
    });

    React.useEffect(() => {
        if (!pendingOpenExportModal) return;
        if (!hasColumns) return;
        openExportModal();
        setPendingOpenExportModal(false);
    }, [hasColumns, openExportModal, pendingOpenExportModal]);
}
