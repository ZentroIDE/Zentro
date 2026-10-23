// SPDX-License-Identifier: GPL-3.0-only

import PostgresLogo from '../assets/images/postgresql-logo-svgrepo-com.svg';
import SqlServerLogo from '../assets/images/sql-server.svg';
import MySqlLogo from '../assets/images/mysql-logo-svgrepo-com.svg';
import SqliteLogo from '../assets/images/sqlite-svgrepo-com.svg';
import { DRIVER } from './constants';
import type { ConnectionProfile } from '../types/connection';

// ── Extra field descriptor ────────────────────────────────────────────────────
export interface ExtraField {
    /** Must match a boolean key on ConnectionProfile */
    name: keyof ConnectionProfile;
    label: string;
    type: 'checkbox';
}

// ── Provider contract ─────────────────────────────────────────────────────────
export interface ProviderConfig {
    /** Matches ConnectionProfile.driver */
    key: string;
    label: string;
    /** One-line blurb shown in the provider picker */
    description: string;
    defaultPort: number | null;
    defaultSsl: string;
    /** Hex colour used for icon background tinting */
    color: string;
    /** SVG asset imported via Vite */
    icon: string;
    /** Whether host / port fields are meaningful for this provider */
    requiresHost: boolean;
    /** Whether username / password fields are meaningful for this provider */
    requiresAuth: boolean;
    /** Provider-specific additional boolean fields rendered as checkboxes */
    extraFields?: ExtraField[];
    /** Connection-string (URI) support. Absent for providers with no URI form
     *  (SQLite is just a file path), which hides the field entirely. */
    uri?: {
        /** Canonical scheme, e.g. `postgres` */
        scheme: string;
        /** Other schemes that mean this provider, e.g. `postgresql` */
        aliases?: string[];
        /** Example shown in the empty field */
        placeholder: string;
    };
    /** Example username for the empty Username field */
    usernamePlaceholder?: string;
    /** Example for the empty Bootstrap database field */
    bootstrapDbPlaceholder?: string;
}

