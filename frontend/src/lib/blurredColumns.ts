// SPDX-License-Identifier: GPL-3.0-only

/** Shown instead of a real value wherever a blurred column would otherwise leak as text (tooltips, JSON views). */
export const BLURRED_PLACEHOLDER = '••••••';

/** Toast shown when a copy action is refused because the selection includes a blurred column. */
export const BLURRED_COPY_MESSAGE = 'Selection contains blurred columns. Unblur to copy.';

/** Toast shown when a paste / Set NULL left blurred cells untouched. */
export const blurredEditSkippedMessage = (count: number) =>
    `Skipped ${count} blurred cell${count === 1 ? '' : 's'}. Unblur the column to edit.`;

/**
 * Names of columns that must stay out of an export while blur is on. Blur is tracked by column
 * index but exports select columns by name, so a name is treated as blurred when ANY column
 * carrying it is blurred (fail-closed for duplicate names produced by joins).
 */
export function getBlurredColumnNames(
    columns: readonly string[],
    blurredColumnIndexes: ReadonlySet<number> | undefined,
): Set<string> {
    const names = new Set<string>();
    if (!blurredColumnIndexes || blurredColumnIndexes.size === 0) return names;
    columns.forEach((column, index) => {
        if (blurredColumnIndexes.has(index)) names.add(column);
    });
    return names;
}
