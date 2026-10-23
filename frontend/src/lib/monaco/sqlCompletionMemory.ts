// SPDX-License-Identifier: GPL-3.0-only

export const SQL_COMPLETION_MEMORY_VERSION = 1;
export const COMPLETION_MEMORY_MAX_ENTRIES = 500;

export type SqlCompletionSuggestionKind =
    | 'column'
    | 'table'
    | 'view'
    | 'keyword'
    | 'function'
    | 'operator'
    | 'snippet'
    | 'alias'
    | 'text';

export interface SqlCompletionMemoryEntry {
    suggestionKey: string;
    suggestionKind: SqlCompletionSuggestionKind;
    contextBucket: string;
    acceptCount: number;
    lastAcceptedAt: number;
}

export interface SqlCompletionMemory {
    version: typeof SQL_COMPLETION_MEMORY_VERSION;
    entries: SqlCompletionMemoryEntry[];
}

export interface SqlCompletionAcceptance {
    suggestionKey: string;
    suggestionKind: SqlCompletionSuggestionKind;
    contextBucket: string;
    acceptedAt?: number;
}

export function createEmptyCompletionMemory(): SqlCompletionMemory {
    return { version: SQL_COMPLETION_MEMORY_VERSION, entries: [] };
}

function isMemoryEntry(value: unknown): value is SqlCompletionMemoryEntry {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<SqlCompletionMemoryEntry>;
    return (
        typeof entry.suggestionKey === 'string' &&
        typeof entry.suggestionKind === 'string' &&
        typeof entry.contextBucket === 'string' &&
        typeof entry.acceptCount === 'number' &&
        Number.isFinite(entry.acceptCount) &&
        entry.acceptCount > 0 &&
        typeof entry.lastAcceptedAt === 'number' &&
        Number.isFinite(entry.lastAcceptedAt)
    );
}

export function normalizeCompletionMemory(value: unknown): SqlCompletionMemory {
    if (!value || typeof value !== 'object') return createEmptyCompletionMemory();
    const memory = value as { version?: unknown; entries?: unknown };
    if (memory.version !== SQL_COMPLETION_MEMORY_VERSION || !Array.isArray(memory.entries)) {
        return createEmptyCompletionMemory();
    }

    return {
        version: SQL_COMPLETION_MEMORY_VERSION,
        entries: memory.entries
            .filter(isMemoryEntry)
            .sort((a, b) => b.lastAcceptedAt - a.lastAcceptedAt)
            .slice(0, COMPLETION_MEMORY_MAX_ENTRIES),
    };
}

export function recordCompletionAcceptance(
    value: unknown,
    acceptance: SqlCompletionAcceptance,
): SqlCompletionMemory {
    const memory = normalizeCompletionMemory(value);
    const acceptedAt = acceptance.acceptedAt ?? Date.now();
    const index = memory.entries.findIndex(
        entry =>
            entry.suggestionKey === acceptance.suggestionKey &&
            entry.suggestionKind === acceptance.suggestionKind &&
            entry.contextBucket === acceptance.contextBucket,
    );
    const entries = memory.entries.slice();

    if (index >= 0) {
        const existing = entries[index];
        entries[index] = {
            ...existing,
            acceptCount: Math.min(existing.acceptCount + 1, Number.MAX_SAFE_INTEGER),
            lastAcceptedAt: acceptedAt,
        };
    } else {
        entries.push({
            suggestionKey: acceptance.suggestionKey,
            suggestionKind: acceptance.suggestionKind,
            contextBucket: acceptance.contextBucket,
            acceptCount: 1,
            lastAcceptedAt: acceptedAt,
        });
    }

    entries.sort((a, b) => b.lastAcceptedAt - a.lastAcceptedAt);
    return {
        version: SQL_COMPLETION_MEMORY_VERSION,
        entries: entries.slice(0, COMPLETION_MEMORY_MAX_ENTRIES),
    };
}

export function getCompletionMemoryBoost(
    memoryValue: unknown,
    acceptance: Omit<SqlCompletionAcceptance, 'acceptedAt'>,
): number {
    const entry = normalizeCompletionMemory(memoryValue).entries.find(
        candidate =>
            candidate.suggestionKey === acceptance.suggestionKey &&
            candidate.suggestionKind === acceptance.suggestionKind &&
            candidate.contextBucket === acceptance.contextBucket,
    );
    if (!entry) return 0;
    return Math.min(180, Math.round(30 + Math.log2(entry.acceptCount + 1) * 25));
}
