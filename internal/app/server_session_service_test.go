// SPDX-License-Identifier: GPL-3.0-only

package app

// Coverage for server_session_service.go's ListServerSessions/
// CancelServerSession/KillServerSession and the IsSelf/self-marking logic.
// A fake driver stands in for Postgres/MySQL/MSSQL — see driver-level
// session_monitor_test.go in each real driver package for the actual
// SQL/scan-mapping unit tests, and the plan's manual verification steps
// for testing this against a real server.

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"testing"
	"time"

	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

type fakeSessionMonitorDriver struct {
	*sqlite.SQLiteDriver
	name string

	mu          sync.Mutex
	sessions    []driverport.ServerSession
	listErr     error
	cancelCalls []fakeCancelCall
	cancelErr   error
}

func newFakeSessionMonitorDriver(name string) *fakeSessionMonitorDriver {
	return &fakeSessionMonitorDriver{SQLiteDriver: sqlite.New(), name: name}
}

func (f *fakeSessionMonitorDriver) Name() string { return f.name }

func (f *fakeSessionMonitorDriver) BackendID(ctx context.Context, conn *sql.Conn) (string, error) {
	return "self-backend", nil
}

func (f *fakeSessionMonitorDriver) CancelBackend(ctx context.Context, db *sql.DB, id string, force bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cancelCalls = append(f.cancelCalls, fakeCancelCall{id: id, force: force})
	return f.cancelErr
}

func (f *fakeSessionMonitorDriver) ListSessions(ctx context.Context, db *sql.DB) ([]driverport.ServerSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listErr != nil {
		return nil, f.listErr
	}
	out := make([]driverport.ServerSession, len(f.sessions))
	copy(out, f.sessions)
	return out, nil
}

func (f *fakeSessionMonitorDriver) calls() []fakeCancelCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakeCancelCall, len(f.cancelCalls))
	copy(out, f.cancelCalls)
	return out
}

const fakeSessionMonitorDriverName = "fakesessionmonitor"

func setupAppWithFakeSessionMonitor(t *testing.T) (*App, *fakeSessionMonitorDriver) {
	t.Helper()
	a := setupApp(t)
	fake := newFakeSessionMonitorDriver(fakeSessionMonitorDriverName)
	core.Register(fake)
	a.profile = &models.ConnectionProfile{
		Name:   "fake-session-profile",
		Driver: fake.Name(),
		DBName: "fake-db",
	}
	return a, fake
}

func TestListServerSessions_MarksIsSelfFromActiveBackendIDs(t *testing.T) {
	a, fake := setupAppWithFakeSessionMonitor(t)
	defer a.db.Close()

	now := time.Now()
	fake.sessions = []driverport.ServerSession{
		{ID: "100", User: "app", Database: "shop", State: "active", StartedAt: now, Query: "SELECT 1"},
		{ID: "self-backend", User: "alex", Database: "shop", State: "active", StartedAt: now, Query: "SELECT 2"},
	}
	a.svc.Query.sessions["tab-1"] = &QuerySession{TabID: "tab-1", BackendID: "self-backend"}

	views, err := a.ListServerSessions()
	if err != nil {
		t.Fatalf("ListServerSessions: %v", err)
	}
	if len(views) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(views))
	}

	var sawSelf, sawOther bool
	for _, v := range views {
		if v.ID == "self-backend" {
			sawSelf = true
			if !v.IsSelf {
				t.Error("expected session matching an active backend id to have IsSelf=true")
			}
		}
		if v.ID == "100" {
			sawOther = true
			if v.IsSelf {
				t.Error("expected unrelated session to have IsSelf=false")
			}
		}
	}
	if !sawSelf || !sawOther {
		t.Fatalf("expected both sessions represented, got %+v", views)
	}
}

func TestListServerSessions_ErrorsForDriverWithoutSessionMonitor(t *testing.T) {
	a := setupApp(t) // sqlite driver — no SessionMonitor port
	defer a.db.Close()

	if _, err := a.ListServerSessions(); err == nil {
		t.Fatal("expected an error for a driver without SessionMonitor")
	}
}

func TestCancelServerSession_CallsBackendCancellerWithSoftCancel(t *testing.T) {
	a, fake := setupAppWithFakeSessionMonitor(t)
	defer a.db.Close()

	if err := a.CancelServerSession("42"); err != nil {
		t.Fatalf("CancelServerSession: %v", err)
	}
	calls := fake.calls()
	if len(calls) != 1 || calls[0].id != "42" || calls[0].force {
		t.Fatalf("expected one soft-cancel call for id 42, got %+v", calls)
	}
}

func TestKillServerSession_CallsBackendCancellerWithForce(t *testing.T) {
	a, fake := setupAppWithFakeSessionMonitor(t)
	defer a.db.Close()

	if err := a.KillServerSession("42"); err != nil {
		t.Fatalf("KillServerSession: %v", err)
	}
	calls := fake.calls()
	if len(calls) != 1 || calls[0].id != "42" || !calls[0].force {
		t.Fatalf("expected one force-kill call for id 42, got %+v", calls)
	}
}

func TestCancelServerSession_MapsPermissionDeniedError(t *testing.T) {
	a, fake := setupAppWithFakeSessionMonitor(t)
	defer a.db.Close()
	fake.cancelErr = errPermissionDeniedFixture{}

	err := a.CancelServerSession("42")
	if err == nil {
		t.Fatal("expected an error")
	}
	if got := strings.ToLower(err.Error()); !strings.Contains(got, "permission denied") {
		t.Errorf("expected a permission-denied message, got %q", err.Error())
	}
}

type errPermissionDeniedFixture struct{}

func (errPermissionDeniedFixture) Error() string {
	return "permission denied for function pg_terminate_backend"
}
