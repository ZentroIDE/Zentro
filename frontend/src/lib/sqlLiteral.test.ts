// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
    booleanLiteral,
    formatSqlLiteral,
    normalizeTemporalValue,
    parseBooleanInput,
} from './sqlLiteral';

describe('parseBooleanInput', () => {
    it.each([
        ['1', true],
        ['true', true],
        ['TRUE', true],
        ['t', true],
        ['yes', true],
        ['on', true],
        ['0', false],
        ['false', false],
        ['F', false],
        ['no', false],
        ['off', false],
        ['  true  ', true],
    ])('parses %j as %s', (input, expected) => {
        expect(parseBooleanInput(input)).toBe(expected);
    });

    it('returns null for unrecognized input', () => {
        expect(parseBooleanInput('maybe')).toBeNull();
        expect(parseBooleanInput('')).toBeNull();
        expect(parseBooleanInput('2')).toBeNull();
    });
});

describe('booleanLiteral', () => {
    it('uses TRUE/FALSE keywords for Postgres', () => {
        expect(booleanLiteral(true, 'postgres')).toBe('TRUE');
        expect(booleanLiteral(false, 'postgres')).toBe('FALSE');
    });

    it('uses 1/0 for MySQL, SQL Server and SQLite', () => {
        for (const driver of ['mysql', 'sqlserver', 'sqlite']) {
            expect(booleanLiteral(true, driver)).toBe('1');
            expect(booleanLiteral(false, driver)).toBe('0');
        }
    });

    it('falls back to 1/0 for an unknown driver', () => {
        expect(booleanLiteral(true, undefined)).toBe('1');
        expect(booleanLiteral(false, 'oracle')).toBe('0');
    });
});

describe('formatSqlLiteral — booleans', () => {
    const boolCol = { dataType: 'boolean', isNullable: false };

    it('emits a Postgres-safe boolean keyword (regression: SQLSTATE 42804)', () => {
        // The reported bug: `SET "requires_manager_confirmation" = 0` on a
        // Postgres boolean column fails with "is of type boolean but
        // expression is of type integer".
        expect(formatSqlLiteral('0', boolCol, 'postgres')).toBe('FALSE');
        expect(formatSqlLiteral('1', boolCol, 'postgres')).toBe('TRUE');
        expect(formatSqlLiteral('false', boolCol, 'postgres')).toBe('FALSE');
        expect(formatSqlLiteral('true', boolCol, 'postgres')).toBe('TRUE');
    });

    it('emits 1/0 for a MySQL / SQL Server / SQLite boolean or bit column', () => {
        expect(formatSqlLiteral('true', { dataType: 'tinyint(1)' }, 'mysql')).toBe('1');
        expect(formatSqlLiteral('f', { dataType: 'bit' }, 'sqlserver')).toBe('0');
        expect(formatSqlLiteral('yes', { dataType: 'boolean' }, 'sqlite')).toBe('1');
    });

    it('quotes an unrecognized boolean value instead of guessing', () => {
        expect(formatSqlLiteral('maybe', boolCol, 'postgres')).toBe("'maybe'");
    });
});

describe('formatSqlLiteral — numbers', () => {
    it('emits a bare numeric literal for clean integers and decimals', () => {
        expect(formatSqlLiteral('42', { dataType: 'int4' }, 'postgres')).toBe('42');
        expect(formatSqlLiteral('-3.14', { dataType: 'numeric' }, 'postgres')).toBe('-3.14');
        expect(formatSqlLiteral('  7  ', { dataType: 'bigint' }, 'postgres')).toBe('7');
    });

    it('quotes a non-numeric value even for a numeric column', () => {
        expect(formatSqlLiteral('N/A', { dataType: 'int4' }, 'postgres')).toBe("'N/A'");
        expect(formatSqlLiteral('1e5', { dataType: 'int4' }, 'postgres')).toBe("'1e5'");
    });
});

