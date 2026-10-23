// SPDX-License-Identifier: GPL-3.0-only

export interface ConnectionProfile {
    /** Stable identity — what ProjectEnvironment.connection_ref points to
     * and the keyring secret is stored under. Undefined on a brand-new,
     * not-yet-saved profile; the backend assigns one on first save. */
    id?: string;
    name: string;
    driver: string;
    host: string;
    port: number;
    /** Optional bootstrap database — used only to open the connection for
     * testing/listing databases. Never a binding; see EnvironmentMatrix for
     * where a project actually picks a database. */
    db_name?: string;
    username: string;
    password: string;
    ssl_mode?: string;
    connect_timeout: number;
    save_password: boolean;
    encrypt_password?: boolean;
    show_all_schemas: boolean;
    trust_server_cert: boolean;
    /** Lowest TLS version the client accepts: '' = driver default, else '1.0' | '1.1' | '1.2' | '1.3'. */
    tls_min_version?: string;
    /** Also offer cipher suites Go no longer enables by default (old servers). */
    tls_legacy_ciphers?: boolean;
    /** Reach the database through an SSH server; `host` is then the database
     * address as seen from that server. */
    ssh_enabled?: boolean;
    ssh_host?: string;
    ssh_port?: number;
    ssh_user?: string;
    /** 'password' | 'key' | 'agent' */
    ssh_auth?: string;
    ssh_key_path?: string;
    /** Secrets: kept in the OS keychain (when "Save password" is on), never in config.json. */
    ssh_password?: string;
    ssh_passphrase?: string;
}
