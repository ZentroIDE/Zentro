// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { resolveSearchMode, SEARCH_MODES } from './registry';

describe('resolveSearchMode', () => {
    it('falls back to schema mode for plain queries', () => {
        const { mode, effectiveQuery } = resolveSearchMode('users');
        expect(mode.id).toBe('schema');
        expect(effectiveQuery).toBe('users');
    });

    it('resolves # to script mode and strips the prefix', () => {
        const { mode, effectiveQuery } = resolveSearchMode('# select');
        expect(mode.id).toBe('script');
        expect(effectiveQuery).toBe('select');
    });

    it('resolves > to command mode', () => {
        const { mode, effectiveQuery } = resolveSearchMode('>run query');
        expect(mode.id).toBe('command');
        expect(effectiveQuery).toBe('run query');
    });

    it('prefers @git over bare @ (longest prefix wins)', () => {
        const { mode, effectiveQuery } = resolveSearchMode('@git feature/x');
        expect(mode.id).toBe('git');
        expect(effectiveQuery).toBe('feature/x');
    });

    it('prefers @env over bare @', () => {
        expect(resolveSearchMode('@env prod').mode.id).toBe('env');
    });

    it('resolves bare @ to the scope directory', () => {
        expect(resolveSearchMode('@').mode.id).toBe('scope');
        expect(resolveSearchMode('@gi').mode.id).toBe('scope');
    });

    it('resolves : to go-to-line and ? to help', () => {
        expect(resolveSearchMode(':42').mode.id).toBe('goto-line');
        expect(resolveSearchMode('?').mode.id).toBe('help');
    });

    it('matches prefixes case-insensitively', () => {
        expect(resolveSearchMode('@GIT main').mode.id).toBe('git');
    });

    it('has exactly one fallback mode registered', () => {
        expect(SEARCH_MODES.filter(mode => mode.prefix === null)).toHaveLength(1);
    });
});
