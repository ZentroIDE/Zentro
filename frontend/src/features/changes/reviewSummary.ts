// SPDX-License-Identifier: GPL-3.0-only

import type { AIChangeCheck, AIChangeCheckStatus, AIChangeProposal } from '../../lib/aiAssistant';

const CHECK_LABELS: Record<string, string> = {
    where_clause: 'WHERE clause',
    destructive: 'Destructive statement',
    row_count: 'Rows affected',
    cascade: 'Foreign key effects',
    migration_safety: 'Locks and rewrites',
};

export function checkLabel(name: string): string {
    return CHECK_LABELS[name] ?? name.replace(/_/g, ' ');
}

export function checkBadgeVariant(status: AIChangeCheckStatus): 'success' | 'warning' | 'muted' {
    if (status === 'ok') return 'success';
    if (status === 'warn') return 'warning';
    return 'muted';
}

export function checkStatusText(status: AIChangeCheckStatus): string {
    if (status === 'ok') return 'OK';
    if (status === 'warn') return 'Check this';
    return 'Not checked';
}

export type ReviewWarning = {
    id: string;
    text: string;
};

// reviewWarnings are the things a reviewer must not miss, drawn from both
// accounts. The agent's claim and Zentro's own measurement are kept apart, so a
// reassuring explanation never hides a warning the system raised.
export function reviewWarnings(proposal: AIChangeProposal): ReviewWarning[] {
    const out: ReviewWarning[] = [];
    if (proposal.explanation?.irreversible) {
        out.push({ id: 'agent-irreversible', text: 'The agent says this cannot be undone.' });
    }
    const checks: AIChangeCheck[] = proposal.checks ?? [];
    for (const check of checks) {
        if (check.status === 'warn') {
            out.push({ id: `check-${check.name}`, text: check.detail });
        }
    }
    const missing = checks.filter(check => check.status === 'unavailable');
    if (missing.length > 0) {
        out.push({
            id: 'unchecked',
            text: `${missing.length} check${missing.length === 1 ? '' : 's'} could not run: ${missing
                .map(check => checkLabel(check.name))
                .join(', ')}.`,
        });
    }
    if (!proposal.explanation) {
        out.push({
            id: 'no-explanation',
            text: 'This proposal has no explanation from the agent.',
        });
    }
    return out;
}
