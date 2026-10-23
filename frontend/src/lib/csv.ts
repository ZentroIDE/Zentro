// SPDX-License-Identifier: GPL-3.0-only

/**
 * RFC 4180 CSV helpers. Pure; no React or DOM dependencies.
 */

/**
 * Escape a single CSV field. Wraps the value in double quotes when it contains
 * a comma, newline, or double quote; doubles any embedded quotes per RFC 4180.
 */
export function escapeCsvField(value: string): string {
    const escaped = value.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

/**
 * Serialise a 2D string matrix to CSV. Treats nullish cells as empty strings.
 * Rows joined with `\n`; cells joined with `,` after per-cell escaping.
 */
export function matrixToCsv(rows: string[][]): string {
    return rows.map(row => row.map(cell => escapeCsvField(cell ?? '')).join(',')).join('\n');
}
