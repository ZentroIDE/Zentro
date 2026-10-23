// SPDX-License-Identifier: GPL-3.0-only

import { DRIVER, type DriverType } from './constants';

// Registry of per-driver capabilities and dialect facts for the frontend.
// Pattern: registry over comparisons — UI code asks "can this driver X?"
// instead of `driver === 'postgres'`, so adding a driver is one map entry
// (mirroring the backend plugin registry, ADR-0001).

export type IdentifierQuoteStyle = 'double' | 'backtick' | 'bracket';

/**
 * How a boolean literal is written in a generated statement. Postgres rejects
 * `col = 0` for a `boolean` column (SQLSTATE 42804), so it needs the
 * `TRUE`/`FALSE` keywords; MySQL, SQL Server (`bit`) and SQLite take `1`/`0`.
 */
export type BooleanLiteralStyle = 'keyword' | 'numeric';

export interface DriverCapabilities {
    supportsDropCascade: boolean;
    supportsTruncate: boolean;
    supportsTruncateCascade: boolean;
    supportsTruncateRestartIdentity: boolean;
    supportsCreateDatabase: boolean;
    supportsAlterPrimaryKey: boolean;
    /** Schema rollback rides the git-tracking snapshots, wired for Postgres only. */
    supportsSchemaRollback: boolean;
    caseInsensitiveLikeOperator: 'ILIKE' | 'LIKE';
    identifierQuote: IdentifierQuoteStyle;
    booleanLiteralStyle: BooleanLiteralStyle;
    /** Type suggested for a new auto-increment id column in the table editor. */
    defaultIdColumnType: string;
    /** Type suggested for a new text column in the table editor. */
    defaultTextColumnType: string;
}

const DRIVER_CAPABILITIES: Record<DriverType, DriverCapabilities> = {
    [DRIVER.POSTGRES]: {
        supportsDropCascade: true,
        supportsTruncate: true,
        supportsTruncateCascade: true,
        supportsTruncateRestartIdentity: true,
        supportsCreateDatabase: true,
        supportsAlterPrimaryKey: true,
        supportsSchemaRollback: true,
        caseInsensitiveLikeOperator: 'ILIKE',
        identifierQuote: 'double',
        booleanLiteralStyle: 'keyword',
        defaultIdColumnType: 'SERIAL',
        defaultTextColumnType: 'varchar(255)',
    },
    [DRIVER.MYSQL]: {
        supportsDropCascade: false,
        supportsTruncate: true,
        supportsTruncateCascade: false,
        supportsTruncateRestartIdentity: false,
        supportsCreateDatabase: true,
        supportsAlterPrimaryKey: true,
        supportsSchemaRollback: false,
        caseInsensitiveLikeOperator: 'LIKE',
        identifierQuote: 'backtick',
        booleanLiteralStyle: 'numeric',
        defaultIdColumnType: 'INT',
        defaultTextColumnType: 'varchar(255)',
    },
    [DRIVER.SQLSERVER]: {
        supportsDropCascade: false,
        supportsTruncate: true,
        supportsTruncateCascade: false,
        supportsTruncateRestartIdentity: false,
        supportsCreateDatabase: true,
        supportsAlterPrimaryKey: true,
        supportsSchemaRollback: false,
        caseInsensitiveLikeOperator: 'LIKE',
        identifierQuote: 'bracket',
        booleanLiteralStyle: 'numeric',
        defaultIdColumnType: 'INT',
        defaultTextColumnType: 'nvarchar(255)',
    },
    [DRIVER.SQLITE]: {
        supportsDropCascade: false,
        supportsTruncate: false,
        supportsTruncateCascade: false,
        supportsTruncateRestartIdentity: false,
        supportsCreateDatabase: false,
        supportsAlterPrimaryKey: false,
        supportsSchemaRollback: false,
        caseInsensitiveLikeOperator: 'LIKE',
        identifierQuote: 'double',
        booleanLiteralStyle: 'numeric',
        defaultIdColumnType: 'INTEGER',
        defaultTextColumnType: 'nvarchar(255)',
    },
};

// Unknown/empty drivers fall back to the most conservative profile with
// standard SQL double-quoting — matches the previous scattered defaults.
const FALLBACK_CAPABILITIES: DriverCapabilities = {
    supportsDropCascade: false,
    supportsTruncate: true,
    supportsTruncateCascade: false,
    supportsTruncateRestartIdentity: false,
    supportsCreateDatabase: true,
    supportsAlterPrimaryKey: true,
    supportsSchemaRollback: false,
    caseInsensitiveLikeOperator: 'LIKE',
    identifierQuote: 'double',
    booleanLiteralStyle: 'numeric',
    defaultIdColumnType: 'INT',
    defaultTextColumnType: 'nvarchar(255)',
};

export function getDriverCapabilities(driver: string | undefined): DriverCapabilities {
    const normalized = (driver || '').trim().toLowerCase();
    return DRIVER_CAPABILITIES[normalized as DriverType] ?? FALLBACK_CAPABILITIES;
}

/** Quotes an identifier per the driver's quoting style. */
export function quoteIdent(name: string, driver: string | undefined): string {
    switch (getDriverCapabilities(driver).identifierQuote) {
        case 'backtick':
            return `\`${name.replace(/`/g, '``')}\``;
        case 'bracket':
            return `[${name.replace(/]/g, ']]')}]`;
        default:
            return `"${name.replace(/"/g, '""')}"`;
    }
}
