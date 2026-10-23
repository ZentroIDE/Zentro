// SPDX-License-Identifier: GPL-3.0-only

// Package db provides a Facade over the registered database drivers.
// Pattern: Facade — hides driver dispatch complexity from the UI layer.
// Pattern: Dependency Inversion — depends on core.Get (abstraction), not concrete drivers.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/models"
)

// OpenConnection opens a *sql.DB by delegating to the registered driver.
// Pattern: Facade + DI — no driver-specific imports here.
func OpenConnection(p *models.ConnectionProfile) (*sql.DB, error) {
	d, ok := core.Get(p.Driver)
	if !ok {
		return nil, fmt.Errorf("connector: unsupported driver %q", p.Driver)
	}
	db, err := d.Open(p)
	if err != nil {
		return nil, err
	}

	// Connection policy (hard-cap): keep server sessions low per app instance.
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxIdleTime(2 * time.Minute)
	db.SetConnMaxLifetime(5 * time.Minute)

	return db, nil
}

// WithBootstrapDatabase returns p unchanged when it already names a
// database, or a shallow clone with DBName filled from the driver's
// maintenance database (core.Get(p.Driver).MaintenanceDBName() — e.g.
// postgres→"postgres", mssql→"master", mysql→"" meaning no database needed)
// when it doesn't.
//
// DBName on a pool ConnectionProfile is an optional bootstrap value now —
// it never carries a project's binding — so anything that needs to actually
// open a connection without an explicit database (testing reachability,
// listing databases, creating one) must resolve one first. Real work
// connections (ConnectWithProfile/ConnectProjectEnvironment) must NOT go
// through this: an environment with no chosen database is unbound and
// should fail loudly, not silently land in the maintenance database.
func WithBootstrapDatabase(p *models.ConnectionProfile) *models.ConnectionProfile {
	if p == nil || strings.TrimSpace(p.DBName) != "" {
		return p
	}
	d, ok := core.Get(p.Driver)
	if !ok {
		return p
	}
	maintenanceDB, err := d.MaintenanceDBName()
	if err != nil || maintenanceDB == "" {
		return p
	}
	clone := *p
	clone.DBName = maintenanceDB
	return &clone
}

// TestConnection verifies a server is reachable via Ping (10s timeout).
// Bootstraps a database when the profile doesn't name one — this tests the
// server/credentials, not any particular database.
func TestConnection(p *models.ConnectionProfile) error {
	p = WithBootstrapDatabase(p)
	db, err := OpenConnection(p)
	if err != nil {
		return FriendlyError(p.Driver, err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return FriendlyError(p.Driver, err)
	}
	return nil
}

// FriendlyError translates a raw driver error to a user-facing message.
// Delegates to the driver's own error mapper; falls back to a generic message.
func FriendlyError(driverName string, err error) error {
	if err == nil {
		return nil
	}
	d, ok := core.Get(driverName)
	if !ok {
		return fmt.Errorf("connection error: %s", err.Error())
	}
	return d.FriendlyError(err)
}
