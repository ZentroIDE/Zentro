// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { hasAcceptedPrivacyNotice, markPrivacyNoticeAccepted } from './privacyNotice';

describe('privacy notice acceptance', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to not accepted', () => {
        expect(hasAcceptedPrivacyNotice()).toBe(false);
    });

    it('persists acceptance', () => {
        markPrivacyNoticeAccepted();
        expect(hasAcceptedPrivacyNotice()).toBe(true);
    });
});
