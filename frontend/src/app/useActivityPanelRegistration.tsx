// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { Activity } from 'lucide-react';
import { registerBottomPanel } from '../features/editor';
import { selectRunningJobCount, useActivityStore } from '../stores/activityStore';
import { ActivityPanel } from '../features/activity';

// Registers the Activity bottom panel (features/activity) into the editor
// feature's bottom-panel registry (features/editor/resultPanel). This lives
// in app/, not in either feature, specifically so it can import from both
// without tripping the cross-feature-import boundary check (which only
// scans files under features/*) — features/activity itself never imports
// from features/editor.
let registered = false;

export function useActivityPanelRegistration(): void {
    useEffect(() => {
        if (registered) return;
        registerBottomPanel({
            id: 'activity',
            label: 'Activity',
            title: 'Activity (Ctrl+Shift+Y)',
            icon: Activity,
            order: 50,
            render: () => <ActivityPanel />,
            getBadge: () => {
                const count = selectRunningJobCount(useActivityStore.getState());
                return count > 0 ? count : undefined;
            },
            commandId: 'layout.toggleActivityPanel',
        });
        registered = true;
    }, []);
}
