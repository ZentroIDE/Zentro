// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"testing"

	"github.com/zalando/go-keyring"

	"zentro/internal/models"
)

func seedMigrationEnv(t *testing.T) {
	t.Helper()
	temp := t.TempDir()
	t.Setenv("APPDATA", temp)
	t.Setenv("XDG_CONFIG_HOME", temp)
	t.Setenv("HOME", temp)
	keyring.MockInit()
}

func legacyProjectWithConnection(name string, connID string, envKey models.EnvironmentKey) *models.Project {
	project := models.NewProject(name)
	project.Environments = []models.ProjectEnvironment{
		models.NewProjectEnvironment(project.ID, envKey),
	}
	project.DefaultEnvironmentKey = envKey
	project.LastActiveEnvironmentKey = envKey
	project.Connections = []models.ProjectConnection{
		{
			ID:             connID,
			ProjectID:      project.ID,
			EnvironmentKey: envKey,
			Name:           "Shared PG",
			Driver:         "postgres",
			Host:           "db.example.com",
			Port:           5432,
			Database:       "app",
			Username:       "svc",
			SavePassword:   true,
			AdvancedMeta:   map[string]string{"profile_name": "Shared PG", "db_name": "app"},
		},
	}
	return project
}

func TestMigratePooledConnections_DeduplicatesAndRewritesProjects(t *testing.T) {
	seedMigrationEnv(t)

	// Two projects that point at the exact same server/db/user.
	p1 := legacyProjectWithConnection("Alpha", "conn-1", models.EnvironmentDevelopment)
	p2 := legacyProjectWithConnection("Beta", "conn-2", models.EnvironmentProduction)
	_ = keyring.Set(keyringService, projectConnectionSecretKey("conn-1"), "s3cr3t")

	if err := UpsertProject(p1); err != nil {
		t.Fatalf("upsert p1: %v", err)
	}
	if err := UpsertProject(p2); err != nil {
		t.Fatalf("upsert p2: %v", err)
	}

	if err := MigratePooledConnections(); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	pool, err := LoadConnections()
	if err != nil {
		t.Fatalf("load pool: %v", err)
	}
	if len(pool) != 1 {
		t.Fatalf("expected 1 pooled connection after dedup, got %d", len(pool))
	}
	if pool[0].Name != "Shared PG" || pool[0].Host != "db.example.com" || pool[0].DBName != "app" {
		t.Fatalf("unexpected pooled connection: %+v", pool[0])
	}

	// Password migrated from the legacy per-connection keyring key to the
	// pool's ID-keyed secret (MigratePooledConnections predates the ID
	// migration, so the pooled profile's ID here is a freshly assigned
	// uuid, not "Shared PG" — that's now display-only).
	if pool[0].ID == "" {
		t.Fatalf("expected pooled connection to have an assigned ID")
	}
	if pw, kerr := keyring.Get(keyringService, pool[0].ID); kerr != nil || pw != "s3cr3t" {
		t.Fatalf("expected pool password 's3cr3t', got %q err=%v", pw, kerr)
	}
	if _, kerr := keyring.Get(keyringService, projectConnectionSecretKey("conn-1")); kerr == nil {
		t.Fatalf("expected legacy keyring key to be deleted")
	}

	projects, err := LoadProjects()
	if err != nil {
		t.Fatalf("load projects: %v", err)
	}
	if len(projects) != 2 {
		t.Fatalf("expected 2 projects, got %d", len(projects))
	}
	for _, project := range projects {
		if len(project.Connections) != 0 {
			t.Fatalf("project %q still carries embedded connections", project.Name)
		}
		if len(project.Environments) == 0 {
			t.Fatalf("project %q lost its environments", project.Name)
		}
		env := project.Environments[0]
		if env.ConnectionRef != "Shared PG" {
			t.Fatalf("project %q env %q: connection_ref = %q, want %q", project.Name, env.Key, env.ConnectionRef, "Shared PG")
		}
		if env.LastDatabase != "app" {
			t.Fatalf("project %q env %q: last_database = %q, want %q", project.Name, env.Key, env.LastDatabase, "app")
		}
	}
}

func TestMigratePooledConnections_Idempotent(t *testing.T) {
	seedMigrationEnv(t)

	p1 := legacyProjectWithConnection("Alpha", "conn-1", models.EnvironmentDevelopment)
	if err := UpsertProject(p1); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	if err := MigratePooledConnections(); err != nil {
		t.Fatalf("first migrate: %v", err)
	}
	poolAfterFirst, _ := LoadConnections()

	if err := MigratePooledConnections(); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	poolAfterSecond, _ := LoadConnections()

	if len(poolAfterFirst) != 1 || len(poolAfterSecond) != 1 {
		t.Fatalf("expected a stable single-entry pool, got %d then %d", len(poolAfterFirst), len(poolAfterSecond))
	}
}
