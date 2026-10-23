// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { isKeptResultKey, nextKeptResultKey, resultKeysForTab, sortResultKeys } from './resultKeys';

describe('isKeptResultKey', () => {
    it('recognises kept results and nothing else', () => {
        expect(isKeptResultKey('tab-1::result:kept-1')).toBe(true);
        expect(isKeptResultKey('tab-1::result:2')).toBe(false);
        expect(isKeptResultKey('tab-1')).toBe(false);
        expect(isKeptResultKey('tab-1::explain:plan')).toBe(false);
    });
});

describe('nextKeptResultKey', () => {
    it('starts at 1', () => {
        expect(nextKeptResultKey('tab-1', ['tab-1', 'tab-1::result:2'])).toBe(
            'tab-1::result:kept-1',
        );
    });

    it('continues after the highest existing number, not the count', () => {
        expect(nextKeptResultKey('tab-1', ['tab-1::result:kept-1', 'tab-1::result:kept-4'])).toBe(
            'tab-1::result:kept-5',
        );
    });

    it('ignores other tabs', () => {
        expect(nextKeptResultKey('tab-1', ['tab-2::result:kept-9'])).toBe('tab-1::result:kept-1');
    });

    it('does not mistake a tab whose id extends this one for it', () => {
        expect(nextKeptResultKey('tab-1', ['tab-10::result:kept-3'])).toBe('tab-1::result:kept-1');
    });
});

describe('resultKeysForTab', () => {
    it('gathers the main, script and kept results but not explain results or other tabs', () => {
        expect(
            resultKeysForTab('tab-1', [
                'tab-1',
                'tab-1::result:2',
                'tab-1::result:kept-1',
                'tab-1::explain:plan',
                'tab-10',
                'tab-10::result:2',
                'tab-2',
            ]),
        ).toEqual(['tab-1', 'tab-1::result:2', 'tab-1::result:kept-1']);
    });
});

describe('sortResultKeys', () => {
    it('puts the main result first and compares numbers numerically', () => {
        expect(sortResultKeys('t', ['t::result:10', 't::result:2', 't', 't::result:3'])).toEqual([
            't',
            't::result:2',
            't::result:3',
            't::result:10',
        ]);
    });

    it('lists kept results after the script results, oldest first', () => {
        expect(
            sortResultKeys('t', [
                't::result:kept-2',
                't::result:2',
                't::result:kept-10',
                't',
                't::result:kept-1',
            ]),
        ).toEqual([
            't',
            't::result:2',
            't::result:kept-1',
            't::result:kept-2',
            't::result:kept-10',
        ]);
    });
});
