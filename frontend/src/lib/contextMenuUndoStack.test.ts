// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { DEFAULT_UNDO_STACK_CAP, popUndoEntry, pushUndoEntry } from './contextMenuUndoStack';

describe('pushUndoEntry', () => {
    it('appends to an empty stack', () => {
        const next = pushUndoEntry<number>([], { label: 'a', snapshot: 1 });
        expect(next).toEqual([{ label: 'a', snapshot: 1 }]);
    });

    it('preserves the input stack (no mutation)', () => {
        const stack = [{ label: 'a', snapshot: 1 }];
        pushUndoEntry(stack, { label: 'b', snapshot: 2 });
        expect(stack).toEqual([{ label: 'a', snapshot: 1 }]);
    });

    it('caps the stack from the front when the result exceeds cap', () => {
        const start = Array.from({ length: 5 }, (_, i) => ({ label: `${i}`, snapshot: i }));
        const next = pushUndoEntry<number>(start, { label: 'new', snapshot: 99 }, 3);
        expect(next).toHaveLength(3);
        expect(next[0].label).toBe('3');
        expect(next[2].label).toBe('new');
    });

    it('uses the default cap when none is supplied', () => {
        const start = Array.from({ length: DEFAULT_UNDO_STACK_CAP }, (_, i) => ({
            label: `${i}`,
            snapshot: i,
        }));
        const next = pushUndoEntry<number>(start, { label: 'new', snapshot: 99 });
        expect(next).toHaveLength(DEFAULT_UNDO_STACK_CAP);
        expect(next[DEFAULT_UNDO_STACK_CAP - 1].label).toBe('new');
    });
});

describe('popUndoEntry', () => {
    it('returns popped=null and empty stack for empty input', () => {
        const result = popUndoEntry<number>([]);
        expect(result).toEqual({ popped: null, stack: [] });
    });

    it('pops the last entry and returns a new stack', () => {
        const start = [
            { label: 'a', snapshot: 1 },
            { label: 'b', snapshot: 2 },
        ];
        const result = popUndoEntry(start);
        expect(result.popped).toEqual({ label: 'b', snapshot: 2 });
        expect(result.stack).toEqual([{ label: 'a', snapshot: 1 }]);
        // input unchanged
        expect(start).toHaveLength(2);
    });
});
