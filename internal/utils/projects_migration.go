// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"zentro/internal/models"
)

// MigratePooledConnections is a one-shot startup migration that moves every
// project's embedded ProjectConnection into the single global connection pool
// (config.json > connections) and rewrites each project so its environments
// only reference a pool connection by Name (ProjectEnvironment.ConnectionRef)
// plus the bound database (ProjectEnvironment.LastDatabase).
//
// It is idempotent: the trigger is "any project still carries a non-empty
// Connections slice", which is only ever true before the migration runs.
// Connections are de-duplicated across all projects by a
// driver|host|port|db|user fingerprint. Passwords stored under the legacy
// per-connection keyring key ("project-connection:<id>") are carried over to
// the pool's name-keyed secret and the old key is deleted.
func MigratePooledConnections() error {
	projects, err := LoadProjects()
	if err != nil {
		return err
	}

	needsMigration := false
	for _, project := range projects {
		if project != nil && len(project.Connections) > 0 {
			needsMigration = true
			break
		}
	}
	if !needsMigration {
		return nil
	}

	pool, err := LoadConnections()
	if err != nil {
		return err
	}

	fingerprintToName := make(map[string]string, len(pool))
	namesInUse := make(map[string]bool, len(pool))
	for _, profile := range pool {
		if profile == nil {
			continue
		}
		namesInUse[profile.Name] = true
		fingerprintToName[connectionFingerprint(profile)] = profile.Name
	}

	for _, project := range projects {
		if project == nil || len(project.Connections) == 0 {
			continue
		}

		for _, legacy := range project.Connections {
			profile := legacyConnectionToProfile(legacy)
			if profile.Name == "" && strings.TrimSpace(profile.Host) == "" {
				continue
			}

			fingerprint := connectionFingerprint(profile)
			name, exists := fingerprintToName[fingerprint]
			if !exists {
				name = uniqueConnectionName(profile.Name, namesInUse)
				profile.Name = name
				if profile.SavePassword && strings.TrimSpace(legacy.ID) != "" {
					if secret, gerr := GetPassword(projectConnectionSecretKey(legacy.ID)); gerr == nil && secret != "" {
						// Leave populated — SaveConnections moves it to the
						// pool's name-keyed keyring secret.
						profile.Password = secret
					}
				}
				pool = append(pool, profile)
				fingerprintToName[fingerprint] = name
				namesInUse[name] = true
			}

			if strings.TrimSpace(legacy.ID) != "" {
				_ = DeletePassword(projectConnectionSecretKey(legacy.ID))
			}

			if legacy.EnvironmentKey == "" {
				continue
			}
			for i := range project.Environments {
				env := &project.Environments[i]
				if env.Key != legacy.EnvironmentKey {
					continue
				}
				env.ConnectionRef = name
				if strings.TrimSpace(env.LastDatabase) == "" {
					db := strings.TrimSpace(legacy.Database)
					if db == "" {
						db = strings.TrimSpace(legacy.AdvancedMeta["db_name"])
					}
					env.LastDatabase = db
				}
			}
		}

		project.Connections = nil
		if uerr := UpsertProject(project); uerr != nil {
			return uerr
		}
	}

	return SaveConnections(pool)
}

// legacyConnectionToProfile mirrors the app package's projectConnectionToProfile
// mapping, kept here so the migration does not depend on the app package.
func legacyConnectionToProfile(c models.ProjectConnection) *models.ConnectionProfile {
	name := strings.TrimSpace(c.Name)
	if name == "" {
		name = strings.TrimSpace(c.AdvancedMeta["profile_name"])
	}
	db := strings.TrimSpace(c.Database)
	if db == "" {
		db = strings.TrimSpace(c.AdvancedMeta["db_name"])
	}
	return &models.ConnectionProfile{
		Name:            name,
		Driver:          c.Driver,
		Host:            c.Host,
		Port:            c.Port,
		DBName:          db,
		Username:        c.Username,
		Password:        c.Password,
		SSLMode:         c.SSLMode,
		ConnectTimeout:  30,
		SavePassword:    c.SavePassword,
		EncryptPassword: legacyBoolFromMeta(c.AdvancedMeta, "encrypt_password", true),
		ShowAllSchemas:  legacyBoolFromMeta(c.AdvancedMeta, "show_all_schemas", false),
		TrustServerCert: legacyBoolFromMeta(c.AdvancedMeta, "trust_server_cert", false),
	}
}

func connectionFingerprint(p *models.ConnectionProfile) string {
	return strings.ToLower(strings.TrimSpace(p.Driver)) + "|" +
		strings.ToLower(strings.TrimSpace(p.Host)) + "|" +
		strconv.Itoa(p.Port) + "|" +
		strings.ToLower(strings.TrimSpace(p.DBName)) + "|" +
		strings.ToLower(strings.TrimSpace(p.Username))
}

func uniqueConnectionName(base string, inUse map[string]bool) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "Imported connection"
	}
	if !inUse[base] {
		return base
	}
	for i := 2; i < 1000; i++ {
		candidate := fmt.Sprintf("%s (%d)", base, i)
		if !inUse[candidate] {
			return candidate
		}
	}
	return base + " " + uuid.NewString()[:8]
}

func legacyBoolFromMeta(meta map[string]string, key string, fallback bool) bool {
	if meta == nil {
		return fallback
	}
	raw, ok := meta[key]
	if !ok || raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return value
}
