// SPDX-License-Identifier: GPL-3.0-only

import { SchemaNode } from '../../stores/schemaStore';
import { DRIVER } from '../constants';
import { normalizeDriverKey, resolveSqlDriverFacade } from './sqlDriverFacade';
export { normalizeDriverKey };

export function normalizeIdentifier(value: string): string {
    return stripIdentifierQuotes(value).trim().toLowerCase();
}

export function stripIdentifierQuotes(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith('`') && trimmed.endsWith('`'))
    ) {
        return trimmed.slice(1, -1);
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

// Words that cannot stand as a bare column/table/alias name on at least one
// supported dialect. Kept deliberately to real reserved words — quoting soft
// keywords like NAME or STATUS would add brackets nobody needs.
const RESERVED_IDENTIFIERS = new Set([
    'add',
    'all',
    'alter',
    'and',
    'any',
    'as',
    'asc',
    'authorization',
    'between',
    'by',
    'case',
    'check',
    'column',
    'constraint',
    'create',
    'cross',
    'current_date',
    'current_time',
    'current_timestamp',
    'current_user',
    'database',
    'default',
    'delete',
    'desc',
    'distinct',
    'drop',
    'else',
    'end',
    'escape',
    'except',
    'exec',
    'exists',
    'false',
    'fetch',
    'for',
    'foreign',
    'from',
    'full',
    'grant',
    'group',
    'having',
    'identity',
    'in',
    'index',
    'inner',
    'insert',
    'intersect',
    'into',
    'is',
    'join',
    'key',
    'left',
    'like',
    'limit',
    'natural',
    'not',
    'null',
    'offset',
    'on',
    'or',
    'order',
    'outer',
    'primary',
    'references',
    'return',
    'returning',
    'right',
    'rownum',
    'select',
    'session_user',
    'set',
    'some',
    'table',
    'then',
    'to',
    'top',
    'true',
    'union',
    'unique',
    'update',
    'user',
    'using',
    'values',
    'view',
    'when',
    'where',
    'window',
    'with',
]);

export function isReservedIdentifier(identifier: string): boolean {
    return RESERVED_IDENTIFIERS.has(identifier.trim().toLowerCase());
}

function shouldQuoteIdentifier(identifier: string, driver: string): boolean {
    if (/[^a-zA-Z0-9_]/.test(identifier) || /^[0-9]/.test(identifier)) return true;
    if (isReservedIdentifier(identifier)) return true;
    // Postgres folds unquoted names to lower case, so a mixed-case name only
    // resolves back to itself when it is quoted.
    return (
        normalizeDriverKey(driver) === DRIVER.POSTGRES && identifier !== identifier.toLowerCase()
    );
}

export function quoteIdentifierForDriver(
    identifier: string,
    driver: string,
    forceQuote = false,
): string {
    const id = stripIdentifierQuotes(identifier);
    if (!id) return identifier;
    if (!forceQuote && !shouldQuoteIdentifier(id, driver)) return id;
    const facade = resolveSqlDriverFacade(driver);
    if (!facade) return `"${id.replace(/"/g, '""')}"`;
    return facade.quoteIdentifier(id);
}

const QUOTE_CLOSERS: Record<string, string> = { '[': ']', '"': '"', '`': '`' };

export interface ColumnRange {
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
}

/**
 * Monaco's word range stops at `[`, `"` and backtick, so accepting a quoted
 * suggestion ("[Phone No_]") while the user is already inside a quote would
 * produce "[[Phone No_]]". Returns a range widened over the surrounding
 * quote characters, or undefined when the cursor is not inside an open quote.
 */
export function resolveQuotedIdentifier(
    lineText: string,
    range: ColumnRange,
    cursorColumn: number,
): { range: ColumnRange; opener: string } | undefined {
    const before = lineText.slice(0, Math.max(0, cursorColumn - 1));
    let openIndex = -1;
    const bracket = before.lastIndexOf('[');
    if (bracket !== -1 && before.indexOf(']', bracket) === -1) openIndex = bracket;
    for (const quote of ['"', '`']) {
        const idx = before.lastIndexOf(quote);
        const count = before.split(quote).length - 1;
        if (idx > openIndex && count % 2 === 1) openIndex = idx;
    }
    if (openIndex === -1) return undefined;

    const opener = before[openIndex];
    const after = lineText.slice(range.endColumn - 1);
    const closeIndex = after.indexOf(QUOTE_CLOSERS[opener]);
    return {
        range: {
            ...range,
            startColumn: openIndex + 1,
            endColumn: closeIndex === -1 ? range.endColumn : range.endColumn + closeIndex + 1,
        },
        opener,
    };
}

export function generateAliasFromObjectName(objectName: string): string {
    const stripped = stripIdentifierQuotes(objectName).trim();
    if (!stripped) return 't';

    const normalized = stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    const words = normalized.match(/[A-Za-z0-9]+/g) || [];
    if (words.length === 0) return 't';

    const alias = words
        .map(word => word[0]?.toLowerCase() || '')
        .join('')
        .replace(/[^a-z0-9_]/g, '');

    if (!alias) return 't';
    if (/^[0-9]/.test(alias) || isReservedIdentifier(alias)) return `t${alias}`;
    return alias;
}

export function getSchemasForActiveDatabase(
    trees: Record<string, SchemaNode[]>,
    profileName: string,
    dbName: string,
): SchemaNode[] {
    if (!profileName || !dbName) return [];
    const key = `${profileName}:${dbName}`;
    return trees[key] || [];
}
