// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import type { Driver } from 'driver.js';
import { CONNECTION_FORM_TOUR_STEPS } from './connectionFormTourSteps';
import {
    hasCompletedConnectionFormTour,
    markConnectionFormTourCompleted,
} from './connectionFormTourFlag';
import './driverOverrides.css';

// Kept separate from the other two onboarding tours on purpose: this one
// walks the connection create form (provider picker, connection details,
// test), which can open from several places (first-run project wizard,
// Settings → Connections) — its own screen, its own "seen it" flag, its own
// driver.js instance.
let activeDriver: Driver | null = null;
// Set synchronously, before the first `await` below — see useOnboardingTour.ts
// for why `activeDriver` alone can't guard against React StrictMode's
// double-invoked effects in dev.
let isStarting = false;

async function runConnectionFormTour(): Promise<void> {
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
                markConnectionFormTourCompleted();
            },
        });
        activeDriver.setSteps(CONNECTION_FORM_TOUR_STEPS);
        activeDriver.drive();
    } finally {
        isStarting = false;
    }
}

interface UseConnectionFormTourOptions {
    /** True while a *new* connection is being created (not editing an existing one). */
    enabled: boolean;
}

export function useConnectionFormTour({ enabled }: UseConnectionFormTourOptions): void {
    useEffect(() => {
        if (!enabled) return;
        if (hasCompletedConnectionFormTour()) return;
        void runConnectionFormTour();
    }, [enabled]);
}
