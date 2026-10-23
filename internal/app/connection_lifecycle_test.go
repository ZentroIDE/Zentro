// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
	"zentro/internal/utils"
)

type capturedEvent struct {
	name    string
	payload any
}

// newSyncEmitter returns a funcEventEmitter that records every emitted event
// under a mutex, since ConnectWithProfile/SwitchDatabase fire a background
// fetchDatabaseList goroutine that keeps emitting after the synchronous call
// returns.
func newSyncEmitter() (funcEventEmitter, func() []string) {
	var mu sync.Mutex
	var events []capturedEvent

	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, capturedEvent{name: eventName, payload: payload})
	}}

	connectionStatuses := func() []string {
		mu.Lock()
		defer mu.Unlock()
		var out []string
		for _, ev := range events {
			if ev.name != constant.EventConnectionChangedV2 {
				continue
			}
			if payload, ok := ev.payload.(ConnectionChangedEvent); ok {
				out = append(out, payload.Status)
			}
		}
		return out
	}

	return em, connectionStatuses
}

type connState struct {
	db             *sql.DB
	prof           *models.ConnectionProfile
	rollbackCalled bool
}

// newLifecycleTestServiceForTest is for tests that don't assert on emitted
// events (e.g. catalog CRUD tests), so they don't need to wire up a capture.
func newLifecycleTestServiceForTest(state *connState) *ConnectionService {
	em, _ := newSyncEmitter()
	return newLifecycleTestService(state, em)
}

func newLifecycleTestService(state *connState, em EventEmitter) *ConnectionService {
	svc := NewConnectionService(
		context.Background(),
		utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{ConnectTimeout: 5} },
		func() *sql.DB { return state.db },
		func() *models.ConnectionProfile { return state.prof },
		func() error { state.rollbackCalled = true; return nil },
		func(db *sql.DB, p *models.ConnectionProfile) { state.db = db; state.prof = p },
		em,
	)
	// The real Wails runtime requires a context bound to the app's lifecycle
	// hooks and calls log.Fatalf (os.Exit) otherwise — see setWindowTitle's
	// doc comment on ConnectionService.
	svc.setWindowTitle = func(context.Context, string) {}
	return svc
}

func TestConnectWithProfile_Success(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-connect-ok", openDB: setupTestDB(t)}
	core.Register(fake)

	state := &connState{}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)
	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name}

	if err := svc.ConnectWithProfile(prof); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state.db == nil || state.prof != prof {
		t.Fatalf("expected setDB to be called with the opened db and profile, got db=%v prof=%v", state.db, state.prof)
	}
	if statuses := connectionStatuses(); len(statuses) != 2 || statuses[0] != constant.StatusConnecting || statuses[1] != constant.StatusConnected {
		t.Fatalf("unexpected connection statuses: %v", statuses)
	}
}

func TestConnectWithProfile_OpenFails(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-connect-open-fail", openErr: errors.New("boom")}
	core.Register(fake)

	state := &connState{}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)
	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name}

	if err := svc.ConnectWithProfile(prof); err == nil {
		t.Fatalf("expected error when open fails")
	}
	if state.db != nil {
		t.Fatalf("expected db to remain nil after open failure, got %v", state.db)
	}
	if statuses := connectionStatuses(); len(statuses) != 2 || statuses[0] != constant.StatusConnecting || statuses[1] != constant.StatusError {
		t.Fatalf("unexpected connection statuses: %v", statuses)
	}
}

func TestConnectWithProfile_PingFails(t *testing.T) {
	closedDB := setupTestDB(t)
	closedDB.Close()
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-connect-ping-fail", openDB: closedDB}
	core.Register(fake)

	state := &connState{}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)
	prof := &models.ConnectionProfile{Name: "p1", Driver: fake.name}

	if err := svc.ConnectWithProfile(prof); err == nil {
		t.Fatalf("expected error when ping fails")
	}
	if statuses := connectionStatuses(); len(statuses) != 2 || statuses[0] != constant.StatusConnecting || statuses[1] != constant.StatusError {
		t.Fatalf("unexpected connection statuses: %v", statuses)
	}
}

func TestSwitchDatabase_SameDatabase_NoOp(t *testing.T) {
	state := &connState{prof: &models.ConnectionProfile{Name: "p1", Driver: "sqlite", DBName: "db1"}}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)

	if err := svc.SwitchDatabase("db1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if statuses := connectionStatuses(); len(statuses) != 0 {
		t.Fatalf("expected no events for a same-database switch, got %v", statuses)
	}
}

func TestSwitchDatabase_Success(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-switch-ok", openDB: setupTestDB(t)}
	core.Register(fake)

	state := &connState{prof: &models.ConnectionProfile{Name: "p1", Driver: fake.name, DBName: "db1"}}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)

	if err := svc.SwitchDatabase("db2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state.db == nil || state.prof.DBName != "db2" {
		t.Fatalf("expected switched profile with new db name, got %+v", state.prof)
	}
	if statuses := connectionStatuses(); len(statuses) != 2 || statuses[0] != constant.StatusConnecting || statuses[1] != constant.StatusConnected {
		t.Fatalf("unexpected connection statuses: %v", statuses)
	}
}

func TestSwitchDatabase_OpenFails(t *testing.T) {
	fake := &fakeConnDriver{SQLiteDriver: sqlite.New(), name: "fake-switch-open-fail", openErr: errors.New("boom")}
	core.Register(fake)

	state := &connState{prof: &models.ConnectionProfile{Name: "p1", Driver: fake.name, DBName: "db1"}}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)

	if err := svc.SwitchDatabase("db2"); err == nil {
		t.Fatalf("expected error when open fails")
	}
	if statuses := connectionStatuses(); len(statuses) != 2 || statuses[0] != constant.StatusConnecting || statuses[1] != constant.StatusError {
		t.Fatalf("unexpected connection statuses: %v", statuses)
	}
}

func TestDisconnect(t *testing.T) {
	state := &connState{db: setupTestDB(t), prof: &models.ConnectionProfile{Name: "p1"}}
	em, connectionStatuses := newSyncEmitter()
	svc := newLifecycleTestService(state, em)

	svc.Disconnect()

	if state.db != nil || state.prof != nil {
		t.Fatalf("expected setDB(nil, nil), got db=%v prof=%v", state.db, state.prof)
	}
	if !state.rollbackCalled {
		t.Fatalf("expected rollbackActiveTx to be called")
	}
	statuses := connectionStatuses()
	if len(statuses) != 1 || statuses[0] != constant.StatusDisconnected {
		t.Fatalf("unexpected connection statuses: %v", statuses)
	}
}

func TestGetConnectionStatus(t *testing.T) {
	state := &connState{}
	em, _ := newSyncEmitter()
	svc := newLifecycleTestService(state, em)

	got, err := svc.GetConnectionStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Status != constant.StatusDisconnected {
		t.Fatalf("expected disconnected status with no db, got %q", got.Status)
	}

	state.db = setupTestDB(t)
	state.prof = &models.ConnectionProfile{Name: "p1"}
	got, err = svc.GetConnectionStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Status != constant.StatusConnected || got.Profile != state.prof {
		t.Fatalf("unexpected connected status: %+v", got)
	}
}
