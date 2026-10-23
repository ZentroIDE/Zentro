// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"testing"
	"time"

	"zentro/internal/constant"
	"zentro/internal/models"
	"zentro/internal/utils"

	_ "modernc.org/sqlite"
)

type funcEventEmitter struct {
	fn func(context.Context, string, any)
}

func (f funcEventEmitter) Emit(ctx context.Context, eventName string, payload any) {
	if f.fn != nil {
		f.fn(ctx, eventName, payload)
	}
}

// noopEventEmitter discards every event. Used as JobService's default
// emitter in setupApp so query/pinned-query tests that don't care about
// job:updated/job:removed (most of them) never reach the real Wails runtime
// emitter, which calls log.Fatal outside an actual Wails lifecycle context.
type noopEventEmitter struct{}

func (noopEventEmitter) Emit(context.Context, string, any) {}

func setupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test sqlite: %v", err)
	}
	// SQLite :memory: gives each pooled connection its own private database,
	// so tables created on one connection are invisible to the next. Pin the
	// pool to one connection so seeded tables remain visible across the
	// service-internal executor releases (notably FetchMoreRows).
	db.SetMaxOpenConns(1)
	return db
}

func setupApp(t *testing.T) *App {
	a := NewApp()
	a.ctx = context.Background()
	a.logger = utils.NewLogger(nil)
	a.svc.Conn.logger = a.logger
	a.svc.Query.logger = a.logger
	a.svc.Scripts.logger = a.logger
	a.svc.Jobs.SetContext(a.ctx)
	a.svc.Jobs.SetLogger(a.logger)
	a.svc.Jobs.emitter = noopEventEmitter{}
	a.db = setupTestDB(t)
	a.prefs = utils.Preferences{QueryTimeout: 30}
	return a
}

