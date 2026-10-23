// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

// envResolverFixture is a project with two environments, each a real SQLite
// file in a tempdir, and the connections bound to it. No fixed env is "the
// current one" unless the test sets svc.environment.
func envResolverFixture(t *testing.T) (*AIService, *models.Project) {
	t.Helper()
	core.Register(sqlite.New())

	devPath := filepath.Join(t.TempDir(), "dev.db")
	staPath := filepath.Join(t.TempDir(), "sta.db")
	for _, p := range []string{devPath, staPath} {
		db, err := sql.Open("sqlite", p)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec("create table t(id integer)"); err != nil {
			t.Fatal(err)
		}
		db.Close()
	}

	connections := []*models.ConnectionProfile{
		{ID: "conn-dev", Name: "Dev DB", Driver: constant.DriverSQLite, DBName: devPath},
		{ID: "conn-sta", Name: "Staging DB", Driver: constant.DriverSQLite, DBName: staPath},
	}
	project := &models.Project{
		ID: "proj-1",
		Environments: []models.ProjectEnvironment{
			{Key: "dev", Label: "Development", ConnectionRef: "conn-dev", LastDatabase: devPath, LastSchema: "main"},
			{Key: "sta", Label: "Staging", ConnectionRef: "conn-sta", LastDatabase: staPath, LastSchema: "main"},
			{Key: "pro", Label: "Production"}, // not bound
		},
	}

	svc := toolService(t, "http://127.0.0.1:1")
	svc.project = func() *models.Project { return project }
	svc.loadConnectionsFn = func() ([]*models.ConnectionProfile, error) { return connections, nil }
	// newTestAIService leaves db nil (no ambient connection); give it a
	// stand-in so a test can compare resolveEnv's own *sql.DB against it.
	svc.db = func() *sql.DB { return nil }
	return svc, project
}

func TestResolveEnvOpensItsOwnConnectionWithoutTouchingTheAmbientOne(t *testing.T) {
	svc, _ := envResolverFixture(t)
	ambientDB := svc.db()

	resolved, err := svc.resolveEnv(context.Background(), "sta")
	if err != nil {
		t.Fatalf("resolveEnv: %v", err)
	}
	defer resolved.Close()

	if resolved.DB == nil || resolved.DB == ambientDB {
		t.Fatal("resolveEnv did not open its own *sql.DB")
	}
	if svc.db() != ambientDB {
		t.Fatal("resolveEnv changed the service's ambient db")
	}
	if resolved.Profile.Password != "" {
		t.Fatal("the displayed profile carries a password")
	}
	if resolved.Driver != constant.DriverSQLite {
		t.Fatalf("wrong driver: %q", resolved.Driver)
	}
	var count int
	if err := resolved.DB.QueryRow("select count(*) from t").Scan(&count); err != nil {
		t.Fatalf("the resolved connection does not work: %v", err)
	}
}

func TestResolveEnvDefaultsToTheOpenEnvironmentWhenEnvIsBlank(t *testing.T) {
	svc, _ := envResolverFixture(t)
	svc.environment = func() string { return "sta" }

	resolved, err := svc.resolveEnv(context.Background(), "")
	if err != nil {
		t.Fatalf("resolveEnv: %v", err)
	}
	defer resolved.Close()
	if resolved.Database != "" && !strings.Contains(resolved.Database, "sta") {
		t.Fatalf("resolveEnv did not use the open environment: %+v", resolved)
	}
}

func TestResolveEnvErrorsMatchTheExpectedCodes(t *testing.T) {
	svc, _ := envResolverFixture(t)
	svc.environment = func() string { return "" }

	if _, err := svc.resolveEnv(context.Background(), ""); !hasToolCode(err, aiCodeEnvRequired) {
		t.Fatalf("blank env with nothing open: got %v, want ENV_REQUIRED", err)
	}
	if _, err := svc.resolveEnv(context.Background(), "nope"); !hasToolCode(err, aiCodeEnvNotFound) {
		t.Fatalf("unknown env: got %v, want ENV_NOT_FOUND", err)
	}
	if _, err := svc.resolveEnv(context.Background(), "pro"); !hasToolCode(err, aiCodeNotConnected) {
		t.Fatalf("an unbound environment: got %v, want NOT_CONNECTED", err)
	}

	svc.project = func() *models.Project { return nil }
	if _, err := svc.resolveEnv(context.Background(), "dev"); !hasToolCode(err, aiCodeNotConnected) {
		t.Fatalf("no project open: got %v, want NOT_CONNECTED", err)
	}
}

