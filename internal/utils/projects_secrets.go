// SPDX-License-Identifier: GPL-3.0-only

package utils

// projectConnectionSecretKey is the legacy OS-keyring key under which a
// per-project connection's password was stored (keyed by the embedded
// ProjectConnection.ID). Connections are now a single global pool whose
// passwords are keyed by connection Name; this helper is retained only so
// MigratePooledConnections can read and then delete the old secrets.
func projectConnectionSecretKey(connectionID string) string {
	return "project-connection:" + connectionID
}
