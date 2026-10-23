// SPDX-License-Identifier: GPL-3.0-only

export const ONBOARDING_TOUR_COMPLETED_KEY = 'zentro:onboarding-tour-completed-v1';

export function hasCompletedOnboardingTour(): boolean {
    return localStorage.getItem(ONBOARDING_TOUR_COMPLETED_KEY) === 'true';
}

export function markOnboardingTourCompleted(): void {
    localStorage.setItem(ONBOARDING_TOUR_COMPLETED_KEY, 'true');
}

export function clearOnboardingTourCompleted(): void {
    localStorage.removeItem(ONBOARDING_TOUR_COMPLETED_KEY);
}
