// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	dbpkg "zentro/internal/db"
	"zentro/internal/models"
)

// defaultMaxPooledConnections is used until Preferences.MaxPooledConnections
// is loaded in Startup (NewApp runs before prefs are read from disk).
const defaultMaxPooledConnections = 8

type pooledConn struct {
	db       *sql.DB
	profile  *models.ConnectionProfile
	refCount int
}

// ConnectionPool holds multiple live, concurrently-open *sql.DB handles,
// keyed by profileName+dbName, so a pinned Table/Catalog tab (see ADR-0001,
// docs/adr/0001-pinned-environment-context-for-data-tabs.md) keeps working
// against its own Pinned Environment after App.db has moved on to a
// different Active Environment. Additive alongside the ambient App.db/
// swapConnection path used by Query tabs — this pool never touches those.
//
// Ref-counted per pinned tab, not per statement: callers Pin once when a
// tab opens and Unpin once when it closes. Calls during the tab's life
// should use Lookup against the already-open handle instead of
// re-Pinning.
type ConnectionPool struct {
	mu      sync.Mutex
	conns   map[string]*pooledConn
	maxSize int
}

func NewConnectionPool(maxSize int) *ConnectionPool {
	if maxSize <= 0 {
		maxSize = defaultMaxPooledConnections
	}
	return &ConnectionPool{
		conns:   make(map[string]*pooledConn),
		maxSize: maxSize,
	}
}

func poolKey(profileName, dbName string) string {
	return profileName + ":" + dbName
}

// SetMaxSize adjusts the pool's capacity cap (e.g. once Preferences load
// after NewApp constructs the pool with the package default). Does not
// evict existing connections even if shrinking below the current count.
func (p *ConnectionPool) SetMaxSize(maxSize int) {
	if maxSize <= 0 {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.maxSize = maxSize
}

// Pin opens (on first reference) and increments the ref count for
// profileName/dbName, returning the pooled *sql.DB. resolveProfile is
// called only on a cache miss, and should reuse the same
// projectConnectionToProfile + password-rehydration path as the rest of the
// app (see app_connection_facade.go, schema_diff_snapshot.go) rather than
// resolving the profile independently.
//
// Pin does not hold p.mu while resolving/opening the connection (both can
// block on network I/O), so two concurrent Pin calls for different keys can
// each pass the capacity check before either finishes opening — the
// maxSize cap is a soft limit under concurrent Pin, not a hard invariant.
func (p *ConnectionPool) Pin(ctx context.Context, profileName, dbName string, resolveProfile func() (*models.ConnectionProfile, error)) (*sql.DB, error) {
	key := poolKey(profileName, dbName)

	p.mu.Lock()
	if existing, ok := p.conns[key]; ok {
		existing.refCount++
		db := existing.db
		p.mu.Unlock()
		return db, nil
	}
	if len(p.conns) >= p.maxSize && !p.evictIdleLocked() {
		p.mu.Unlock()
		return nil, fmt.Errorf("connection pool: too many open environment connections (max %d) — close a table tab to free one up", p.maxSize)
	}
	p.mu.Unlock()

	profile, err := resolveProfile()
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, fmt.Errorf("connection pool: no connection profile resolved for %q", key)
	}

	db, err := dbpkg.OpenConnection(profile)
	if err != nil {
		return nil, dbpkg.FriendlyError(profile.Driver, err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, dbpkg.FriendlyError(profile.Driver, err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	// A concurrent Pin for the same key may have won the race while this
	// call was resolving/opening — reuse the winner's connection and close
	// the redundant one rather than leaking it.
	if existing, ok := p.conns[key]; ok {
		existing.refCount++
		_ = db.Close()
		return existing.db, nil
	}
	p.conns[key] = &pooledConn{db: db, profile: profile, refCount: 1}
	return db, nil
}

// Unpin decrements the ref count for profileName/dbName, closing and
// evicting the connection once it reaches zero. A no-op if the key isn't
// pinned (e.g. Pin failed earlier, or double-Unpin from a buggy caller).
func (p *ConnectionPool) Unpin(profileName, dbName string) {
	key := poolKey(profileName, dbName)
	p.mu.Lock()
	defer p.mu.Unlock()
	existing, ok := p.conns[key]
	if !ok {
		return
	}
	existing.refCount--
	if existing.refCount <= 0 {
		_ = existing.db.Close()
		delete(p.conns, key)
	}
}

// Lookup returns the already-pinned *sql.DB for profileName/dbName without
// touching the ref count. Used by query/schema calls during a pinned tab's
// life, after Pin has already happened once at tab-open time.
func (p *ConnectionPool) Lookup(profileName, dbName string) (*sql.DB, bool) {
	key := poolKey(profileName, dbName)
	p.mu.Lock()
	defer p.mu.Unlock()
	existing, ok := p.conns[key]
	if !ok {
		return nil, false
	}
	return existing.db, true
}

// Driver returns the driver name of the pinned connection for
// profileName/dbName, if any — used to route a pinned query/schema call
// through the right dialect (see driver.QueryDialect) without a second
// profile lookup.
func (p *ConnectionPool) Driver(profileName, dbName string) (string, bool) {
	key := poolKey(profileName, dbName)
	p.mu.Lock()
	defer p.mu.Unlock()
	existing, ok := p.conns[key]
	if !ok || existing.profile == nil {
		return "", false
	}
	return existing.profile.Driver, true
}

// evictIdleLocked closes and removes one connection with refCount == 0, if
// any exists. Caller must hold p.mu.
func (p *ConnectionPool) evictIdleLocked() bool {
	for key, conn := range p.conns {
		if conn.refCount == 0 {
			_ = conn.db.Close()
			delete(p.conns, key)
			return true
		}
	}
	return false
}

// CloseAll closes every pooled connection regardless of ref count. Called
// from App.Shutdown.
func (p *ConnectionPool) CloseAll() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, conn := range p.conns {
		_ = conn.db.Close()
		delete(p.conns, key)
	}
}
