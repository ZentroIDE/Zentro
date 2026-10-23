// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"testing"

	"github.com/zalando/go-keyring"

	"zentro/internal/models"
)

func sshProfile() *models.ConnectionProfile {
	return &models.ConnectionProfile{
		ID: "conn-1", SavePassword: true, SSHEnabled: true,
		SSHPassword: "ssh-pw", SSHPassphrase: "key-pass",
	}
}

func TestPersistSSHSecretsStoresInKeyringAndBlanksProfile(t *testing.T) {
	keyring.MockInit()
	p := sshProfile()

	if err := persistSSHSecrets(p); err != nil {
		t.Fatal(err)
	}
	if p.SSHPassword != "" || p.SSHPassphrase != "" {
		t.Fatalf("secrets must be blanked before config.json is written: %+v", p)
	}

	loaded := &models.ConnectionProfile{ID: "conn-1", SavePassword: true}
	hydrateSSHSecrets(loaded)
	if loaded.SSHPassword != "ssh-pw" || loaded.SSHPassphrase != "key-pass" {
		t.Fatalf("hydrate = %q/%q, want the stored secrets", loaded.SSHPassword, loaded.SSHPassphrase)
	}
}

func TestPersistSSHSecretsKeepsStoredValueWhenSaveCarriesNone(t *testing.T) {
	keyring.MockInit()
	if err := persistSSHSecrets(sshProfile()); err != nil {
		t.Fatal(err)
	}

	// A later save from a profile that was never hydrated must not forget them.
	blank := &models.ConnectionProfile{ID: "conn-1", SavePassword: true}
	if err := persistSSHSecrets(blank); err != nil {
		t.Fatal(err)
	}
	loaded := &models.ConnectionProfile{ID: "conn-1", SavePassword: true}
	hydrateSSHSecrets(loaded)
	if loaded.SSHPassword != "ssh-pw" {
		t.Fatalf("stored SSH password was lost: %q", loaded.SSHPassword)
	}
}

func TestPersistSSHSecretsForgetsWhenSavePasswordIsOff(t *testing.T) {
	keyring.MockInit()
	if err := persistSSHSecrets(sshProfile()); err != nil {
		t.Fatal(err)
	}

	off := sshProfile()
	off.SavePassword = false
	if err := persistSSHSecrets(off); err != nil {
		t.Fatal(err)
	}
	loaded := &models.ConnectionProfile{ID: "conn-1", SavePassword: true}
	hydrateSSHSecrets(loaded)
	if loaded.SSHPassword != "" || loaded.SSHPassphrase != "" {
		t.Fatalf("secrets must be deleted when Save password is off: %+v", loaded)
	}
}

func TestHydrateSSHSecretsIgnoresProfilesThatDoNotSavePasswords(t *testing.T) {
	keyring.MockInit()
	if err := persistSSHSecrets(sshProfile()); err != nil {
		t.Fatal(err)
	}
	p := &models.ConnectionProfile{ID: "conn-1", SavePassword: false, SSHPassword: "leaked"}
	hydrateSSHSecrets(p)
	if p.SSHPassword != "" {
		t.Fatalf("SSHPassword = %q, want it cleared", p.SSHPassword)
	}
}

func TestDeleteSSHSecretsRemovesBoth(t *testing.T) {
	keyring.MockInit()
	if err := persistSSHSecrets(sshProfile()); err != nil {
		t.Fatal(err)
	}
	if err := DeleteSSHSecrets("conn-1"); err != nil {
		t.Fatal(err)
	}
	loaded := &models.ConnectionProfile{ID: "conn-1", SavePassword: true}
	hydrateSSHSecrets(loaded)
	if loaded.SSHPassword != "" || loaded.SSHPassphrase != "" {
		t.Fatalf("secrets survived delete: %+v", loaded)
	}
}
