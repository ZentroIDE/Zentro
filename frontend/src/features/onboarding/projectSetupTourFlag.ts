// SPDX-License-Identifier: GPL-3.0-only

export const PROJECT_SETUP_TOUR_COMPLETED_KEY = 'zentro:project-setup-tour-completed-v1';

export function hasCompletedProjectSetupTour(): boolean {
    return localStorage.getItem(PROJECT_SETUP_TOUR_COMPLETED_KEY) === 'true';
}

export function markProjectSetupTourCompleted(): void {
    localStorage.setItem(PROJECT_SETUP_TOUR_COMPLETED_KEY, 'true');
}
