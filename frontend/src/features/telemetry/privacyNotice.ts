// SPDX-License-Identifier: GPL-3.0-only

import { STORAGE_KEY } from '../../lib/constants';

/** Whether the user has ever accepted the onboarding privacy notice - a
 *  one-time gate, not re-prompted on policy updates (see PrivacyNoticeDialog). */
export function hasAcceptedPrivacyNotice(): boolean {
    return localStorage.getItem(STORAGE_KEY.PRIVACY_NOTICE_ACCEPTED) === 'true';
}

export function markPrivacyNoticeAccepted(): void {
    localStorage.setItem(STORAGE_KEY.PRIVACY_NOTICE_ACCEPTED, 'true');
}
