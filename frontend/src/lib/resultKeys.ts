// SPDX-License-Identifier: GPL-3.0-only

/**
 * Result slots of a query tab are keyed `<tabId>` for the main result and
 * `<tabId>::result:<n>` for the extra statements of a script. A third kind is
 * a result that was set aside, together with its unsaved edits, so that the
 * next run could take the main slot: `<tabId>::result:kept-<n>`.
 *
 * It lives in the `::result:` namespace on purpose (the backend maps any such
 * id back to its tab), but the `kept-` marker keeps it from colliding with the
 * numbers a later multi-statement run hands out.
 */
export const KEPT_RESULT_INFIX = '::result:kept-';

export function isKeptResultKey(key: string): boolean {
    return key.includes(KEPT_RESULT_INFIX);
}

/** The next free kept-result key for a tab, given every result key currently in the store. */
export function nextKeptResultKey(sourceTabId: string, existingKeys: readonly string[]): string {
    const prefix = `${sourceTabId}${KEPT_RESULT_INFIX}`;
    let highest = 0;
    for (const key of existingKeys) {
        if (!key.startsWith(prefix)) continue;
        const n = Number(key.slice(prefix.length));
        if (Number.isInteger(n) && n > highest) highest = n;
    }
    return `${prefix}${highest + 1}`;
}

/** Every result key that belongs to a tab: the main one, its script results and any kept ones. */
export function resultKeysForTab(sourceTabId: string, keys: readonly string[]): string[] {
    return keys.filter(
        key =>
            (key === sourceTabId || key.startsWith(`${sourceTabId}::result:`)) &&
            !key.includes('::explain:'),
    );
}

/**
 * Display order of a tab's results: the main result first, then the rest with
 * numbers compared as numbers (so `result:10` follows `result:2`), and kept
 * results after the script's own, oldest first.
 */
export function sortResultKeys(sourceTabId: string, keys: readonly string[]): string[] {
    const rank = (key: string) => (key === sourceTabId ? 0 : isKeptResultKey(key) ? 2 : 1);
    return [...keys].sort(
        (left, right) =>
            rank(left) - rank(right) || left.localeCompare(right, undefined, { numeric: true }),
    );
}
