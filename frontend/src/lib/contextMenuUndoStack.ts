// SPDX-License-Identifier: GPL-3.0-only

/**
 * Generic bounded undo stack. Each entry pairs a human label (shown in the
 * "Undo last action" menu) with a snapshot the caller can use to restore
 * state. Cap defaults to 20 to bound memory; callers can pick their own.
 *
 * The stack is push-only via {@link pushUndoEntry}; consumers slice the last
 * entry off with {@link popUndoEntry}. Both helpers return a new array so the
 * caller can stash the result in a ref + bump a render counter.
 */

export const DEFAULT_UNDO_STACK_CAP = 20;

export interface UndoEntry<TSnapshot> {
    label: string;
    snapshot: TSnapshot;
}

/**
 * Append `entry` to `stack`; trim from the front when the result exceeds
 * `cap`. Pure — does not mutate `stack`.
 */
export function pushUndoEntry<TSnapshot>(
    stack: ReadonlyArray<UndoEntry<TSnapshot>>,
    entry: UndoEntry<TSnapshot>,
    cap: number = DEFAULT_UNDO_STACK_CAP,
): UndoEntry<TSnapshot>[] {
    return [...stack, entry].slice(-cap);
}

/**
 * Pop the last entry. Returns the popped entry and the remaining stack; if
 * empty returns `{ popped: null, stack: [] }`.
 */
export function popUndoEntry<TSnapshot>(stack: ReadonlyArray<UndoEntry<TSnapshot>>): {
    popped: UndoEntry<TSnapshot> | null;
    stack: UndoEntry<TSnapshot>[];
} {
    if (stack.length === 0) return { popped: null, stack: [] };
    const popped = stack[stack.length - 1];
    return { popped, stack: stack.slice(0, -1) };
}
