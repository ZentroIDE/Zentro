// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"strings"

	"github.com/google/uuid"
)

// MigrateConnectionIDs is a one-shot startup migration that assigns a
// stable ID to every pool connection that predates it (ConnectionProfile.ID
// didn't exist before), moves that connection's keyring secret from the old
// Name-keyed slot to the new ID-keyed one, and rewrites every project's
// ProjectEnvironment.ConnectionRef from the old Name to the new ID.
//
// Renaming a connection used to orphan every project bound to it and its
// stored password; ID is the identity now, Name is display-only.
//
// Idempotent: the trigger is "any pool connection still has an empty ID",
// which is only ever true before this migration runs. Must run after
// MigratePooledConnections (which is what first populates the pool) and
// before MigrateEnvironmentDatabases (which reads ConnectionRef as an ID).
//
// loadConfig's own password hydration already skips the ID-keyed keyring
// lookup for a blank ID (see prefs.go), so LoadConnections here returns
// profiles with Password == "" for exactly the ones this migration needs to
// touch — the old secret is read directly, by the old Name key, below.
func MigrateConnectionIDs() error {
	profiles, err := LoadConnections()
	if err != nil {
		return err
	}

	renamed := make(map[string]string, len(profiles)) // old Name -> new ID
	for _, p := range profiles {
		if p == nil || strings.TrimSpace(p.ID) != "" {
			continue
		}
		oldName := p.Name
		newID := uuid.NewString()

		if p.SavePassword {
			if secret, gerr := GetPassword(oldName); gerr == nil && secret != "" {
				if serr := StorePassword(newID, secret); serr == nil {
					_ = DeletePassword(oldName)
				}
			}
		}

		p.ID = newID
		if oldName != "" {
			renamed[oldName] = newID
		}
	}
	if len(renamed) == 0 {
		return nil
	}

	if err := SaveConnections(profiles); err != nil {
		return err
	}

	projects, err := LoadProjects()
	if err != nil {
		return err
	}
	for _, project := range projects {
		if project == nil {
			continue
		}
		changed := false
		for i := range project.Environments {
			env := &project.Environments[i]
			if newID, ok := renamed[env.ConnectionRef]; ok {
				env.ConnectionRef = newID
				changed = true
			}
		}
		if changed {
			if err := UpsertProject(project); err != nil {
				return err
			}
		}
	}

	return nil
}

// MigrateEnvironmentDatabases is a one-shot startup migration that backfills
// ProjectEnvironment.LastDatabase from the referenced pool connection's
// (bootstrap) DBName, for every environment that has a ConnectionRef but no
// LastDatabase yet.
//
// ConnectProjectEnvironment used to fall back to the pool connection's own
// DBName whenever LastDatabase was empty — silently connecting to whatever
// database the pool profile happened to carry, not the database the project
// actually meant to bind. That fallback is gone (an environment with no
// LastDatabase is now simply unbound), so this migration captures the
// database each such environment was actually resolving to before the
// fallback disappears, rather than leaving previously-working environments
// suddenly unbound.
//
// Idempotent: re-run is a no-op once every ConnectionRef'd environment has a
// LastDatabase. Independent trigger from MigrateConnectionIDs, safe to run
// on every startup — must run after it, since it reads ConnectionRef as an
// ID.
func MigrateEnvironmentDatabases() error {
	projects, err := LoadProjects()
	if err != nil {
		return err
	}

	pool, err := LoadConnections()
	if err != nil {
		return err
	}
	dbNameByID := make(map[string]string, len(pool))
	for _, p := range pool {
		if p != nil && strings.TrimSpace(p.ID) != "" {
			dbNameByID[p.ID] = p.DBName
		}
	}

	for _, project := range projects {
		if project == nil {
			continue
		}
		changed := false
		for i := range project.Environments {
			env := &project.Environments[i]
			ref := strings.TrimSpace(env.ConnectionRef)
			if ref == "" || strings.TrimSpace(env.LastDatabase) != "" {
				continue
			}
			if db := strings.TrimSpace(dbNameByID[ref]); db != "" {
				env.LastDatabase = db
				changed = true
			}
		}
		if changed {
			if err := UpsertProject(project); err != nil {
				return err
			}
		}
	}

	return nil
}