func TestResolveEnvDoesNotLeakTheRawDriverError(t *testing.T) {
	svc, project := envResolverFixture(t)
	// resolveEnv connects using the environment's own LastDatabase, not the
	// connection profile's DBName (same rule ConnectProjectEnvironment
	// follows), so that is what must be broken here. On Windows a path on a
	// drive that does not exist reliably fails at PingContext (a missing
	// directory, a directory as the path, and a non-database file are all
	// tolerated by this pure-Go driver, modernc.org/sqlite, there). Elsewhere
	// `Q:\...` is just a valid relative filename, so use a path under a
	// missing directory, which fails at Ping.
	brokenPath := filepath.Join(t.TempDir(), "missing", "broken.db")
	if runtime.GOOS == "windows" {
		brokenPath = `Q:\does-not-exist\broken.db`
	}
	project.Environments[0].LastDatabase = brokenPath

	resolved, err := svc.resolveEnv(context.Background(), "dev")
	if err == nil {
		resolved.Close()
		t.Fatal("expected opening a non-database file as a database to fail")
	}
	if strings.Contains(err.Error(), brokenPath) {
		t.Fatalf("the raw path leaked into the error: %v", err)
	}
	if !hasToolCode(err, aiCodeNotConnected) {
		t.Fatalf("got %v, want NOT_CONNECTED", err)
	}
}

func TestResolveEnvClosesExactlyOnceEvenCalledTwice(t *testing.T) {
	svc, _ := envResolverFixture(t)
	resolved, err := svc.resolveEnv(context.Background(), "dev")
	if err != nil {
		t.Fatal(err)
	}
	resolved.Close()
	resolved.Close() // must not panic or double-release the semaphore
}

func TestResolveEnvLimitsConcurrentConnectionsAndAlwaysCleansUp(t *testing.T) {
	svc, _ := envResolverFixture(t)

	// Saturate the limit, holding every slot open.
	var open []*resolvedEnv
	for i := 0; i < envConcurrencyLimit; i++ {
		r, err := svc.resolveEnv(context.Background(), "dev")
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		open = append(open, r)
	}

	// An already-cancelled context means the wait for a free slot ends
	// immediately, deterministically, rather than racing a short timeout.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := svc.resolveEnv(ctx, "dev"); err == nil {
		t.Fatal("a call beyond the concurrency limit was not refused")
	}

	for _, r := range open {
		r.Close()
	}

	// Every slot was released; two full rounds now succeed.
	for round := 0; round < 2; round++ {
		var batch []*resolvedEnv
		for i := 0; i < envConcurrencyLimit; i++ {
			r, err := svc.resolveEnv(context.Background(), "dev")
			if err != nil {
				t.Fatalf("round %d call %d: %v", round, i, err)
			}
			batch = append(batch, r)
		}
		for _, r := range batch {
			r.Close()
		}
	}
}

func TestResolveEnvConcurrentCallsDoNotLeakConnections(t *testing.T) {
	svc, _ := envResolverFixture(t)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := svc.resolveEnv(context.Background(), "dev")
			if err != nil {
				return
			}
			defer r.Close()
			var n int
			_ = r.DB.QueryRow("select 1").Scan(&n)
		}()
	}
	wg.Wait()

	resolved, err := svc.resolveEnv(context.Background(), "dev")
	if err != nil {
		t.Fatalf("resolveEnv after the burst: %v", err)
	}
	defer resolved.Close()
	if stats := resolved.DB.Stats(); stats.OpenConnections > 2 {
		t.Fatalf("connections leaked from the concurrent burst: %+v", stats)
	}
}

// hasToolCode reports whether err is an *aiToolError with the given code.
func hasToolCode(err error, code string) bool {
	var toolErr *aiToolError
	return errors.As(err, &toolErr) && toolErr.Code == code
}
