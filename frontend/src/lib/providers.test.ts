// SPDX-License-Identifier: GPL-3.0-only

import { describe, it, expect } from 'vitest';

import { DRIVER } from './constants';
import {
    getProvider,
    makeDefaultForm,
    parseConnectionString,
    validateConnectionForm,
} from './providers';
import type { ConnectionProfile } from '../types/connection';

function validForm(overrides: Partial<ConnectionProfile> = {}): Partial<ConnectionProfile> {
    return {
        ...makeDefaultForm(DRIVER.POSTGRES),
        name: 'prod',
        username: 'app',
        ...overrides,
    };
}

describe('validateConnectionForm — SSH tunnel', () => {
    it('ignores the SSH fields while the tunnel is off', () => {
        expect(validateConnectionForm(validForm(), [])).toBeNull();
    });

    it('requires an SSH host and user once enabled', () => {
        expect(validateConnectionForm(validForm({ ssh_enabled: true }), [])).toBe(
            'SSH host is required',
        );
        expect(
            validateConnectionForm(validForm({ ssh_enabled: true, ssh_host: 'bastion' }), []),
        ).toBe('SSH user is required');
    });

    it('requires the credential that matches the auth method', () => {
        const base = { ssh_enabled: true, ssh_host: 'bastion', ssh_user: 'me' };
        expect(validateConnectionForm(validForm({ ...base, ssh_auth: 'password' }), [])).toBe(
            'SSH password is required',
        );
        expect(validateConnectionForm(validForm({ ...base, ssh_auth: 'key' }), [])).toBe(
            'SSH private key file is required',
        );
        expect(validateConnectionForm(validForm({ ...base, ssh_auth: 'agent' }), [])).toBeNull();
        expect(
            validateConnectionForm(
                validForm({ ...base, ssh_auth: 'password', ssh_password: 'pw' }),
                [],
            ),
        ).toBeNull();
    });

    it('rejects a non-positive SSH port', () => {
        const form = validForm({
            ssh_enabled: true,
            ssh_host: 'bastion',
            ssh_user: 'me',
            ssh_auth: 'agent',
            ssh_port: 0,
        });
        expect(validateConnectionForm(form, [])).toBe('SSH port must be a positive number');
    });

    it('does not apply to SQLite, which has no network path', () => {
        const form: Partial<ConnectionProfile> = {
            ...makeDefaultForm(DRIVER.SQLITE),
            name: 'local',
            db_name: '/tmp/x.db',
            ssh_enabled: true,
        };
        expect(validateConnectionForm(form, [])).toBeNull();
    });
});

describe('provider connection-string support', () => {
    it('gives each server provider its own URI example, and SQLite none', () => {
        expect(getProvider(DRIVER.POSTGRES).uri?.placeholder).toMatch(/^postgres:\/\//);
        expect(getProvider(DRIVER.MYSQL).uri?.placeholder).toMatch(/^mysql:\/\//);
        expect(getProvider(DRIVER.SQLSERVER).uri?.placeholder).toMatch(
            /^sqlserver:\/\/.*database=/,
        );
        expect(getProvider(DRIVER.SQLITE).uri).toBeUndefined();
    });
});

describe('parseConnectionString', () => {
    it('reads a PostgreSQL URI, including the postgresql alias', () => {
        expect(
            parseConnectionString(
                'postgres://app:s%40crt@db.example.com:6432/shop?sslmode=require',
                '',
            ),
        ).toMatchObject({
            driver: DRIVER.POSTGRES,
            host: 'db.example.com',
            port: 6432,
            db_name: 'shop',
            username: 'app',
            password: 's@crt',
            ssl_mode: 'require',
            name: 'postgres-db',
        });
        expect(parseConnectionString('postgresql://u@h/db', 'x').driver).toBe(DRIVER.POSTGRES);
    });

    it('switches to MySQL on a mysql:// URI and uses its default port when omitted', () => {
        expect(
            parseConnectionString('mysql://root:pw@localhost/shop', 'x', DRIVER.POSTGRES),
        ).toMatchObject({ driver: DRIVER.MYSQL, port: 3306, db_name: 'shop', username: 'root' });
    });

    it('reads the SQL Server database from ?database=, not from the path', () => {
        const updates = parseConnectionString(
            'sqlserver://sa:pw@host:1433?database=Sales&trustservercertificate=true',
            'x',
        );
        expect(updates).toMatchObject({
            driver: DRIVER.SQLSERVER,
            port: 1433,
            db_name: 'Sales',
            username: 'sa',
            trust_server_cert: true,
        });
        expect(parseConnectionString('mssql://sa@host/INSTANCE', 'x').db_name).toBeUndefined();
    });

    it('reads a scheme-less string in the dialect of the selected provider', () => {
        expect(
            parseConnectionString('sa:pw@host:1433?database=m', 'x', DRIVER.SQLSERVER),
        ).toMatchObject({
            driver: DRIVER.SQLSERVER,
            host: 'host',
            db_name: 'm',
        });
    });

    it('ignores an unknown scheme and providers without a URI form', () => {
        expect(parseConnectionString('oracle://u@h/db', 'x')).toEqual({});
        expect(parseConnectionString('/tmp/x.db', 'x', DRIVER.SQLITE)).toEqual({});
    });
});
