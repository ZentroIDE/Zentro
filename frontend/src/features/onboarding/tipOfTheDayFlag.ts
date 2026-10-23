// SPDX-License-Identifier: GPL-3.0-only

export const SHOW_TIPS_ON_STARTUP_KEY = 'zentro:show-tips-on-startup';
export const LAST_TIP_SHOWN_DATE_KEY = 'zentro:last-tip-shown-date';

/** Defaults to shown (DBeaver-style) until the user unchecks it. */
export function shouldShowTipsOnStartup(): boolean {
    const raw = localStorage.getItem(SHOW_TIPS_ON_STARTUP_KEY);
    return raw === null ? true : raw === 'true';
}

export function setShowTipsOnStartup(enabled: boolean): void {
    localStorage.setItem(SHOW_TIPS_ON_STARTUP_KEY, String(enabled));
}

function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Gates the *automatic* startup popup to once per calendar day — reopening
 *  it manually from the Help menu is unaffected by this. */
export function hasShownTipToday(): boolean {
    return localStorage.getItem(LAST_TIP_SHOWN_DATE_KEY) === todayDateString();
}

export function markTipShownToday(): void {
    localStorage.setItem(LAST_TIP_SHOWN_DATE_KEY, todayDateString());
}
