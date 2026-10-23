// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import type { Driver } from 'driver.js';
import { NO_PROJECT_TOUR_STEPS, ONBOARDING_TOUR_STEPS } from './tourSteps';
import { hasCompletedOnboardingTour, markOnboardingTourCompleted } from './onboardingTourFlag';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { useLayoutStore } from '../../stores/layoutStore';
import './driverOverrides.css';

let activeDriver: Driver | null = null;
// Set synchronously, before the first `await` below — `activeDriver` alone
// can't guard against a second call arriving while the first is still
// mid-import (e.g. React StrictMode's double-invoked effects in dev), since
// `activeDriver` stays null until that first call actually resolves. Without
// this, both calls create their own driver.js instance and overlay,
// producing two independent popovers stuck on different steps.
let isStarting = false;

// Two tour steps target elements that only exist in the DOM under specific
// layout/workspace state: the query-tabs step's anchor isn't mounted at all
// with zero tabs open (an empty-state placeholder renders instead), and the
// sidebar pane collapses to zero size when toggled off in an earlier session.
// Without this, driver.js would wait out `waitForElement` on a step that can
// never resolve, then silently skip it — which is exactly the "stuck, then
// jumps to a later step" bug this guards against. Forcing a known-good layout
// right before the tour starts makes every anchor's existence unconditional.
function ensureTourPreconditions(hasProject: boolean): void {
    const layout = useLayoutStore.getState();
    if (!layout.showSidebar) layout.setShowSidebar(true);

    // No project: Welcome is the anchor and tabs can't be created anyway.
    if (!hasProject) return;

    const editor = useEditorStore.getState();
    const isWorkspaceEmpty =
        editor.groups.length === 0 ||
        (editor.groups.length === 1 && editor.groups[0].tabs.length === 0);
    if (isWorkspaceEmpty) {
        editor.addTab();
    }
}

async function runOnboardingTour(): Promise<void> {
    if (activeDriver?.isActive() || isStarting) return;
    isStarting = true;
    try {
        const hasProject = Boolean(useProjectStore.getState().activeProject);
        ensureTourPreconditions(hasProject);

        const { driver } = await import('driver.js');
        await import('driver.js/dist/driver.css');

        activeDriver = driver({
            showProgress: true,
            allowClose: true,
            skipMissingElement: true,
            waitForElement: 1000,
            overlayOpacity: 0.6,
            onDestroyed: () => {
                markOnboardingTourCompleted();
            },
        });
        activeDriver.setSteps(hasProject ? ONBOARDING_TOUR_STEPS : NO_PROJECT_TOUR_STEPS);
        activeDriver.drive();
    } finally {
        isStarting = false;
    }
}

/** Bypasses the "already completed" gate — used by the manual "Restart tour" menu action. */
export function startOnboardingTour(): void {
    void runOnboardingTour();
}

interface UseOnboardingTourOptions {
    enabled: boolean;
}

export function useOnboardingTour({ enabled }: UseOnboardingTourOptions): void {
    useEffect(() => {
        if (!enabled) return;
        if (hasCompletedOnboardingTour()) return;
        void runOnboardingTour();
    }, [enabled]);
}
