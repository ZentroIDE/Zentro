// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { useEditorStore } from '../../stores/editorStore';
import { selectRunningJobCount, useActivityStore } from '../../stores/activityStore';
import { forceQuitWithAutosave } from './forceQuitWithAutosave';

export function useBeforeCloseGuard(onRequireConfirm: () => void) {
    useEffect(() => {
        const off = EventsOn('app:before-close', () => {
            // A running editor tab (query mid-stream) and a running
            // Activity-panel job (export/import, or a query job whose tab
            // state hasn't caught up yet) are two different signals for the
            // same thing — closing now would kill it. Force-quit tears down
            // the whole process (see App.ForceQuit/Shutdown in app.go), so
            // either one alone is reason enough to ask first.
            const tabRunning = useEditorStore
                .getState()
                .groups.some(g => g.tabs.some(t => t.isRunning));
            const jobRunning = selectRunningJobCount(useActivityStore.getState()) > 0;
            if (!tabRunning && !jobRunning) {
                forceQuitWithAutosave().catch(() => {});
                return;
            }
            onRequireConfirm();
        });
        return () => {
            if (typeof off === 'function') off();
        };
    }, [onRequireConfirm]);
}
