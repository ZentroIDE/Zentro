// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	"zentro/internal/core"
	dbpkg "zentro/internal/db"
	"zentro/internal/models"
	"zentro/internal/utils"
)

func (s *ConnectionService) LoadDatabasesForProfile(id string) ([]string, error) {
	profiles, err := utils.LoadConnections()
	if err != nil {
		return nil, err
	}

	var prof *models.ConnectionProfile
	for _, p := range profiles {
		if p.ID == id {
			prof = p
			break
		}
	}
	if prof == nil {
		return nil, fmt.Errorf("connection %q not found", id)
	}

	return s.LoadDatabasesForConnectionProfile(prof)
}

func (s *ConnectionService) LoadDatabasesForConnectionProfile(prof *models.ConnectionProfile) ([]string, error) {
	if prof == nil {
		return nil, fmt.Errorf("connection profile is required")
	}
	// Listing databases is a bootstrap-flavored operation — prof.DBName may
	// be blank (it's optional now), so resolve a maintenance database to
	// actually open the connection with.
	prof = dbpkg.WithBootstrapDatabase(prof)

	activeProfile := s.getProfile()
	activeDB := s.getDB()
	useActive := activeDB != nil && isSameConnectionTarget(activeProfile, prof)

	db := activeDB
	if !useActive {
		var err error
		db, err = dbpkg.OpenConnection(prof)
		if err != nil {
			return nil, dbpkg.FriendlyError(prof.Driver, err)
		}
		defer db.Close()
	}

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.ConnectTimeout)*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, dbpkg.FriendlyError(prof.Driver, err)
	}
	if useActive {
		s.logDBStats("load_databases_reuse_active", db, prof)
	} else {
		s.logDBStats("load_databases_temp_conn", db, prof)
	}

	dbs, err := dbpkg.FetchDatabases(db, prof.Driver, prof.DBName, prof.ShowAllSchemas, s.logger)
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(dbs)+1)
	seen := make(map[string]bool)
	if prof.DBName != "" {
		names = append(names, prof.DBName)
		seen[prof.DBName] = true
	}
	for _, d := range dbs {
		if d.Name == "" || seen[d.Name] {
			continue
		}
		names = append(names, d.Name)
		seen[d.Name] = true
	}

	return names, nil
}

// CreateDatabase creates a new database on the server behind prof, then
// returns. It always opens a short-lived bootstrap connection rather than
// reusing the active pooled connection, since the target database does not
// exist yet (or differs from the currently connected one) and CREATE DATABASE
// must run outside of it.
func (s *ConnectionService) CreateDatabase(prof *models.ConnectionProfile, dbName string) error {
	if prof == nil {
		return fmt.Errorf("connection profile is required")
	}
	dbName = strings.TrimSpace(dbName)
	if dbName == "" {
		return fmt.Errorf("database name is required")
	}

	drv, ok := core.Get(prof.Driver)
	if !ok {
		return fmt.Errorf("unsupported driver %q", prof.Driver)
	}
	maintenanceDB, err := drv.MaintenanceDBName()
	if err != nil {
		return err
	}

	bootstrapProfile := *prof
	bootstrapProfile.DBName = maintenanceDB

	bootstrapDB, err := dbpkg.OpenConnection(&bootstrapProfile)
	if err != nil {
		return dbpkg.FriendlyError(prof.Driver, err)
	}
	defer bootstrapDB.Close()

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.ConnectTimeout)*time.Second)
	defer cancel()
	if err := bootstrapDB.PingContext(ctx); err != nil {
		return dbpkg.FriendlyError(prof.Driver, err)
	}

	return dbpkg.CreateDatabase(bootstrapDB, prof.Driver, dbName)
}

func isSameConnectionTarget(active, target *models.ConnectionProfile) bool {
	if active == nil || target == nil {
		return false
	}
	// ID is the stable identity; fall back to the field-by-field comparison
	// only when either side lacks one (e.g. a profile built ad hoc, not
	// loaded from the pool).
	if strings.TrimSpace(active.ID) != "" && strings.TrimSpace(target.ID) != "" {
		return active.ID == target.ID &&
			strings.EqualFold(strings.TrimSpace(active.DBName), strings.TrimSpace(target.DBName))
	}
	return strings.EqualFold(strings.TrimSpace(active.Name), strings.TrimSpace(target.Name)) &&
		strings.EqualFold(strings.TrimSpace(active.Driver), strings.TrimSpace(target.Driver)) &&
		strings.EqualFold(strings.TrimSpace(active.Host), strings.TrimSpace(target.Host)) &&
		active.Port == target.Port &&
		strings.EqualFold(strings.TrimSpace(active.DBName), strings.TrimSpace(target.DBName)) &&
		strings.EqualFold(strings.TrimSpace(active.Username), strings.TrimSpace(target.Username))
}
