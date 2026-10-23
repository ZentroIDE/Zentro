// SPDX-License-Identifier: GPL-3.0-only

export const CONNECTION_FORM_TOUR_COMPLETED_KEY = 'zentro:connection-form-tour-completed-v1';

export function hasCompletedConnectionFormTour(): boolean {
    return localStorage.getItem(CONNECTION_FORM_TOUR_COMPLETED_KEY) === 'true';
}

export function markConnectionFormTourCompleted(): void {
    localStorage.setItem(CONNECTION_FORM_TOUR_COMPLETED_KEY, 'true');
}
