// SPDX-License-Identifier: GPL-3.0-only

export type DisplayableCellValue = string | number | boolean | null | undefined;

function isNumericLikeType(dataType?: string): boolean {
    if (!dataType) return false;
    return /(int|decimal|numeric|float|real|double|money|smallmoney|serial|number)/i.test(dataType);
}

const TEMPORAL_TZ_SUFFIX_RE =
    /^(.*\d{2}:\d{2}:\d{2}(?:\.\d+)?)(\s+(?:[+-]\d{2}:?\d{2}|[+-]\d{2}|Z))$/;

/**
 * Splits a rendered timestamp into its wall-clock part and its trailing
 * timezone offset so the grid can show the offset de-emphasized (matching
 * DataGrip / DBeaver). Returns `tz: ''` when there is no offset to peel off.
 */
export function splitTemporalDisplay(display: string): { main: string; tz: string } {
    const match = display.match(TEMPORAL_TZ_SUFFIX_RE);
    if (!match) return { main: display, tz: '' };
    return { main: match[1], tz: match[2].trim() };
}

export function isNullValue(value: DisplayableCellValue): boolean {
    return value === null || value === undefined;
}

export function formatCellDisplayValue(
    value: DisplayableCellValue,
    options?: { dataType?: string },
): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && isNumericLikeType(options?.dataType)) {
        return value.toLocaleString('en-US', {
            useGrouping: false,
            maximumFractionDigits: 20,
        });
    }
    return String(value);
}
