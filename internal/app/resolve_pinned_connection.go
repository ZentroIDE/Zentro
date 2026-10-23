// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"database/sql"

	dbpkg "zentro/internal/db"
	"zentro/internal/models"
)

// resolvePinnedConnection resolves the connection profile and *sql.DB a
// schema-editor call scoped to a Table/Catalog tab's Pinned Environment
// (ADR-0001, docs/adr/0001-pinned-environment-context-for-data-tabs.md)
// should use: the pool's already-pinned connection when one exists, a
// temporary connection otherwise, or the ambient a.profile/a.db when
// connectionID is empty (callers not scoped to a pinned tab).
//
// dbName is the tab's actual pinned database, always — never the resolved
// profile's own (optional, bootstrap-only) DBName. Using the profile's
// DBName here was the bug: two tabs pinned to the same connection but
// different databases would both silently open/reuse the connection's own
// bootstrap database instead of their own.
//
// The returned release func must always be called — a no-op for the
// ambient and pooled cases, closing the temporary connection otherwise.
func (a *App) resolvePinnedConnection(connectionID, dbName string) (*models.ConnectionProfile, *sql.DB, func(), error) {
	if connectionID == "" {
		return a.profile, a.db, func() {}, nil
	}

	profile, err := a.resolveConnectionProfileByID(connectionID)
	if err != nil {
		return nil, nil, nil, err
	}
	if dbName != "" {
		clone := *profile
		clone.DBName = dbName
		profile = &clone
	}

	if a.connPool != nil {
		if db, ok := a.connPool.Lookup(connectionID, dbName); ok {
			return profile, db, func() {}, nil
		}
	}

	db, err := dbpkg.OpenConnection(profile)
	if err != nil {
		return nil, nil, nil, dbpkg.FriendlyError(profile.Driver, err)
	}
	return profile, db, func() { _ = db.Close() }, nil
}
