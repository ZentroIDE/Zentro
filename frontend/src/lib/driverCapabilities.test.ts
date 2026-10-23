// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getDriverCapabilities, quoteIdent } from './driverCapabilities';
import { DRIVER } from './constants';

describe('getDriverCapabilities', () => {
    it('exposes the postgres-only maintenance capabilities', () => {
        const pg = getDriverCapabilities(DRIVER.POSTGRES);
        expect(pg.supportsDropCascade).toBe(true);
        expect(pg.supportsTruncateCascade).toBe(true);
        expect(pg.supportsTruncateRestartIdentity).toBe(true);
        expect(pg.supportsSchemaRollback).toBe(true);
        expect(pg.caseInsensitiveLikeOperator).toBe('ILIKE');

        for (const driver of [DRIVER.MYSQL, DRIVER.SQLSERVER, DRIVER.SQLITE]) {
            const caps = getDriverCapabilities(driver);
            expect(caps.supportsDropCascade).toBe(false);
            expect(caps.supportsSchemaRollback).toBe(false);
            expect(caps.caseInsensitiveLikeOperator).toBe('LIKE');
        }
    });

    it('marks sqlite as the file-based outlier', () => {
        const sqlite = getDriverCapabilities(DRIVER.SQLITE);
        expect(sqlite.supportsTruncate).toBe(false);
        expect(sqlite.supportsCreateDatabase).toBe(false);
        expect(sqlite.supportsAlterPrimaryKey).toBe(false);
        expect(sqlite.defaultIdColumnType).toBe('INTEGER');
    });

    it('normalizes casing/whitespace and falls back for unknown drivers', () => {
        expect(getDriverCapabilities('  Postgres ')).toEqual(
            getDriverCapabilities(DRIVER.POSTGRES),
        );
        const fallback = getDriverCapabilities('oracle');
        expect(fallback.supportsDropCascade).toBe(false);
        expect(fallback.identifierQuote).toBe('double');
        expect(getDriverCapabilities(undefined)).toEqual(fallback);
    });
});

describe('quoteIdent', () => {
    it('quotes per driver dialect and escapes embedded quotes', () => {
        expect(quoteIdent('my col', DRIVER.POSTGRES)).toBe('"my col"');
        expect(quoteIdent('we"ird', DRIVER.POSTGRES)).toBe('"we""ird"');
        expect(quoteIdent('my col', DRIVER.MYSQL)).toBe('`my col`');
        expect(quoteIdent('we`ird', DRIVER.MYSQL)).toBe('`we``ird`');
        expect(quoteIdent('my col', DRIVER.SQLSERVER)).toBe('[my col]');
        expect(quoteIdent('we]ird', DRIVER.SQLSERVER)).toBe('[we]]ird]');
        expect(quoteIdent('my col', DRIVER.SQLITE)).toBe('"my col"');
    });

    it('defaults to double quotes for unknown drivers', () => {
        expect(quoteIdent('name', undefined)).toBe('"name"');
        expect(quoteIdent('name', 'oracle')).toBe('"name"');
    });
});
