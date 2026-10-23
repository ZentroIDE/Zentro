// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    generateAliasFromObjectName,
    quoteIdentifierForDriver,
    resolveQuotedIdentifier,
} from './sqlCompletionIdentifiers';

describe('quoteIdentifierForDriver', () => {
    it('quotes names with spaces or punctuation per dialect', () => {
        expect(quoteIdentifierForDriver('Phone No_', 'sqlserver')).toBe('[Phone No_]');
        expect(quoteIdentifierForDriver('Phone No_', 'mssql')).toBe('[Phone No_]');
        expect(quoteIdentifierForDriver('Phone No_', 'mysql')).toBe('`Phone No_`');
        expect(quoteIdentifierForDriver('Phone No_', 'postgres')).toBe('"Phone No_"');
        expect(quoteIdentifierForDriver('Phone No_', 'sqlite')).toBe('"Phone No_"');
    });

    it('leaves plain names bare', () => {
        expect(quoteIdentifierForDriver('customer_id', 'sqlserver')).toBe('customer_id');
        expect(quoteIdentifierForDriver('CustomerId', 'sqlserver')).toBe('CustomerId');
    });

    it('quotes reserved words and digit-leading names', () => {
        expect(quoteIdentifierForDriver('order', 'sqlserver')).toBe('[order]');
        expect(quoteIdentifierForDriver('User', 'mysql')).toBe('`User`');
        expect(quoteIdentifierForDriver('1st', 'sqlserver')).toBe('[1st]');
    });

    it('quotes mixed-case names on Postgres only, where unquoted names fold to lower case', () => {
        expect(quoteIdentifierForDriver('CustomerId', 'postgres')).toBe('"CustomerId"');
        expect(quoteIdentifierForDriver('customerid', 'postgres')).toBe('customerid');
    });

    it('escapes the closing quote character inside the name', () => {
        expect(quoteIdentifierForDriver('a]b', 'sqlserver')).toBe('[a]]b]');
        expect(quoteIdentifierForDriver('a"b', 'postgres')).toBe('"a""b"');
        expect(quoteIdentifierForDriver('a`b', 'mysql')).toBe('`a``b`');
    });

    it('does not double-quote an already quoted name', () => {
        expect(quoteIdentifierForDriver('[Phone No_]', 'sqlserver')).toBe('[Phone No_]');
    });
});

describe('generateAliasFromObjectName', () => {
    it('never produces a reserved word as alias', () => {
        expect(generateAliasFromObjectName('Address Set')).toBe('tas');
        expect(generateAliasFromObjectName('Order Item')).toBe('oi');
    });
});

describe('resolveQuotedIdentifier', () => {
    const range = (startColumn: number, endColumn: number) => ({
        startLineNumber: 1,
        endLineNumber: 1,
        startColumn,
        endColumn,
    });

    it('returns undefined when the cursor is not inside a quote', () => {
        const line = 'SELECT c.pho FROM Customer c';
        expect(resolveQuotedIdentifier(line, range(10, 13), 13)).toBeUndefined();
    });

    it('widens over an auto-closed bracket pair', () => {
        const line = 'SELECT c.[pho] FROM Customer c';
        // cursor sits after "pho", before the auto-inserted "]"
        const result = resolveQuotedIdentifier(line, range(11, 14), 14);
        expect(result?.opener).toBe('[');
        expect(result?.range).toMatchObject({ startColumn: 10, endColumn: 15 });
    });

    it('widens across a multi-word quoted name typed so far', () => {
        const line = 'SELECT c.[Phone N] FROM Customer c';
        const result = resolveQuotedIdentifier(line, range(17, 18), 18);
        expect(result?.range).toMatchObject({ startColumn: 10, endColumn: 19 });
    });

    it('stops at the cursor when the quote was never closed', () => {
        const line = 'SELECT c.[pho';
        const result = resolveQuotedIdentifier(line, range(11, 14), 14);
        expect(result?.range).toMatchObject({ startColumn: 10, endColumn: 14 });
    });

    it('ignores a bracket that was already closed earlier on the line', () => {
        const line = 'SELECT [a].pho';
        expect(resolveQuotedIdentifier(line, range(12, 15), 15)).toBeUndefined();
    });
});
