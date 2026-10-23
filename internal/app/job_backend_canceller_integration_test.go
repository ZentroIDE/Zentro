// SPDX-License-Identifier: GPL-3.0-only

package app

// Integration coverage for the BackendCanceller wiring added in
// query_batch.go/query_execution.go: query_batch.go pins a *sql.Conn per
// statement and captures a backend id whenever the active driver
// implements driver.BackendCanceller, CancelQuery nudges the server with
// force=false, and App.KillJob force-kills with force=true. A fake driver
// stands in for Postgres/MySQL/MSSQL here since there's no real server in
// these tests — see driver-level backend_canceller_test.go in each real
// driver package for the id-parsing/SQL-text unit tests, and the plan's
// manual verification steps for testing this against a real server.

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"testing"
	"time"

	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

type fakeCancelCall struct {
	id    string
	force bool
}

// fakeBackendCancellerDriver embeds a real sqlite driver (so ordinary query
// execution — Open, FetchSchema, etc. — still works against the tests'
// real in-memory sqlite *sql.DB) but also implements
// driver.BackendCanceller with synthetic ids, so it never needs to run a
// real Postgres/MySQL/MSSQL-specific query. Instances are keyed by a
// unique Name() and registered into the shared core registry (see
// TestMain in main_test.go, which registers the real drivers the same
// way) — safe here since tests run sequentially, not in parallel.
type fakeBackendCancellerDriver struct {
	*sqlite.SQLiteDriver
	name string

	mu          sync.Mutex
	nextID      int64
	cancelCalls []fakeCancelCall
}

func newFakeBackendCancellerDriver(name string) *fakeBackendCancellerDriver {
	return &fakeBackendCancellerDriver{SQLiteDriver: sqlite.New(), name: name}
}

func (f *fakeBackendCancellerDriver) Name() string { return f.name }

func (f *fakeBackendCancellerDriver) BackendID(ctx context.Context, conn *sql.Conn) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	return fmt.Sprintf("backend-%d", f.nextID), nil
}

func (f *fakeBackendCancellerDriver) CancelBackend(ctx context.Context, db *sql.DB, id string, force bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cancelCalls = append(f.cancelCalls, fakeCancelCall{id: id, force: force})
	return nil
}

func (f *fakeBackendCancellerDriver) calls() []fakeCancelCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakeCancelCall, len(f.cancelCalls))
	copy(out, f.cancelCalls)
	return out
}

// fakeBackendCancellerDriverName is deliberately lowercase, matching every
// real driver name (core.Get is called both case-insensitively, via
// strings.ToLower, by backendCanceller/sessionDialect, and verbatim by
// internal/db's schema helpers) — a mixed-case name would resolve
// inconsistently between the two call styles and misrepresent how a real
// driver name (always lowercase) behaves.
const fakeBackendCancellerDriverName = "fakebackend"

// setupAppWithFakeCanceller wires setupApp's App to a registered
// fakeBackendCancellerDriver via a.profile. It also raises the test db's
// pool above setupApp's default single connection: once a statement pins
// a *sql.Conn for the whole run (see prepareExecutor), streamSelect's own
// primary-key lookup needs a second, separate connection from the same
// pool — real Postgres/MySQL/MSSQL pools have plenty of headroom for that,
// but setupApp's SetMaxOpenConns(1) (needed elsewhere so sqlite's
// :memory: per-connection isolation doesn't hide seeded tables) would
// make that lookup block for its own 5s timeout instead.
func setupAppWithFakeCanceller(t *testing.T) (*App, *fakeBackendCancellerDriver) {
	t.Helper()
	a := setupApp(t)
	a.db.SetMaxOpenConns(2)
	fake := newFakeBackendCancellerDriver(fakeBackendCancellerDriverName)
	core.Register(fake)
	a.profile = &models.ConnectionProfile{
		Name:   "fake-profile",
		Driver: fake.Name(),
		DBName: "fake-db",
	}
	return a, fake
}

