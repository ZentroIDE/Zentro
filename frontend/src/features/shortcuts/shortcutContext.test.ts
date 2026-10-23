// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { buildShortcutWhenContext } from './shortcutContext';

describe('assistantFocus', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('is true only for a target inside the assistant panel', () => {
        document.body.innerHTML =
            '<div data-zone="assistant"><textarea id="in"></textarea></div><textarea id="out"></textarea>';
        expect(buildShortcutWhenContext(document.getElementById('in')).assistantFocus).toBe(true);
        expect(buildShortcutWhenContext(document.getElementById('out')).assistantFocus).toBe(false);
    });
});
