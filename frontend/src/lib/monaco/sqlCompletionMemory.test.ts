// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    COMPLETION_MEMORY_MAX_ENTRIES,
    createEmptyCompletionMemory,
    normalizeCompletionMemory,
    recordCompletionAcceptance,
} from './sqlCompletionMemory';

describe('sqlCompletionMemory', () => {
    it('falls back to empty memory for unsupported versions', () => {
        expect(normalizeCompletionMemory({ version: 99, entries: [] })).toEqual(
            createEmptyCompletionMemory(),
        );
    });

    it('records acceptances by suggestion and context', () => {
        const first = recordCompletionAcceptance(createEmptyCompletionMemory(), {
            suggestionKey: 'users',
            suggestionKind: 'table',
            contextBucket: 'from|main|postgres|public|',
            acceptedAt: 100,
        });
        const second = recordCompletionAcceptance(first, {
            suggestionKey: 'users',
            suggestionKind: 'table',
            contextBucket: 'from|main|postgres|public|',
            acceptedAt: 200,
        });

        expect(second.entries).toEqual([
            expect.objectContaining({ acceptCount: 2, lastAcceptedAt: 200 }),
        ]);
    });

    it('evicts the least recently accepted entries', () => {
        let memory = createEmptyCompletionMemory();
        for (let index = 0; index <= COMPLETION_MEMORY_MAX_ENTRIES; index += 1) {
            memory = recordCompletionAcceptance(memory, {
                suggestionKey: `table_${index}`,
                suggestionKind: 'table',
                contextBucket: 'from|main|postgres|public|',
                acceptedAt: index,
            });
        }

        expect(memory.entries).toHaveLength(COMPLETION_MEMORY_MAX_ENTRIES);
        expect(memory.entries.some(entry => entry.suggestionKey === 'table_0')).toBe(false);
    });
});
