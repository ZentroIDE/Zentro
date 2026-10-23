// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { requestRunWhenReady, takePendingRun } from './pendingRun';

describe('pendingRun', () => {
    it('hands a run request to the tab once', () => {
        requestRunWhenReady('tab-1');
        expect(takePendingRun('tab-2')).toBe(false);
        expect(takePendingRun('tab-1')).toBe(true);
        expect(takePendingRun('tab-1')).toBe(false);
    });
});