func waitForJobStatus(t *testing.T, a *App, isDone func(Job) bool, timeout time.Duration) *Job {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, j := range a.ListJobs() {
			if isDone(*j) {
				return j
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("timed out waiting for job status")
	return nil
}

func TestExecuteQuery_CapturesBackendIDAndEnablesKill(t *testing.T) {
	a, _ := setupAppWithFakeCanceller(t)
	defer a.db.Close()

	doneChan := make(chan struct{})
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, _ any) {
		if eventName == "query:done" {
			close(doneChan)
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	a.ExecuteQuery("fake-canceller-tab", "SELECT 1")

	select {
	case <-doneChan:
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	job := waitForJobStatus(t, a, func(j Job) bool { return j.Status != JobStatusRunning }, time.Second)
	if job.Status != JobStatusSucceeded {
		t.Fatalf("status = %q, want %q", job.Status, JobStatusSucceeded)
	}
	if job.BackendID == "" {
		t.Error("expected BackendID to be captured from the fake BackendCanceller")
	}
}

func TestCancelQuery_NudgesBackendWithSoftCancel(t *testing.T) {
	a, fake := setupAppWithFakeCanceller(t)
	defer a.db.Close()

	doneChan := make(chan struct{}, 1)
	var mu sync.Mutex
	var chunkSeen bool
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, _ any) {
		switch eventName {
		case "query:chunk":
			mu.Lock()
			already := chunkSeen
			chunkSeen = true
			mu.Unlock()
			if !already {
				a.CancelQuery("fake-canceller-cancel-tab")
			}
		case "query:done":
			doneChan <- struct{}{}
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em
	a.prefs.ChunkSize = 10

	query := `WITH RECURSIVE cnt(x) AS (
		SELECT 1
		UNION ALL
		SELECT x+1 FROM cnt
		LIMIT 100000
	)
	SELECT x FROM cnt;`
	a.ExecuteQuery("fake-canceller-cancel-tab", query)

	select {
	case <-doneChan:
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	waitForJobStatus(t, a, func(j Job) bool { return j.Status == JobStatusCancelled }, time.Second)

	calls := fake.calls()
	if len(calls) == 0 {
		t.Fatal("expected CancelBackend to be called")
	}
	last := calls[len(calls)-1]
	if last.force {
		t.Errorf("expected CancelQuery to call CancelBackend with force=false, got force=%v", last.force)
	}
	if last.id == "" {
		t.Error("expected a non-empty backend id")
	}
}

func TestKillJob_ForceKillsBackendAndCancelsJob(t *testing.T) {
	a, fake := setupAppWithFakeCanceller(t)
	defer a.db.Close()

	doneChan := make(chan struct{}, 1)
	var mu sync.Mutex
	var chunkSeen bool
	var jobID string
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, _ any) {
		switch eventName {
		case "query:chunk":
			mu.Lock()
			already := chunkSeen
			chunkSeen = true
			mu.Unlock()
			if already {
				return
			}
			for _, j := range a.ListJobs() {
				if j.Status == JobStatusRunning {
					jobID = j.ID
				}
			}
			if jobID != "" {
				if err := a.KillJob(jobID); err != nil {
					t.Errorf("KillJob: %v", err)
				}
			}
		case "query:done":
			doneChan <- struct{}{}
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em
	a.prefs.ChunkSize = 10

	query := `WITH RECURSIVE cnt(x) AS (
		SELECT 1
		UNION ALL
		SELECT x+1 FROM cnt
		LIMIT 100000
	)
	SELECT x FROM cnt;`
	a.ExecuteQuery("fake-canceller-kill-tab", query)

	select {
	case <-doneChan:
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	if jobID == "" {
		t.Fatal("expected to observe a running job before it finished")
	}
	waitForJobStatus(t, a, func(j Job) bool { return j.ID == jobID && j.Status == JobStatusCancelled }, time.Second)

	calls := fake.calls()
	var sawForceKill bool
	for _, c := range calls {
		if c.force {
			sawForceKill = true
		}
	}
	if !sawForceKill {
		t.Errorf("expected at least one CancelBackend call with force=true, got %+v", calls)
	}
}

func TestSQLite_NeverEnablesKillCapability(t *testing.T) {
	// SQLite has no BackendCanceller implementation (no server to signal),
	// so a query job's Capabilities.Kill must stay false — this is the
	// regression guard for prepareExecutor's pin condition accidentally
	// widening to drivers with no canceller.
	a := setupApp(t) // getDriver() returns "" here — same effective path as sqlite
	defer a.db.Close()

	doneChan := make(chan struct{})
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, _ any) {
		if eventName == "query:done" {
			close(doneChan)
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	a.ExecuteQuery("sqlite-no-kill-tab", "SELECT 1")

	select {
	case <-doneChan:
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	job := waitForJobStatus(t, a, func(j Job) bool { return j.Status != JobStatusRunning }, time.Second)
	if job.Capabilities.Kill {
		t.Error("expected Capabilities.Kill to stay false without a BackendCanceller")
	}
	if job.BackendID != "" {
		t.Errorf("expected no BackendID without a BackendCanceller, got %q", job.BackendID)
	}
}
