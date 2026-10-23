// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { formatTokenCount, sessionTokens, usageLine } from './aiTokens';

describe('aiTokens', () => {
    it('shortens large counts', () => {
        expect(formatTokenCount(980)).toBe('980');
        expect(formatTokenCount(1234)).toBe('1.2k');
        expect(formatTokenCount(45678)).toBe('46k');
    });

    it('describes a reply from provider usage', () => {
        expect(usageLine({ input: 1200, output: 300, cached: 900 })).toBe(
            'in 1.2k · out 300 · cached 900 (75%)',
        );
        expect(usageLine(undefined)).toBe('');
    });

    it('adds up saved replies in one chat', () => {
        expect(
            sessionTokens([{ usage: { input: 100, output: 20, cached: 0 } }, { usage: null }, {}]),
        ).toBe(120);
    });
});
