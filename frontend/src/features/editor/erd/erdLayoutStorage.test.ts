// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildErdLayoutKey,
    clearErdLayout,
    loadErdLayout,
    saveErdLayout,
} from './erdLayoutStorage';

const scope = { connectionID: 'c1', dbName: 'app', schema: 'public', table: 'orders' };

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('erdLayoutStorage', () => {
    it('builds a key scoped to connection, database, schema and table', () => {
        const key = buildErdLayoutKey(scope);
        expect(key).toContain('zentro:erd-layout-v1');
        expect(key).not.toBe(buildErdLayoutKey({ ...scope, table: 'customers' }));
        expect(key).not.toBe(buildErdLayoutKey({ ...scope, schema: 'other' }));
    });

    it('round-trips positions', () => {
        const key = buildErdLayoutKey(scope);
        saveErdLayout(key, { orders: { x: 1, y: 2 } });
        expect(loadErdLayout(key)).toEqual({ orders: { x: 1, y: 2 } });
    });

    it('clears a saved layout', () => {
        const key = buildErdLayoutKey(scope);
        saveErdLayout(key, { orders: { x: 1, y: 2 } });
        clearErdLayout(key);
        expect(loadErdLayout(key)).toBeNull();
    });

    it('returns null for missing, corrupt or malformed data', () => {
        const key = buildErdLayoutKey(scope);
        expect(loadErdLayout(key)).toBeNull();
        localStorage.setItem(key, '{not json');
        expect(loadErdLayout(key)).toBeNull();
        localStorage.setItem(key, JSON.stringify({ positions: 'nope' }));
        expect(loadErdLayout(key)).toBeNull();
    });

    it('drops invalid points but keeps valid ones', () => {
        const key = buildErdLayoutKey(scope);
        localStorage.setItem(
            key,
            JSON.stringify({ positions: { ok: { x: 1, y: 2 }, bad: { x: 'a', y: 2 } } }),
        );
        expect(loadErdLayout(key)).toEqual({ ok: { x: 1, y: 2 } });
    });

    it('never throws when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const key = buildErdLayoutKey(scope);
        expect(loadErdLayout(key)).toBeNull();
        expect(() => saveErdLayout(key, { a: { x: 0, y: 0 } })).not.toThrow();
        expect(() => clearErdLayout(key)).not.toThrow();
    });
});
