// SPDX-License-Identifier: GPL-3.0-only

import type { AIUsage } from './aiAssistant';

// formatTokenCount shortens a count for the chat header: 980, 1.2k, 45k.
export function formatTokenCount(count: number): string {
    if (count < 1000) return String(count);
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
    return `${Math.round(count / 1000)}k`;
}

// usageLine describes one reply from the provider's own numbers.
export function usageLine(usage: AIUsage | undefined | null): string {
    if (!usage) return '';
    const parts = [`in ${formatTokenCount(usage.input)}`, `out ${formatTokenCount(usage.output)}`];
    // The cache share shows how much of the input the provider billed at its
    // lower cached rate, which a stable request prefix is meant to raise.
    if (usage.cached > 0) {
        const share = usage.input > 0 ? Math.round((usage.cached / usage.input) * 100) : 0;
        parts.push(`cached ${formatTokenCount(usage.cached)} (${share}%)`);
    }
    return parts.join(' · ');
}

// sessionTokens adds up the provider counts of saved replies in one chat.
export function sessionTokens(turns: { usage?: AIUsage | null }[]): number {
    return turns.reduce(
        (total, turn) => total + (turn.usage ? turn.usage.input + turn.usage.output : 0),
        0,
    );
}

// sessionUsageTotals sums the provider counts of every saved reply in a chat.
export function sessionUsageTotals(turns: { usage?: AIUsage | null }[]): AIUsage {
    return turns.reduce<AIUsage>(
        (total, turn) => ({
            input: total.input + (turn.usage?.input ?? 0),
            output: total.output + (turn.usage?.output ?? 0),
            cached: total.cached + (turn.usage?.cached ?? 0),
        }),
        { input: 0, output: 0, cached: 0 },
    );
}