func TestExecuteQuery_50kRows_InitialBatchRespectsViewportFetchWindow(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	// Track emitted events
	events := make([]map[string]any, 0)
	var mu sync.Mutex
	doneChan := make(chan bool)

	em := funcEventEmitter{fn: func(ctx context.Context, eventName string, payload any) {
		data, ok := payload.(map[string]any)
		if !ok {
			return
		}
		mu.Lock()
		data["_eventName"] = eventName
		events = append(events, data)
		mu.Unlock()
		if eventName == "query:done" {
			doneChan <- true
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	tabID := "test-tab-1"

	// SQLite recursive CTE to generate 50000 rows
	query := `WITH RECURSIVE cnt(x) AS (
		SELECT 1
		UNION ALL
		SELECT x+1 FROM cnt
		LIMIT 50000
	)
	SELECT x, 'row ' || x, x * 2 FROM cnt;`

	a.ExecuteQuery(tabID, query)

	select {
	case <-doneChan:
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for query:done")
	}

	// Verify the initial streamed batch
	started := false
	chunks := 0
	totalRows := 0
	seqHashes := make(map[int]bool)
	var doneEvent map[string]any

	for _, ev := range events {
		name := ev["_eventName"].(string)
		switch name {
		case "query:started":
			started = true
			if ev["tabID"] != tabID {
				t.Errorf("expected tabID %s, got %v", tabID, ev["tabID"])
			}
		case "query:chunk":
			chunks++
			seq := ev["seq"].(int)
			if seqHashes[seq] {
				t.Fatalf("duplicate sequence number %d", seq)
			}
			seqHashes[seq] = true
			if ev["tabID"] != tabID {
				t.Errorf("expected tabID %s, got %v", tabID, ev["tabID"])
			}
			if rows, ok := ev["rows"].([][]string); ok {
				totalRows += len(rows)
			}
			if seq == 0 {
				if _, ok := ev["columns"]; !ok {
					t.Errorf("expected columns in chunk seq 0")
				}
			}
		case "query:done":
			doneEvent = ev
		}
	}

	if !started {
		t.Error("query:started event not emitted")
	}
	if totalRows != 100 {
		t.Errorf("expected initial batch to stream 100 rows, got %d", totalRows)
	}
	if chunks != 1 {
		t.Errorf("expected initial batch to emit 1 chunk, got %d", chunks)
	}
	if doneEvent == nil {
		t.Fatal("query:done event not emitted")
	}
	if err, ok := doneEvent["error"]; ok && err != "" {
		t.Errorf("unexpected error in done event: %v", err)
	}
	if hasMore, _ := doneEvent["hasMore"].(bool); !hasMore {
		t.Errorf("expected initial batch to keep hasMore=true")
	}
}

func TestExecuteQuery_CancelMidStream(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()
	a.prefs.ChunkSize = 10

	events := make([]map[string]any, 0)
	var mu sync.Mutex
	doneChan := make(chan bool)

	em := funcEventEmitter{fn: func(ctx context.Context, eventName string, payload any) {
		data, ok := payload.(map[string]any)
		if !ok {
			return
		}
		mu.Lock()
		data["_eventName"] = eventName
		events = append(events, data)
		mu.Unlock()
		if eventName == "query:done" {
			doneChan <- true
		}

		// Cancel query on the second chunk
		if eventName == "query:chunk" {
			seq := data["seq"].(int)
			if seq == 1 {
				a.CancelQuery("test-tab-2")
			}
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	// Wait randomly or read from a slow sequence to ensure cancellation happens before finish
	// randomblob generates fake data to slow down? Or just relying on the chunk interrupt.
	// Actually, context cancellation will abort the database read.
	// modernc.org/sqlite supports context cancellation properly.
	query := `WITH RECURSIVE cnt(x) AS (
		SELECT 1
		UNION ALL
		SELECT x+1 FROM cnt
		LIMIT 100000
	)
	SELECT x FROM cnt;`

	a.ExecuteQuery("test-tab-2", query)

	select {
	case <-doneChan:
	case <-time.After(5 * time.Second):
		t.Fatal("Timeout waiting for query:done")
	}

	// Verify cancellation
	var doneEvent map[string]any
	totalRows := 0
	doneCount := 0

	for _, ev := range events {
		name := ev["_eventName"].(string)
		if name == "query:chunk" {
			if rows, ok := ev["rows"].([][]string); ok {
				totalRows += len(rows)
			}
		}
		if name == "query:done" {
			doneCount++
			doneEvent = ev
		}
	}

	if doneEvent == nil {
		t.Fatal("query:done event not emitted")
	}

	// query:done should have an error because it was cancelled
	errMsg, hasErr := doneEvent["error"]
	if !hasErr || errMsg == "" {
		t.Errorf("expected an error indicating cancellation, got none")
	}

	if totalRows >= 100000 {
		t.Errorf("expected partial rows due to cancellation, but got all %d rows", totalRows)
	}
	if doneCount != 1 {
		t.Errorf("expected exactly one query:done event, got %d", doneCount)
	}
}

func TestExecuteQuery_NonSelect(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	doneChan := make(chan map[string]any)

	em := funcEventEmitter{fn: func(ctx context.Context, eventName string, payload any) {
		if eventName == "query:done" {
			if data, ok := payload.(map[string]any); ok {
				doneChan <- data
			}
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	a.db.Exec("CREATE TABLE users (id INTEGER, name TEXT);")

	a.ExecuteQuery("test-tab-3", "INSERT INTO users (id, name) VALUES (1, 'alice'), (2, 'bob');")

	select {
	case done := <-doneChan:
		if affected, ok := done["affected"].(int64); !ok || affected != 2 {
			t.Errorf("expected 2 affected rows, got %v, error: %v", done["affected"], done["error"])
		}
		if isSel, ok := done["isSelect"].(bool); !ok || isSel {
			t.Errorf("expected isSelect=false")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Timeout waiting for non-select query:done")
	}
}

func TestCancelQuery_Idempotent(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	doneChan := make(chan map[string]any, 1)

	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		if eventName != "query:done" {
			return
		}
		if data, ok := payload.(map[string]any); ok {
			doneChan <- data
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	query := `WITH RECURSIVE cnt(x) AS (
		SELECT 1
		UNION ALL
		SELECT x+1 FROM cnt
		LIMIT 100000
	)
	SELECT x FROM cnt;`
	a.ExecuteQuery("test-tab-cancel-idempotent", query)

	a.CancelQuery("test-tab-cancel-idempotent")
	a.CancelQuery("test-tab-cancel-idempotent")
	a.CancelQuery("test-tab-cancel-idempotent")

	select {
	case done := <-doneChan:
		errMsg, _ := done["error"].(string)
		if errMsg == "" {
			t.Fatalf("expected cancellation error in done payload")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for query:done after cancellation")
	}
}

func TestExplainQuery_Lifecycle(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()
	a.prefs.ChunkSize = 20
	a.profile = &models.ConnectionProfile{
		Name:   "sqlite-test",
		Driver: constant.DriverSQLite,
		DBName: ":memory:",
	}

	doneChan := make(chan map[string]any, 1)
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		if eventName != constant.EventQueryDone {
			return
		}
		if data, ok := payload.(map[string]any); ok {
			doneChan <- data
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	if err := a.ExplainQuery("tab-explain-1", "SELECT 42;", false); err != nil {
		t.Fatalf("ExplainQuery returned error: %v", err)
	}

	select {
	case done := <-doneChan:
		if errMsg, ok := done["error"].(string); ok && errMsg != "" {
			t.Fatalf("expected no explain error, got %q", errMsg)
		}
		statementText, _ := done["statementText"].(string)
		if !strings.HasPrefix(strings.ToUpper(statementText), "EXPLAIN QUERY PLAN") {
			t.Fatalf("expected sqlite explain statement, got %q", statementText)
		}
		if isSelect, _ := done["isSelect"].(bool); !isSelect {
			t.Fatalf("expected explain to be handled as select")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for explain query done event")
	}
}

func TestFetchMoreRows_Lifecycle(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()
	a.prefs.ChunkSize = 50
	if _, err := a.db.Exec(`CREATE TABLE fetch_more_rows (x INTEGER);`); err != nil {
		t.Fatalf("failed to create table: %v", err)
	}
	for i := 1; i <= 300; i++ {
		if _, err := a.db.Exec(`INSERT INTO fetch_more_rows (x) VALUES (?);`, i); err != nil {
			t.Fatalf("failed to seed row %d: %v", i, err)
		}
	}

	doneChan := make(chan map[string]any, 4)
	chunkChan := make(chan map[string]any, 16)
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		data, ok := payload.(map[string]any)
		if !ok {
			return
		}
		if eventName == constant.EventQueryDone {
			doneChan <- data
			return
		}
		if eventName == constant.EventQueryChunk {
			chunkChan <- data
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	query := `SELECT x FROM fetch_more_rows ORDER BY x;`
	a.ExecuteQuery("tab-fetchmore-1", query)

	var firstDone map[string]any
	select {
	case firstDone = <-doneChan:
	case <-time.After(4 * time.Second):
		t.Fatal("timeout waiting first query done")
	}
	if hasMore, _ := firstDone["hasMore"].(bool); !hasMore {
		t.Fatalf("expected hasMore=true for initial query")
	}
	firstBatchRows := 0
drainFirstChunks:
	for {
		select {
		case chunk := <-chunkChan:
			rows, ok := chunk["rows"].([][]string)
			if !ok {
				t.Fatalf("expected chunk rows to be [][]string, got %T", chunk["rows"])
			}
			firstBatchRows += len(rows)
		default:
			break drainFirstChunks
		}
	}
	if firstBatchRows != 100 {
		t.Fatalf("expected initial chunk rows == fetch batch (100), got %d", firstBatchRows)
	}

	a.FetchMoreRows("tab-fetchmore-1", 100)

	var secondDone map[string]any
	select {
	case secondDone = <-doneChan:
	case <-time.After(4 * time.Second):
		t.Fatal("timeout waiting fetch more done")
	}
	if errMsg, ok := secondDone["error"].(string); ok && errMsg != "" {
		t.Fatalf("expected no fetch-more error, got %q", errMsg)
	}

	secondBatchRows := 0
drainSecondChunks:
	for {
		select {
		case chunk := <-chunkChan:
			rows, ok := chunk["rows"].([][]string)
			if !ok {
				t.Fatalf("expected chunk rows to be [][]string, got %T", chunk["rows"])
			}
			secondBatchRows += len(rows)
		default:
			break drainSecondChunks
		}
	}
	if secondBatchRows != 100 {
		t.Fatalf("expected fetch-more chunk rows to equal fetch batch (100), got %d", secondBatchRows)
	}
}

func TestExecuteQuery_WithExplicitLimit_DisablesInfinitePagination(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()
	a.prefs.ChunkSize = 50
	if _, err := a.db.Exec(`CREATE TABLE explicit_limit_rows (x INTEGER);`); err != nil {
		t.Fatalf("failed to create table: %v", err)
	}
	for i := 1; i <= 300; i++ {
		if _, err := a.db.Exec(`INSERT INTO explicit_limit_rows (x) VALUES (?);`, i); err != nil {
			t.Fatalf("failed to seed row %d: %v", i, err)
		}
	}

	doneChan := make(chan map[string]any, 2)
	chunkChan := make(chan map[string]any, 16)
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		data, ok := payload.(map[string]any)
		if !ok {
			return
		}
		if eventName == constant.EventQueryDone {
			doneChan <- data
			return
		}
		if eventName == constant.EventQueryChunk {
			chunkChan <- data
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	a.ExecuteQuery("tab-explicit-limit", `SELECT x FROM explicit_limit_rows ORDER BY x LIMIT 300`)

	var done map[string]any
	select {
	case done = <-doneChan:
	case <-time.After(4 * time.Second):
		t.Fatal("timeout waiting explicit limit query done")
	}

	if hasMore, _ := done["hasMore"].(bool); hasMore {
		t.Fatalf("expected hasMore=false when query already defines LIMIT")
	}

	totalRows := 0
drainLimitedChunks:
	for {
		select {
		case chunk := <-chunkChan:
			rows, ok := chunk["rows"].([][]string)
			if !ok {
				t.Fatalf("expected chunk rows to be [][]string, got %T", chunk["rows"])
			}
			totalRows += len(rows)
		default:
			break drainLimitedChunks
		}
	}
	if totalRows != 300 {
		t.Fatalf("expected explicit LIMIT query to stream all 300 rows, got %d", totalRows)
	}

	a.FetchMoreRows("tab-explicit-limit", 100)

	select {
	case done = <-doneChan:
		if hasMore, _ := done["hasMore"].(bool); hasMore {
			t.Fatalf("expected fetch-more on explicit LIMIT query to report hasMore=false")
		}
	case <-time.After(4 * time.Second):
		t.Fatal("timeout waiting explicit limit fetch-more done")
	}
}

func TestConnectionService_ReconnectAndSwitch_NoActiveConnection(t *testing.T) {
	svc := NewConnectionService(
		context.Background(),
		utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{} },
		func() *sql.DB { return nil },
		func() *models.ConnectionProfile { return nil },
		func() error { return nil },
		func(_ *sql.DB, _ *models.ConnectionProfile) {},
		funcEventEmitter{},
	)

	if err := svc.Reconnect(); err == nil {
		t.Fatalf("expected reconnect to fail when there is no active profile")
	}
	if err := svc.SwitchDatabase("otherdb"); err == nil {
		t.Fatalf("expected switch database to fail when there is no active profile")
	}
}

func TestConnectionService_FetchDatabaseSchema_EmitsSchemaError(t *testing.T) {
	profile := &models.ConnectionProfile{
		Name:   "integration-profile",
		Driver: "unsupported-driver",
		DBName: "db1",
	}

	schemaErrV1 := make(chan map[string]any, 1)
	schemaErrV2 := make(chan SchemaErrorEvent, 1)
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		if eventName == constant.EventSchemaError {
			if data, ok := payload.(map[string]any); ok {
				schemaErrV1 <- data
			}
			return
		}
		if eventName == constant.EventSchemaErrorV2 {
			if data, ok := payload.(SchemaErrorEvent); ok {
				schemaErrV2 <- data
			}
		}
	}}

	svc := NewConnectionService(
		context.Background(),
		utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{SchemaTimeout: 1} },
		func() *sql.DB { return nil },
		func() *models.ConnectionProfile { return profile },
		func() error { return nil },
		func(_ *sql.DB, _ *models.ConnectionProfile) {},
		em,
	)

	if err := svc.FetchDatabaseSchema(profile.Name, profile.DBName, profile); err != nil {
		t.Fatalf("FetchDatabaseSchema should start async flow, got error: %v", err)
	}

	select {
	case payload := <-schemaErrV1:
		if payload["profileName"] != profile.Name {
			t.Fatalf("unexpected profileName in v1 payload: %#v", payload["profileName"])
		}
		errMsg, _ := payload["error"].(string)
		if errMsg == "" {
			t.Fatalf("expected error message in v1 schema error payload")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting schema:error v1 event")
	}

	select {
	case payload := <-schemaErrV2:
		if payload.ProfileName != profile.Name {
			t.Fatalf("unexpected profileName in v2 payload: %s", payload.ProfileName)
		}
		if payload.Error == "" {
			t.Fatalf("expected error message in v2 schema error payload")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting schema:error.v2 event")
	}
}
