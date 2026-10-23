// SPDX-License-Identifier: GPL-3.0-only

export interface Tip {
    id: string;
    title: string;
    body: string;
}

export const TIPS: Tip[] = [
    {
        id: 'database-explorer',
        title: 'Browse your schema from the sidebar',
        body: 'The Database Explorer on the left lists every schema, table, and view for the active connection. Use the filter box to jump straight to an object by name.',
    },
    {
        id: 'run-query',
        title: 'Run a query with Ctrl+Enter',
        body: 'Place your cursor in a statement and press Ctrl+Enter (Cmd+Enter on macOS) to run just that statement, without selecting the text first.',
    },
    {
        id: 'result-grid-export',
        title: 'Copy or export results in one click',
        body: 'The result grid toolbar lets you copy selected cells, copy a full row from the index column, or export the result set — no need to reformat manually.',
    },
    {
        id: 'multiple-connections',
        title: 'Manage all your connections in one place',
        body: 'Open Settings → Connections to add, edit, or remove database connections at any time — not just during project setup.',
    },
    {
        id: 'tabs',
        title: 'Split and reorder query tabs',
        body: 'Drag a tab to reorder it, or use the split action to compare two queries side by side in the same window.',
    },
    {
        id: 'write-safety',
        title: 'Write-safety guards mutating statements',
        body: 'Zentro flags risky INSERT/UPDATE/DELETE statements before they run in a production-tinted environment, so a typo does not become an incident.',
    },
    {
        id: 'schema-diff',
        title: 'Compare schemas across environments',
        body: 'Use the Schema Diff tab to see exactly what changed between two environments before promoting a migration.',
    },
    {
        id: 'git-tracking',
        title: 'Track schema changes with source control',
        body: 'Settings → Source Control lets Zentro track schema changes over time, so you can see what changed and when.',
    },
];

/** Deterministic index into `TIPS` for a given date, so everyone sees the same "tip of the day". */
export function todayTipIndex(date: Date = new Date()): number {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const dayOfYear = Math.floor((now - start) / 86_400_000);
    return dayOfYear % TIPS.length;
}
