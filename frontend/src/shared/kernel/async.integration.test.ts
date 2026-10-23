// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { runSafe, runServiceSafe } from './async';

describe('runServiceSafe (integration: kernel + store-like pattern)', () => {
    it('wraps a successful service call with ok result', async () => {
        const result = await runServiceSafe(
            'FETCH_DATA',
            'Failed to fetch data',
            async () => 'data',
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toBe('data');
        }
    });

    it('wraps a failed service call with structured error', async () => {
        const result = await runServiceSafe('FETCH_DATA', 'Failed to fetch data', async () => {
            throw new Error('connection refused');
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('FETCH_DATA');
            expect(result.error.message).toBe('Failed to fetch data');
        }
    });
});

describe('runSafe (integration: kernel + context propagation)', () => {
    it('includes context in the error payload', async () => {
        const result = await runSafe(
            'SAVE_SETTING',
            'Failed to save setting',
            async () => {
                throw new Error('disk full');
            },
            { tabId: 'tab-1', settingKey: 'theme' },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.context?.tabId).toBe('tab-1');
            expect(result.error.context?.settingKey).toBe('theme');
            expect(result.error.context?.cause).toBe('disk full');
        }
    });

    it('returns ok when runner succeeds', async () => {
        const fn = vi.fn().mockResolvedValue(42);
        const result = await runSafe('CALC', 'calc failed', fn);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toBe(42);
        }
        expect(fn).toHaveBeenCalledOnce();
    });
});
