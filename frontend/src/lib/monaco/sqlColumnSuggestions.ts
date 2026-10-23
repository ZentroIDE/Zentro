// SPDX-License-Identifier: GPL-3.0-only

// "Did you mean" ranking for a column name that does not exist.

const MAX_SUGGESTIONS = 3;
const MAX_DISTANCE_CAP = 3;
const DISTANCE_RATIO = 0.34;
// A single letter would "prefix-match" half the table.
const MIN_PARTIAL_LENGTH = 2;
// Once the closest match is known, names much further away are just noise.
const DISTANCE_SLACK_OVER_BEST = 1;

/** Case, spaces and punctuation are noise: "First Name" ~ "first_name" ~ "FirstName". */
function toComparableKey(name: string): string {
    return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Optimal string alignment distance: insert, delete, substitute, swap neighbours. */
function editDistance(left: string, right: string): number {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const table: number[][] = Array.from({ length: rows }, (_, row) => [
        row,
        ...new Array<number>(cols - 1).fill(0),
    ]);
    for (let col = 0; col < cols; col++) table[0][col] = col;

    for (let row = 1; row < rows; row++) {
        for (let col = 1; col < cols; col++) {
            const cost = left[row - 1] === right[col - 1] ? 0 : 1;
            table[row][col] = Math.min(
                table[row - 1][col] + 1,
                table[row][col - 1] + 1,
                table[row - 1][col - 1] + cost,
            );
            const swapped =
                row > 1 &&
                col > 1 &&
                left[row - 1] === right[col - 2] &&
                left[row - 2] === right[col - 1];
            if (swapped) table[row][col] = Math.min(table[row][col], table[row - 2][col - 2] + 1);
        }
    }
    return table[rows - 1][cols - 1];
}

function maxAllowedDistance(key: string): number {
    return Math.min(MAX_DISTANCE_CAP, Math.max(1, Math.floor(key.length * DISTANCE_RATIO)));
}

export type ColumnSuggestionMatch = 'similar' | 'prefix' | 'contains';

export interface ColumnSuggestion {
    name: string;
    /** Why it was suggested: a likely typo, or the typed text starts / appears in it. */
    match: ColumnSuggestionMatch;
}

interface ComparableColumn {
    name: string;
    key: string;
}

/** Columns a typo of `key` could have been meant for, closest first. */
function findSimilarColumns(key: string, columns: ComparableColumn[]): ComparableColumn[] {
    const limit = maxAllowedDistance(key);
    const close = columns
        .map(column => ({ column, distance: editDistance(key, column.key) }))
        .filter(entry => entry.distance <= limit);
    const bestDistance = Math.min(...close.map(entry => entry.distance));

    return close
        .filter(entry => entry.distance <= bestDistance + DISTANCE_SLACK_OVER_BEST)
        .sort(
            (left, right) =>
                left.distance - right.distance ||
                Math.abs(left.column.key.length - key.length) -
                    Math.abs(right.column.key.length - key.length) ||
                left.column.name.localeCompare(right.column.name),
        )
        .map(entry => entry.column);
}

/**
 * Up to three existing columns that the unknown name may stand for, best
 * first: likely typos, then names starting with what was typed ("shi" ->
 * "ship_city"), then names containing it. `candidates` order is kept within
 * the prefix and contains groups, so table definition order shows through.
 * Returns nothing rather than a far-fetched guess.
 */
export function suggestColumnNames(unknownName: string, candidates: string[]): ColumnSuggestion[] {
    const key = toComparableKey(unknownName);
    if (!key) return [];
    const columns = [...new Set(candidates)]
        .map(name => ({ name, key: toComparableKey(name) }))
        .filter(column => column.key.length > 0);

    const partial = key.length >= MIN_PARTIAL_LENGTH;
    const ranked: ColumnSuggestion[] = [
        ...findSimilarColumns(key, columns).map(column => ({
            name: column.name,
            match: 'similar' as const,
        })),
        ...columns
            .filter(column => partial && column.key.startsWith(key))
            .map(column => ({ name: column.name, match: 'prefix' as const })),
        ...columns
            .filter(column => partial && !column.key.startsWith(key) && column.key.includes(key))
            .map(column => ({ name: column.name, match: 'contains' as const })),
    ];

    const seen = new Set<string>();
    return ranked
        .filter(suggestion => !seen.has(suggestion.name) && seen.add(suggestion.name))
        .slice(0, MAX_SUGGESTIONS);
}
