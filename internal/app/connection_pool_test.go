// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"testing"

	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

func TestConnectionPool_PinTwice_SameKey_SharesConnectionAndRefCounts(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-shared", openDB: setupTestDB(t)}
	core.Register(fake)

	pool := NewConnectionPool(8)
	resolve := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "p1", Driver: fake.name, DBName: "db1"}, nil
	}

	db1, err := pool.Pin(context.Background(), "p1", "db1", resolve)
	if err != nil {
		t.Fatalf("first Pin: unexpected error: %v", err)
	}
	db2, err := pool.Pin(context.Background(), "p1", "db1", resolve)
	if err != nil {
		t.Fatalf("second Pin: unexpected error: %v", err)
	}
	if db1 != db2 {
		t.Fatalf("expected the second Pin of the same key to reuse the same *sql.DB")
	}

	// Unpin once: still referenced, Lookup must keep returning it.
	pool.Unpin("p1", "db1")
	if got, ok := pool.Lookup("p1", "db1"); !ok || got != db1 {
		t.Fatalf("expected connection to remain pinned after one Unpin, got ok=%v", ok)
	}

	// Unpin again: refcount hits zero, connection is closed and evicted.
	pool.Unpin("p1", "db1")
	if _, ok := pool.Lookup("p1", "db1"); ok {
		t.Fatalf("expected connection to be evicted after matching Unpin count")
	}
	if err := db1.Ping(); err == nil {
		t.Fatalf("expected underlying db to be closed after refcount reached zero")
	}
}

func TestConnectionPool_TwoDifferentKeys_StayIndependent(t *testing.T) {
	fakeA := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-a", openDB: setupTestDB(t)}
	fakeB := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-b", openDB: setupTestDB(t)}
	core.Register(fakeA)
	core.Register(fakeB)

	pool := NewConnectionPool(8)
	resolveA := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "dev", Driver: fakeA.name, DBName: "db1"}, nil
	}
	resolveB := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "staging", Driver: fakeB.name, DBName: "db1"}, nil
	}

	dbA, err := pool.Pin(context.Background(), "dev", "db1", resolveA)
	if err != nil {
		t.Fatalf("Pin dev: unexpected error: %v", err)
	}
	dbB, err := pool.Pin(context.Background(), "staging", "db1", resolveB)
	if err != nil {
		t.Fatalf("Pin staging: unexpected error: %v", err)
	}
	if dbA == dbB {
		t.Fatalf("expected two distinct pinned keys to get two distinct connections")
	}

	// A query against the "dev" key's connection must never reach "staging"'s
	// connection, and vice versa — Unpinning one must not affect the other.
	pool.Unpin("dev", "db1")
	if _, ok := pool.Lookup("dev", "db1"); ok {
		t.Fatalf("expected dev connection to be evicted")
	}
	if got, ok := pool.Lookup("staging", "db1"); !ok || got != dbB {
		t.Fatalf("expected staging connection to remain untouched by dev's Unpin")
	}
}

func TestConnectionPool_MaxSize_EvictsIdleBeforeRejecting(t *testing.T) {
	fakeA := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-evict-a", openDB: setupTestDB(t)}
	fakeB := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-evict-b", openDB: setupTestDB(t)}
	core.Register(fakeA)
	core.Register(fakeB)

	pool := NewConnectionPool(1)
	resolveA := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "a", Driver: fakeA.name, DBName: "db1"}, nil
	}
	resolveB := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "b", Driver: fakeB.name, DBName: "db1"}, nil
	}

	if _, err := pool.Pin(context.Background(), "a", "db1", resolveA); err != nil {
		t.Fatalf("Pin a: unexpected error: %v", err)
	}
	pool.Unpin("a", "db1") // now idle (refCount 0) but still cached

	// Pinning "b" at maxSize=1 must evict idle "a" rather than reject.
	if _, err := pool.Pin(context.Background(), "b", "db1", resolveB); err != nil {
		t.Fatalf("expected idle eviction to make room for b, got error: %v", err)
	}
	if _, ok := pool.Lookup("a", "db1"); ok {
		t.Fatalf("expected a to have been evicted to make room for b")
	}
}

func TestConnectionPool_MaxSize_RejectsWhenNoIdleToEvict(t *testing.T) {
	fakeA := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-reject-a", openDB: setupTestDB(t)}
	fakeB := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-reject-b", openDB: setupTestDB(t)}
	core.Register(fakeA)
	core.Register(fakeB)

	pool := NewConnectionPool(1)
	resolveA := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "a", Driver: fakeA.name, DBName: "db1"}, nil
	}
	resolveB := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "b", Driver: fakeB.name, DBName: "db1"}, nil
	}

	if _, err := pool.Pin(context.Background(), "a", "db1", resolveA); err != nil {
		t.Fatalf("Pin a: unexpected error: %v", err)
	}
	// "a" is still referenced (no Unpin) — pinning "b" at maxSize=1 must fail.
	if _, err := pool.Pin(context.Background(), "b", "db1", resolveB); err == nil {
		t.Fatalf("expected Pin to fail when the pool is full and nothing is idle")
	}
}

func TestConnectionPool_CloseAll_ClosesRegardlessOfRefCount(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-pool-closeall", openDB: setupTestDB(t)}
	core.Register(fake)

	pool := NewConnectionPool(8)
	resolve := func() (*models.ConnectionProfile, error) {
		return &models.ConnectionProfile{Name: "p1", Driver: fake.name, DBName: "db1"}, nil
	}

	db, err := pool.Pin(context.Background(), "p1", "db1", resolve)
	if err != nil {
		t.Fatalf("Pin: unexpected error: %v", err)
	}

	pool.CloseAll()

	if err := db.Ping(); err == nil {
		t.Fatalf("expected connection to be closed after CloseAll")
	}
	if _, ok := pool.Lookup("p1", "db1"); ok {
		t.Fatalf("expected pool to be empty after CloseAll")
	}
}
