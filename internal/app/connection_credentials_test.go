// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"github.com/zalando/go-keyring"

	"zentro/internal/models"
	"zentro/internal/utils"
)

// seedCredentialPool points utils' config dir at a temp folder, mocks the OS
// keyring, and writes the given profiles into the global pool.
func seedCredentialPool(t *testing.T, profiles ...*models.ConnectionProfile) {
	t.Helper()
	temp := t.TempDir()
	t.Setenv("APPDATA", temp)
	t.Setenv("XDG_CONFIG_HOME", temp)
	t.Setenv("HOME", temp)
	keyring.MockInit()
	if err := utils.SaveConnections(profiles); err != nil {
		t.Fatalf("seed pool: %v", err)
	}
}

// credentialProfile fixes ID == name for test determinism — SaveConnection's
// upsert matches by ID, so an "edit" that's meant to hit the same pooled
// connection across seed + save calls needs a stable one (real callers get
// a uuid via SaveConnection's own blank-ID assignment).
func credentialProfile(name, password string, savePassword bool) *models.ConnectionProfile {
	return &models.ConnectionProfile{
		ID:              name,
		Name:            name,
		Driver:          "postgres",
		Host:            "db.example.com",
		Port:            5432,
		DBName:          "postgres",
		Username:        "postgres",
		Password:        password,
		SavePassword:    savePassword,
		EncryptPassword: savePassword,
	}
}

func loadPooled(t *testing.T, name string) *models.ConnectionProfile {
	t.Helper()
	pool, err := utils.LoadConnections()
	if err != nil {
		t.Fatalf("LoadConnections: %v", err)
	}
	for _, profile := range pool {
		if profile.Name == name {
			return profile
		}
	}
	t.Fatalf("connection %q not in pool", name)
	return nil
}

// Editing a connection whose password was not hydrated into the form must not
// wipe the stored secret — that left every project environment bound to it
// failing with "password authentication failed".
func TestSaveConnectionKeepsStoredPasswordWhenIncomingIsBlank(t *testing.T) {
	seedCredentialPool(t, credentialProfile("prod", "s3cr3t", true))
	svc := newLifecycleTestServiceForTest(&connState{})

	edited := *credentialProfile("prod", "", true)
	edited.DBName = "goc_sua_prod"
	if err := svc.SaveConnection(edited); err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}

	saved := loadPooled(t, "prod")
	if saved.Password != "s3cr3t" {
		t.Fatalf("password = %q; want the stored secret preserved", saved.Password)
	}
	if saved.DBName != "goc_sua_prod" {
		t.Fatalf("db_name = %q; want the edit applied", saved.DBName)
	}
}

func TestSaveConnectionHonoursExplicitPasswordChange(t *testing.T) {
	seedCredentialPool(t, credentialProfile("prod", "s3cr3t", true))
	svc := newLifecycleTestServiceForTest(&connState{})

	if err := svc.SaveConnection(*credentialProfile("prod", "rotated", true)); err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}

	if saved := loadPooled(t, "prod"); saved.Password != "rotated" {
		t.Fatalf("password = %q; want %q", saved.Password, "rotated")
	}
}

func TestSaveConnectionForgetsPasswordWhenSavePasswordOff(t *testing.T) {
	seedCredentialPool(t, credentialProfile("prod", "s3cr3t", true))
	svc := newLifecycleTestServiceForTest(&connState{})

	if err := svc.SaveConnection(*credentialProfile("prod", "s3cr3t", false)); err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}

	saved := loadPooled(t, "prod")
	if saved.Password != "" || saved.SavePassword {
		t.Fatalf("profile = %+v; want the password forgotten", saved)
	}
	if _, err := keyring.Get("zentro", "prod"); err == nil {
		t.Fatalf("expected the keyring secret to be deleted")
	}
}

// Bundles and external-tool imports are credential-free by design, so an
// import landing on an existing name must keep that connection's credentials.
func TestCarryOverPooledCredentials(t *testing.T) {
	seedCredentialPool(t, credentialProfile("prod", "s3cr3t", true))

	imported := carryOverPooledCredentials([]models.ConnectionProfile{
		// sanitizeExportProfile's shape: no secret, flags cleared.
		{Name: "prod", Driver: "postgres", Host: "db.example.com", Port: 5432, Username: "postgres"},
		{Name: "brand-new", Driver: "postgres", Host: "other.example.com", Port: 5432},
	})

	if imported[0].Password != "s3cr3t" || !imported[0].SavePassword {
		t.Fatalf("colliding import = %+v; want the pooled credentials carried over", imported[0])
	}
	if imported[1].Password != "" || imported[1].SavePassword {
		t.Fatalf("new import = %+v; want it left untouched", imported[1])
	}
}

func TestCarryOverPooledCredentialsKeepsImportedPassword(t *testing.T) {
	seedCredentialPool(t, credentialProfile("prod", "s3cr3t", true))

	imported := carryOverPooledCredentials([]models.ConnectionProfile{
		*credentialProfile("prod", "from-file", true),
	})

	if imported[0].Password != "from-file" {
		t.Fatalf("password = %q; want the imported one to win", imported[0].Password)
	}
}
