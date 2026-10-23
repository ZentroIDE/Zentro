// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { ThemePreset } from '../../../lib/theme/themePresetTypes';
import { LOG_TOKEN_RULES_DARK, LOG_TOKEN_RULES_LIGHT, buildLogTokenRules } from './logHighlight';

function makePreset(overrides: Partial<ThemePreset>): ThemePreset {
    return {
        id: 'test-preset',
        label: 'Test',
        appearance: 'dark',
        builtIn: true,
        tokens: {},
        monaco: { id: 'vs-dark' },
        ...overrides,
    };
}

describe('buildLogTokenRules', () => {
    it('keeps dark-2026 and light-2026 on the static curated palette, not derived from tokens', () => {
        const dark = makePreset({
            id: 'dark-2026',
            appearance: 'dark',
            tokens: {
                '--status-destructive': '#f14c4c',
                '--status-info': 'var(--interactive-primary)',
            },
        });
        const light = makePreset({
            id: 'light-2026',
            appearance: 'light',
            tokens: {
                '--status-destructive': '#cd3131',
                '--status-info': 'var(--interactive-primary)',
            },
        });

        expect(buildLogTokenRules(dark)).toEqual(LOG_TOKEN_RULES_DARK);
        expect(buildLogTokenRules(light)).toEqual(LOG_TOKEN_RULES_LIGHT);
    });

    it('derives a custom palette from a non-Zentro preset with literal status tokens', () => {
        const solarizedLike = makePreset({
            id: 'solarized-dark',
            appearance: 'dark',
            tokens: {
                '--status-destructive': '#dc322f',
                '--status-warning': '#b58900',
                '--status-success': '#859900',
                '--status-info': '#6c71c4',
                '--user-accent': '#268bd2',
                '--content-secondary': '#586e75',
                '--content-muted': '#586e75',
            },
        });

        const rules = buildLogTokenRules(solarizedLike);
        expect(rules).not.toEqual(LOG_TOKEN_RULES_DARK);
        expect(rules.find(r => r.token === 'log.fatal')?.foreground).toBe('dc322f');
        expect(rules.find(r => r.token === 'rt.schema')?.foreground).toBe('6c71c4');
    });

    it('never returns an unresolved var()/color-mix() value as a rule foreground', () => {
        const presetWithVarStatusInfo = makePreset({
            id: 'some-custom-preset',
            appearance: 'dark',
            tokens: {
                '--status-destructive': '#f14c4c',
                '--status-info': 'var(--interactive-primary)',
                '--user-accent': 'color-mix(in srgb, #268bd2 50%, transparent)',
            },
        });

        for (const rule of buildLogTokenRules(presetWithVarStatusInfo)) {
            expect(rule.foreground).not.toContain('var(');
            expect(rule.foreground).not.toContain('color-mix');
        }
    });
});
