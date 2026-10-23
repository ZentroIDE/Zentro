// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"zentro/internal/models"
)

// SSH tunnel secrets share the OS keyring with the connection password, under
// suffixed keys so one profile ID owns all of its secrets.
const (
	sshPasswordKeySuffix   = "#ssh_password"
	sshPassphraseKeySuffix = "#ssh_passphrase"
)

func sshPasswordKey(connectionID string) string   { return connectionID + sshPasswordKeySuffix }
func sshPassphraseKey(connectionID string) string { return connectionID + sshPassphraseKeySuffix }

// hydrateSSHSecrets fills the profile's SSH secrets from the keyring. Like the
// database password they are only remembered when SavePassword is set.
func hydrateSSHSecrets(p *models.ConnectionProfile) {
	p.SSHPassword, p.SSHPassphrase = "", ""
	if !p.SavePassword || strings.TrimSpace(p.ID) == "" {
		return
	}
	if v, err := GetPassword(sshPasswordKey(p.ID)); err == nil {
		p.SSHPassword = v
	}
	if v, err := GetPassword(sshPassphraseKey(p.ID)); err == nil {
		p.SSHPassphrase = v
	}
}

// persistSSHSecrets moves the profile's SSH secrets into the keyring and blanks
// them on cp so they never reach config.json. As with the database password, a
// save that carries no secret keeps whatever is stored; only "Save password"
// being off forgets it.
func persistSSHSecrets(cp *models.ConnectionProfile) error {
	secrets := []struct {
		key string
		val *string
	}{
		{sshPasswordKey(cp.ID), &cp.SSHPassword},
		{sshPassphraseKey(cp.ID), &cp.SSHPassphrase},
	}
	for _, s := range secrets {
		switch {
		case cp.SavePassword && *s.val != "":
			if err := StorePassword(s.key, *s.val); err != nil {
				return fmt.Errorf("keyring store: %w", err)
			}
		case cp.SavePassword:
			// Not in memory — keep what the keyring already holds.
		default:
			if err := DeletePassword(s.key); err != nil {
				return fmt.Errorf("keyring delete: %w", err)
			}
		}
		*s.val = ""
	}
	return nil
}

// DeleteSSHSecrets removes both SSH secrets stored for a connection.
func DeleteSSHSecrets(connectionID string) error {
	if err := DeletePassword(sshPasswordKey(connectionID)); err != nil {
		return err
	}
	return DeletePassword(sshPassphraseKey(connectionID))
}

// SSHKnownHostsPath is where Zentro records the SSH host keys it has trusted.
// It is separate from ~/.ssh/known_hosts so Zentro never edits the user's own file.
func SSHKnownHostsPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("ssh: config dir: %w", err)
	}
	dir := filepath.Join(base, configDirName())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("ssh: mkdir: %w", err)
	}
	return filepath.Join(dir, "ssh_known_hosts"), nil
}
