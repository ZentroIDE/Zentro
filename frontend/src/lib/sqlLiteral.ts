// SPDX-License-Identifier: GPL-3.0-only

import { DRIVER } from './constants';
import { getDriverCapabilities } from './driverCapabilities';

/**
 * Single source of truth for turning an edited grid cell (always a string in
 * the UI) into a SQL literal for the target provider. Used by both the
 * executed save path (`dataEditing.toSqlLiteral`) and the clipboard
 * "Copy as INSERT/UPDATE" helpers (`resultSelectionActions`).
 *
 * The rules that actually differ per provider:
 *  - booleans: Postgres wants the `TRUE`/`FALSE` keywords; MySQL, SQL Server
 *    (`bit`) and SQLite want `1`/`0`. Emitting `0` for a Postgres `boolean`
 *    column fails with `42804` (integer vs boolean).
 *  - everything else is portable once quoted/normalized.
 */

export interface SqlLiteralColumn {
    /** Raw/base data type name, e.g. "boolean", "int4", "timestamptz". */
    dataType?: string;
    isNullable?: boolean;
}

export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Quoted string literal for `driver`. On top of doubling `'`:
 *  - MySQL treats a backslash as an escape character inside strings, so
 *    `C:\temp` would silently become `C:<TAB>emp` unless it is doubled.
 *  - SQL Server reads a bare `'...'` as varchar, which turns characters
 *    outside the database code page (e.g. Vietnamese diacritics) into `?`
 *    even when the target column is nvarchar; the `N` prefix keeps them.
 */
export function quoteSqlString(value: string, driver?: string, dataType?: string): string {
    const normalizedDriver = (driver || '').trim().toLowerCase();
    if (normalizedDriver === DRIVER.MYSQL) {
        return `'${escapeSqlString(value.split('\\').join('\\\\'))}'`;
    }
    const isUnicodeText = /\bn(var)?char|\bntext\b/i.test(dataType || '');
    if (normalizedDriver === DRIVER.SQLSERVER && (isUnicodeText || /[^\x00-\x7F]/.test(value))) {
        return `N'${escapeSqlString(value)}'`;
    }
    return `'${escapeSqlString(value)}'`;
}

export function isNumericLikeType(dataType?: string): boolean {
    if (!dataType) return false;
    return /(int|decimal|numeric|float|real|double|money|smallmoney|serial)/i.test(dataType);
}

export function isBooleanLikeType(dataType?: string): boolean {
    if (!dataType) return false;
    // `tinyint(1)` is MySQL's boolean convention; plain `tinyint` stays numeric.
    return /\b(bool|boolean|bit)\b/i.test(dataType) || /tinyint\(1\)/i.test(dataType);
}

export function isDateOnlyType(dataType?: string): boolean {
    if (!dataType) return false;
    return /\bdate\b/i.test(dataType) && !/time/i.test(dataType);
}

export function isTemporalLikeType(dataType?: string): boolean {
    if (!dataType) return false;
    return /(datetime|timestamp|timestamptz|datetime2|smalldatetime|datetimeoffset|\bdate\b|\btime\b)/i.test(
        dataType,
    );
}

export function isTimezoneAwareType(dataType?: string): boolean {
    if (!dataType) return false;
    return /(timestamptz|datetimeoffset|timestamp with time zone|time with time zone)/i.test(
        dataType,
    );
}

const TRUE_TOKENS = new Set(['1', 'true', 't', 'yes', 'y', 'on']);
const FALSE_TOKENS = new Set(['0', 'false', 'f', 'no', 'n', 'off']);

/** Parses a user-entered boolean cell. Returns null when it isn't recognizable. */
export function parseBooleanInput(value: string): boolean | null {
    const normalized = value.trim().toLowerCase();
    if (TRUE_TOKENS.has(normalized)) return true;
    if (FALSE_TOKENS.has(normalized)) return false;
    return null;
}

export function booleanLiteral(value: boolean, driver: string | undefined): string {
    if (getDriverCapabilities(driver).booleanLiteralStyle === 'keyword') {
        return value ? 'TRUE' : 'FALSE';
    }
    return value ? '1' : '0';
}

function normalizeTimezoneOffset(offset: string): string {
    const normalized = offset.trim().toUpperCase();
    if (normalized === 'Z') return '+00:00';
    if (/^[+-]\d{2}$/.test(normalized)) {
        return `${normalized}:00`;
    }
    if (/^[+-]\d{4}$/.test(normalized)) {
        return `${normalized.slice(0, 3)}:${normalized.slice(3)}`;
    }
    return normalized;
}

export function normalizeTemporalValue(value: string, dataType?: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    const datetimeMatch = trimmed.match(
        /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?/i,
    );
    if (datetimeMatch) {
        if (isDateOnlyType(dataType)) {
            return datetimeMatch[1];
        }
        const [, datePart, timePart, offsetPart] = datetimeMatch;
        let normalized = `${datePart} ${timePart}`;
        if (offsetPart && isTimezoneAwareType(dataType)) {
            normalized += ` ${normalizeTimezoneOffset(offsetPart)}`;
        }
        return normalized;
    }

    const timeMatch = trimmed.match(
        /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?/i,
    );
    if (timeMatch) {
        const [, timePart, offsetPart] = timeMatch;
        let normalized = timePart;
        if (offsetPart && isTimezoneAwareType(dataType)) {
            normalized += ` ${normalizeTimezoneOffset(offsetPart)}`;
        }
        return normalized;
    }

    const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        return dateMatch[1];
    }

    return trimmed;
}

const PLAIN_NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * Formats one edited cell value as a SQL literal for `driver`.
 *
 * Without column metadata every value is emitted as a quoted string (the
 * safe default). With metadata:
 *  - empty + nullable  -> NULL
 *  - boolean-like      -> provider-correct boolean literal
 *  - numeric-like      -> bare numeric literal (only for a clean number)
 *  - temporal-like     -> quoted, timezone-normalized string
 *  - otherwise         -> quoted, escaped string
 */
export function formatSqlLiteral(
    value: string,
    column?: SqlLiteralColumn,
    driver?: string,
): string {
    if (!column) {
        return quoteSqlString(value, driver);
    }

    if (value.trim() === '' && column.isNullable) {
        return 'NULL';
    }

    if (isBooleanLikeType(column.dataType)) {
        const parsed = parseBooleanInput(value);
        if (parsed !== null) {
            return booleanLiteral(parsed, driver);
        }
    }

    if (isNumericLikeType(column.dataType) && PLAIN_NUMBER_RE.test(value.trim())) {
        return value.trim();
    }

    if (isTemporalLikeType(column.dataType)) {
        return `'${escapeSqlString(normalizeTemporalValue(value, column.dataType))}'`;
    }

    return quoteSqlString(value, driver, column.dataType);
}
