// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import type { Driver } from 'driver.js';
import { PROJECT_SETUP_TOUR_STEPS } from './projectSetupTourSteps';
import {
    hasCompletedProjectSetupTour,
    markProjectSetupTourCompleted,
} from './projectSetupTourFlag';
import './driverOverrides.css';

// Kept separate from useOnboardingTour/ONBOARDING_TOUR_STEPS on purpose: this
// one walks the first-run project-creation dialog (Project Info + Environment
// Bindings), which exists before AppShell ever mounts, while the other one
// walks the main workspace toolbar/panels — two different screens, two
// independent "seen it" flags, two driver.js instances.
let activeDriver: Driver | null = null;
// Set synchronously, before the first `await` below — `activeDriver` alone
// can't guard against a second call arriving while the first is still
// mid-import (e.g. React StrictMode's double-invoked effects in dev), since
// `activeDriver` stays null until that first call actually resolves. Without
// this, both calls create their own driver.js instance and overlay,
// producing two independent popovers stuck on different steps.
let isStarting = false;

async function runProjectSetupTour(): Promise<void> {
    if (activeDriver?.isActive() || isStarting) return;
    isStarting = true;
    try {
        const { driver } = await import('driver.js');
        await import('driver.js/dist/driver.css');

        activeDriver = driver({
            showProgress: true,
            allowClose: true,
            skipMissingElement: true,
            waitForElement: 1000,
            overlayOpacity: 0.6,
            onDestroyed: () => {
                markProjectSetupTourCompleted();
            },
        });
        activeDriver.setSteps(PROJECT_SETUP_TOUR_STEPS);
        activeDriver.drive();
    } finally {
        isStarting = false;
    }
}

interface UseProjectSetupTourOptions {
    /** True while the create-project dialog (not edit) is open. */
    enabled: boolean;
}

export function useProjectSetupTour({ enabled }: UseProjectSetupTourOptions): void {
    useEffect(() => {
        if (!enabled) return;
        if (hasCompletedProjectSetupTour()) return;
        void runProjectSetupTour();
    }, [enabled]);
}