describe('formatSqlLiteral — nulls and strings', () => {
    it('emits NULL for an empty value on a nullable column', () => {
        expect(formatSqlLiteral('', { dataType: 'text', isNullable: true }, 'postgres')).toBe(
            'NULL',
        );
    });

    it('emits an empty quoted string for an empty value on a NOT NULL column', () => {
        expect(formatSqlLiteral('', { dataType: 'text', isNullable: false }, 'postgres')).toBe(
            "''",
        );
    });

    it('escapes embedded single quotes', () => {
        expect(formatSqlLiteral("O'Brien", { dataType: 'text' }, 'postgres')).toBe("'O''Brien'");
    });

    it('quotes everything when no column metadata is supplied', () => {
        expect(formatSqlLiteral('0')).toBe("'0'");
        expect(formatSqlLiteral('')).toBe("''");
    });
});

describe('formatSqlLiteral — temporal', () => {
    it('keeps a normalized offset for timezone-aware columns', () => {
        // Backend now emits "2026-08-01 14:56:48.055 +0700" (no doubled zone).
        expect(
            formatSqlLiteral(
                '2026-08-01 14:56:48.055 +0700',
                { dataType: 'timestamptz' },
                'postgres',
            ),
        ).toBe("'2026-08-01 14:56:48.055 +07:00'");
    });

    it('drops any offset for a plain timestamp column', () => {
        expect(
            formatSqlLiteral(
                '2026-08-01 14:56:48.055 +0700',
                { dataType: 'timestamp' },
                'postgres',
            ),
        ).toBe("'2026-08-01 14:56:48.055'");
    });

    it('reduces a date column value to the date part', () => {
        expect(formatSqlLiteral('2026-08-01 00:00:00', { dataType: 'date' }, 'postgres')).toBe(
            "'2026-08-01'",
        );
    });
});

describe('normalizeTemporalValue', () => {
    it('strips the legacy Go doubled-zone artifact down to a single offset', () => {
        expect(normalizeTemporalValue('2026-08-01 14:56:48.055 +0700 +07', 'timestamptz')).toBe(
            '2026-08-01 14:56:48.055 +07:00',
        );
    });

    it('normalizes a Z suffix to +00:00 for tz-aware types', () => {
        expect(normalizeTemporalValue('2026-08-01T14:56:48Z', 'timestamptz')).toBe(
            '2026-08-01 14:56:48 +00:00',
        );
    });

    it('leaves plain timestamps without an offset', () => {
        expect(normalizeTemporalValue('2026-08-01 14:56:48 +0700', 'timestamp')).toBe(
            '2026-08-01 14:56:48',
        );
    });
});

describe('formatSqlLiteral string dialect rules', () => {
    it('prefixes SQL Server strings with N when they carry non-ASCII text', () => {
        expect(formatSqlLiteral('Nguyễn Văn A', { dataType: 'nvarchar' }, 'sqlserver')).toBe(
            "N'Nguyễn Văn A'",
        );
        expect(formatSqlLiteral('Nguyễn', undefined, 'sqlserver')).toBe("N'Nguyễn'");
    });

    it('prefixes SQL Server strings for unicode column types even when the text is ASCII', () => {
        expect(formatSqlLiteral('abc', { dataType: 'nvarchar' }, 'sqlserver')).toBe("N'abc'");
        expect(formatSqlLiteral('abc', { dataType: 'varchar' }, 'sqlserver')).toBe("'abc'");
    });

    it('does not add the N prefix on other dialects', () => {
        expect(formatSqlLiteral('Nguyễn', { dataType: 'text' }, 'postgres')).toBe("'Nguyễn'");
        expect(formatSqlLiteral('Nguyễn', { dataType: 'text' }, 'mysql')).toBe("'Nguyễn'");
    });

    it('doubles backslashes for MySQL only', () => {
        expect(formatSqlLiteral('C:\\temp', { dataType: 'varchar' }, 'mysql')).toBe("'C:\\\\temp'");
        expect(formatSqlLiteral('C:\\temp', { dataType: 'varchar' }, 'postgres')).toBe(
            "'C:\\temp'",
        );
    });

    it('still escapes single quotes', () => {
        expect(formatSqlLiteral("O'Brien", { dataType: 'nvarchar' }, 'sqlserver')).toBe(
            "N'O''Brien'",
        );
    });
});
