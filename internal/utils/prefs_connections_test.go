// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"testing"

	"github.com/zalando/go-keyring"

	"zentro/internal/models"
)

func seedConfigEnv(t *testing.T) {
	t.Helper()
	temp := t.TempDir()
	t.Setenv("APPDATA", temp)
	t.Setenv("XDG_CONFIG_HOME", temp)
	t.Setenv("HOME", temp)
	keyring.MockInit()
}

// pooledProfile fixes ID == name for test determinism (SaveConnections'
// upsert matches by ID, and the keyring secret is keyed by ID) — real
// callers get a uuid, but a stable, readable id keeps these assertions
// legible without threading a generated one through every test.
func pooledProfile(name, password string, savePassword bool) *models.ConnectionProfile {
	return &models.ConnectionProfile{
		ID:              name,
		Name:            name,
		Driver:          "postgres",
		Host:            "localhost",
		Port:            5432,
		DBName:          "postgres",
		Username:        "postgres",
		Password:        password,
		SavePassword:    savePassword,
		EncryptPassword: savePassword,
	}
}

func TestSaveConnectionsStoresPasswordInKeyring(t *testing.T) {
	seedConfigEnv(t)

	if err := SaveConnections([]*models.ConnectionProfile{pooledProfile("pg", "s3cr3t", true)}); err != nil {
		t.Fatalf("SaveConnections: %v", err)
	}

	stored, err := keyring.Get(keyringService, "pg")
	if err != nil || stored != "s3cr3t" {
		t.Fatalf("keyring password = %q, %v; want %q", stored, err, "s3cr3t")
	}

	loaded, err := LoadConnections()
	if err != nil {
		t.Fatalf("LoadConnections: %v", err)
	}
	if len(loaded) != 1 || loaded[0].Password != "s3cr3t" {
		t.Fatalf("loaded profile password = %+v; want rehydrated from keyring", loaded)
	}
}

// A save that carries no password must never forget the stored one — that is
// what left project environments authenticating with an empty password.
func TestSaveConnectionsKeepsSecretWhenPasswordNotHydrated(t *testing.T) {
	seedConfigEnv(t)

	if err := SaveConnections([]*models.ConnectionProfile{pooledProfile("pg", "s3cr3t", true)}); err != nil {
		t.Fatalf("seed SaveConnections: %v", err)
	}

	// A partially populated copy: SavePassword still on, password never filled in.
	if err := SaveConnections([]*models.ConnectionProfile{pooledProfile("pg", "", true)}); err != nil {
		t.Fatalf("SaveConnections: %v", err)
	}

	stored, err := keyring.Get(keyringService, "pg")
	if err != nil || stored != "s3cr3t" {
		t.Fatalf("keyring password = %q, %v; want the secret preserved", stored, err)
	}

	loaded, err := LoadConnections()
	if err != nil {
		t.Fatalf("LoadConnections: %v", err)
	}
	if len(loaded) != 1 || loaded[0].Password != "s3cr3t" {
		t.Fatalf("loaded password = %q; want %q", loaded[0].Password, "s3cr3t")
	}
	if !loaded[0].EncryptPassword {
		t.Fatalf("encrypt_password flipped off for a save_password profile")
	}
}

// Unticking "Save password" is the explicit way to forget a stored secret.
func TestSaveConnectionsForgetsSecretWhenSavePasswordOff(t *testing.T) {
	seedConfigEnv(t)

	if err := SaveConnections([]*models.ConnectionProfile{pooledProfile("pg", "s3cr3t", true)}); err != nil {
		t.Fatalf("seed SaveConnections: %v", err)
	}
	if err := SaveConnections([]*models.ConnectionProfile{pooledProfile("pg", "s3cr3t", false)}); err != nil {
		t.Fatalf("SaveConnections: %v", err)
	}

	if _, err := keyring.Get(keyringService, "pg"); err == nil {
		t.Fatalf("expected the keyring secret to be deleted")
	}
	loaded, err := LoadConnections()
	if err != nil {
		t.Fatalf("LoadConnections: %v", err)
	}
	if loaded[0].Password != "" {
		t.Fatalf("loaded password = %q; want empty", loaded[0].Password)
	}
}

// Saving preferences rewrites the whole config, connections included; it must
// not cost the pool its passwords.
func TestSavePreferencesKeepsConnectionSecrets(t *testing.T) {
	seedConfigEnv(t)

	if err := SaveConnections([]*models.ConnectionProfile{pooledProfile("pg", "s3cr3t", true)}); err != nil {
		t.Fatalf("seed SaveConnections: %v", err)
	}

	prefs, err := LoadPreferences()
	if err != nil {
		t.Fatalf("LoadPreferences: %v", err)
	}
	prefs.FontSize = 18
	if err := SavePreferences(prefs); err != nil {
		t.Fatalf("SavePreferences: %v", err)
	}

	stored, err := keyring.Get(keyringService, "pg")
	if err != nil || stored != "s3cr3t" {
		t.Fatalf("keyring password = %q, %v; want the secret preserved", stored, err)
	}
}
