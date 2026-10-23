// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { AIChangeProposal } from '../../lib/aiAssistant';
import { checkLabel, checkStatusText, reviewWarnings } from './reviewSummary';

function proposal(overrides: Partial<AIChangeProposal> = {}): AIChangeProposal {
    return {
        id: 'a',
        state: 'pending',
        title: 't',
        rationale: '',
        env: 'dev',
        sql: '',
        sqlNormalized: '',
        createdAt: '',
        expiresAt: '',
        requiresTypedConfirm: false,
        cooldownSeconds: 0,
        verdict: 'allowed',
        statements: [],
        explanation: {
            summary: 's',
            affectedObjects: [],
            expectedEffect: 'e',
            risks: ['r'],
            irreversible: false,
            rollbackPlan: 'p',
        },
        checks: [],
        ...overrides,
    };
}

describe('reviewWarnings', () => {
    it('is empty when every check passes and the agent claims nothing', () => {
        expect(
            reviewWarnings(
                proposal({ checks: [{ name: 'where_clause', status: 'ok', detail: '' }] }),
            ),
        ).toEqual([]);
    });

    it('raises a system warning even when the agent says the change is safe', () => {
        const warnings = reviewWarnings(
            proposal({
                checks: [{ name: 'where_clause', status: 'warn', detail: 'No WHERE.' }],
            }),
        );
        expect(warnings).toEqual([{ id: 'check-where_clause', text: 'No WHERE.' }]);
    });

    it('surfaces the agent irreversible claim', () => {
        const base = proposal();
        const warnings = reviewWarnings(
            proposal({ explanation: { ...base.explanation!, irreversible: true } }),
        );
        expect(warnings.map(w => w.id)).toContain('agent-irreversible');
    });

    it('names the checks that could not run instead of hiding them', () => {
        const warnings = reviewWarnings(
            proposal({
                checks: [
                    { name: 'cascade', status: 'unavailable', detail: 'x' },
                    { name: 'row_count', status: 'unavailable', detail: 'y' },
                ],
            }),
        );
        expect(warnings).toEqual([
            {
                id: 'unchecked',
                text: '2 checks could not run: Foreign key effects, Rows affected.',
            },
        ]);
    });

    it('flags a proposal that has no explanation', () => {
        expect(reviewWarnings(proposal({ explanation: undefined })).map(w => w.id)).toEqual([
            'no-explanation',
        ]);
    });
});

describe('labels', () => {
    it('falls back to a readable name for an unknown check', () => {
        expect(checkLabel('new_check')).toBe('new check');
        expect(checkLabel('where_clause')).toBe('WHERE clause');
    });

    it('reads a failed check as not checked, not as ok', () => {
        expect(checkStatusText('unavailable')).toBe('Not checked');
        expect(checkStatusText('warn')).toBe('Check this');
    });
});