// ── Registry — add new providers HERE only ───────────────────────────────────
export const PROVIDERS: ProviderConfig[] = [
    {
        key: DRIVER.POSTGRES,
        label: 'PostgreSQL',
        description: 'Object-relational SQL database',
        defaultPort: 5432,
        defaultSsl: 'disable',
        color: '#336791',
        icon: PostgresLogo,
        requiresHost: true,
        requiresAuth: true,
        uri: {
            scheme: 'postgres',
            aliases: ['postgresql'],
            placeholder: 'postgres://user:pass@host:5432/db',
        },
        usernamePlaceholder: 'postgres',
        bootstrapDbPlaceholder: 'postgres (default)',
    },
    {
        key: DRIVER.SQLSERVER,
        label: 'SQL Server',
        description: 'Enterprise RDBMS by Microsoft',
        defaultPort: 1433,
        defaultSsl: 'disable',
        color: '#CC2927',
        icon: SqlServerLogo,
        requiresHost: true,
        requiresAuth: true,
        extraFields: [
            {
                name: 'trust_server_cert',
                label: 'Trust server cert',
                type: 'checkbox',
            },
        ],
        uri: {
            scheme: 'sqlserver',
            aliases: ['mssql'],
            placeholder: 'sqlserver://user:pass@host:1433?database=master',
        },
        usernamePlaceholder: 'sa',
        bootstrapDbPlaceholder: 'master (default)',
    },
    {
        key: DRIVER.MYSQL,
        label: 'MySQL',
        description: 'Popular open-source RDBMS',
        defaultPort: 3306,
        defaultSsl: 'disable',
        color: '#F29111',
        icon: MySqlLogo,
        requiresHost: true,
        requiresAuth: true,
        uri: {
            scheme: 'mysql',
            placeholder: 'mysql://user:pass@host:3306/db',
        },
        usernamePlaceholder: 'root',
        bootstrapDbPlaceholder: 'optional',
    },
    {
        key: DRIVER.SQLITE,
        label: 'SQLite',
        description: 'Embedded, file-based database',
        defaultPort: null,
        defaultSsl: 'disable',
        color: '#44A8D1',
        icon: SqliteLogo,
        requiresHost: false,
        requiresAuth: false,
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export const getProvider = (key: string): ProviderConfig =>
    PROVIDERS.find(p => p.key === key) ?? PROVIDERS[0];

export const makeDefaultForm = (driver = ''): Partial<ConnectionProfile> => {
    const p = driver ? getProvider(driver) : null;
    return {
        driver,
        host: 'localhost',
        port: p?.defaultPort ?? 5432,
        ssl_mode: p?.defaultSsl ?? 'disable',
        connect_timeout: 30,
        save_password: true,
        encrypt_password: true,
        name: '',
        username: '',
        password: '',
        db_name: '',
        show_all_schemas: false,
        trust_server_cert: false,
        tls_min_version: '',
        tls_legacy_ciphers: false,
        ssh_enabled: false,
        ssh_host: '',
        ssh_port: 22,
        ssh_user: '',
        ssh_auth: 'password',
        ssh_key_path: '',
        ssh_password: '',
        ssh_passphrase: '',
    };
};

const providerForScheme = (scheme: string): ProviderConfig | undefined =>
    PROVIDERS.find(p => p.uri && (p.uri.scheme === scheme || p.uri.aliases?.includes(scheme)));

/** Maps the SSL spellings the supported URI dialects use onto the form's
 *  `ssl_mode` values; anything the form can't express is ignored. */
const SSL_MODE_FROM_URI: Record<string, string> = {
    disable: 'disable',
    disabled: 'disable',
    false: 'disable',
    require: 'require',
    required: 'require',
    true: 'require',
    'skip-verify': 'require',
    'verify-ca': 'verify-ca',
    verify_ca: 'verify-ca',
    'verify-full': 'verify-full',
    verify_identity: 'verify-full',
    'verify-identity': 'verify-full',
};

/** Parses a connection URI and returns the partial profile updates. The
 *  scheme picks the provider (`mysql://` → MySQL); a URI with no scheme is
 *  read in the dialect of `currentDriver`. An unknown scheme, or a provider
 *  with no URI form (SQLite), yields no updates. */
export const parseConnectionString = (
    uri: string,
    currentName: string | undefined,
    currentDriver: string = DRIVER.POSTGRES,
): Partial<ConnectionProfile> => {
    const trimmed = uri.trim();
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1].toLowerCase();
    const provider = scheme ? providerForScheme(scheme) : getProvider(currentDriver);
    if (!provider?.uri) return {};
    try {
        const url = new URL(scheme ? trimmed : `${provider.uri.scheme}://${trimmed}`);
        const updates: Partial<ConnectionProfile> = { driver: provider.key };
        if (url.hostname) updates.host = url.hostname;
        // A URI without a port means this provider's default, not whatever the
        // previously selected provider left in the form.
        if (url.port) updates.port = parseInt(url.port, 10);
        else if (provider.defaultPort) updates.port = provider.defaultPort;
        // go-mssqldb URIs carry the database in `?database=`; their path is the
        // named instance, not a database.
        const db =
            provider.key === DRIVER.SQLSERVER
                ? (url.searchParams.get('database') ?? '')
                : decodeURIComponent(url.pathname.replace(/^\//, ''));
        if (db) updates.db_name = db;
        if (url.username) updates.username = decodeURIComponent(url.username);
        if (url.password) updates.password = decodeURIComponent(url.password);
        const sslParam =
            url.searchParams.get('sslmode') ??
            url.searchParams.get('ssl-mode') ??
            url.searchParams.get('tls');
        const sslMode = sslParam ? SSL_MODE_FROM_URI[sslParam.toLowerCase()] : undefined;
        if (sslMode) updates.ssl_mode = sslMode;
        if (
            provider.key === DRIVER.SQLSERVER &&
            url.searchParams.get('trustservercertificate')?.toLowerCase() === 'true'
        ) {
            updates.trust_server_cert = true;
        }
        if (!currentName && updates.host)
            updates.name = `${provider.key}-${updates.host.split('.')[0]}`;
        return updates;
    } catch {
        return {};
    }
};

/** Returns a validation error string, or null if form is valid.
 * `existingNames` must already exclude the profile being edited so a
 * no-op rename doesn't trip the uniqueness check. */
export const validateConnectionForm = (
    form: Partial<ConnectionProfile>,
    existingNames: string[],
): string | null => {
    if (!form.driver?.trim()) return 'Please select a provider';
    if (!form.name?.trim()) return 'Profile name is required';
    // Names are editable now (identity is the pool ID); callers pass
    // existingNames with the profile being edited already excluded, so this
    // catches a rename onto another connection's name too.
    if (existingNames.includes(form.name.trim())) return `"${form.name.trim()}" already exists`;
    const p = getProvider(form.driver ?? DRIVER.POSTGRES);
    if (p.requiresHost && !form.host?.trim()) return 'Host is required';
    if (p.requiresAuth && !form.username?.trim()) return 'Username is required';
    if (form.save_password && !form.encrypt_password)
        return 'Encrypt password must be enabled when saving password';
    // db_name is an optional bootstrap database for server drivers — only
    // SQLite, where the file *is* the database, still requires it.
    if (!p.requiresHost && !form.db_name?.trim()) return 'Database file path is required';
    if (p.requiresHost && (!form.port || form.port <= 0)) return 'Port must be a positive number';
    if (p.requiresHost && form.ssh_enabled) {
        if (!form.ssh_host?.trim()) return 'SSH host is required';
        if (!form.ssh_user?.trim()) return 'SSH user is required';
        if (form.ssh_port !== undefined && form.ssh_port <= 0)
            return 'SSH port must be a positive number';
        if ((form.ssh_auth ?? 'password') === 'password' && !form.ssh_password)
            return 'SSH password is required';
        if (form.ssh_auth === 'key' && !form.ssh_key_path?.trim())
            return 'SSH private key file is required';
    }
    return null;
};
