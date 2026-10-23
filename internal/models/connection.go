// SPDX-License-Identifier: GPL-3.0-only

package models

import (
	"github.com/google/uuid"

	"zentro/internal/constant"
)

// ConnectionProfile stores connection details for a database profile —
// a gateway into a server, shared across every project that references it.
// Passwords are persisted to OS keyring, keyed by ID (see internal/utils),
// when SavePassword and EncryptPassword are enabled.
type ConnectionProfile struct {
	// ID is the stable identity a ProjectEnvironment.ConnectionRef points
	// to and the keyring secret is stored under. Assigned once (uuid) and
	// never changes, so renaming Name never orphans a binding or a secret.
	ID       string `json:"id"`
	Name     string `json:"name"`     // display label only, freely renamable, unique, max 50
	Driver   string `json:"driver"`   // "postgres" | "sqlserver"
	Host     string `json:"host"`     // default "localhost"
	Port     int    `json:"port"`     // 5432 (pg) | 1433 (mssql)
	Username string `json:"username"` // required
	Password string `json:"password"`
	// DBName is an optional bootstrap database — used only to open a
	// connection when nothing else specifies one (Test connection, List
	// databases, Create database). It is never a binding: which database a
	// project actually works against lives on ProjectEnvironment.LastDatabase,
	// not here. Blank is valid; callers that need to open a bootstrap
	// connection resolve a per-driver default (see driver.MaintenanceDBName).
	DBName          string `json:"db_name,omitempty"`
	SSLMode         string `json:"ssl_mode,omitempty"` // postgres only: "disable" | "require"
	ConnectTimeout  int    `json:"connect_timeout"`    // seconds, default 30
	SavePassword    bool   `json:"save_password"`
	EncryptPassword bool   `json:"encrypt_password"`
	ShowAllSchemas  bool   `json:"show_all_schemas"`
	TrustServerCert bool   `json:"trust_server_cert"`
	// TLSMinVersion lowers (or raises) the lowest TLS version the client
	// accepts: "" keeps the driver default, else "1.0" | "1.1" | "1.2" | "1.3".
	TLSMinVersion string `json:"tls_min_version,omitempty"`
	// TLSLegacyCiphers also offers cipher suites Go no longer enables by
	// default, which old servers (e.g. SQL Server 2008-2012) may require.
	TLSLegacyCiphers bool `json:"tls_legacy_ciphers,omitempty"`

	// SSH tunnel: when SSHEnabled, the driver reaches Host:Port from the SSH
	// server (SSHHost) instead of directly, so Host is the database address as
	// seen from that server. SSHAuth is "password" | "key" | "agent".
	SSHEnabled bool   `json:"ssh_enabled,omitempty"`
	SSHHost    string `json:"ssh_host,omitempty"`
	SSHPort    int    `json:"ssh_port,omitempty"` // default 22
	SSHUser    string `json:"ssh_user,omitempty"`
	SSHAuth    string `json:"ssh_auth,omitempty"`
	// SSHKeyPath is a path to a private key file; key material is never copied
	// into the config.
	SSHKeyPath string `json:"ssh_key_path,omitempty"`
	// SSHPassword and SSHPassphrase are secrets: like Password they live in the
	// OS keyring (see internal/utils/ssh_secrets.go), never in config.json.
	SSHPassword   string `json:"ssh_password,omitempty"`
	SSHPassphrase string `json:"ssh_passphrase,omitempty"`
}

// NewConnectionProfile returns a new profile with default values.
func NewConnectionProfile() *ConnectionProfile {
	return &ConnectionProfile{
		ID:              uuid.NewString(),
		Host:            "localhost",
		Port:            5432,
		Driver:          constant.DriverPostgres,
		SSLMode:         "disable",
		ConnectTimeout:  30,
		SavePassword:    true,
		EncryptPassword: true,
		ShowAllSchemas:  false,
		TrustServerCert: false,
	}
}
