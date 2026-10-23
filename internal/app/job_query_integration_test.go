// SPDX-License-Identifier: GPL-3.0-only

package app

// Integration coverage for the query-execution ↔ JobService wiring added in
// query_batch.go/query_execution.go: every ExecuteQuery call should show up
// as an Activity-panel Job (App.ListJobs) and reach a terminal status that
// matches how the query actually ended.

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestExecuteQuery_RegistersJobAndFinishesSucceeded(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	jobEmitter := &recordingJobEmitter{}
	a.svc.Jobs.emitter = jobEmitter

	doneChan := make(chan struct{})
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		if eventName == "query:done" {
			close(doneChan)
		}
	}}
	a.emitter = em
	a.svc.Conn.emitter = em
	a.svc.Query.emitter = em
	a.svc.Tx.emitter = em

	tabID := "job-tab-success"
	a.ExecuteQuery(tabID, "SELECT 1")

	select {
	case <-doneChan:
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	// endQuerySession's jobHandle.Finish call races the query:done event
	// (both fire from the same goroutine right after runBatch returns, but
	// from different call sites), so poll briefly for the terminal status.
	var jobs []*Job
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		jobs = a.ListJobs()
		if len(jobs) == 1 && jobs[0].Status != JobStatusRunning {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	if len(jobs) != 1 {
		t.Fatalf("expected exactly 1 job, got %d: %+v", len(jobs), jobs)
	}
	job := jobs[0]
	if job.Kind != JobKindQuery {
		t.Errorf("kind = %q, want %q", job.Kind, JobKindQuery)
	}
	if job.TabID != tabID {
		t.Errorf("tabID = %q, want %q", job.TabID, tabID)
	}
	if job.Status != JobStatusSucceeded {
		t.Errorf("status = %q, want %q", job.Status, JobStatusSucceeded)
	}
	if job.FinishedAt == nil {
		t.Error("expected FinishedAt to be set")
	}
	if !job.Capabilities.Cancel {
		t.Error("expected a running query job to be cancellable")
	}
}

func TestCancelQuery_CancelsUnderlyingJob(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	jobEmitter := &recordingJobEmitter{}
	a.svc.Jobs.emitter = jobEmitter

	doneChan := make(chan map[string]any, 1)
	var mu sync.Mutex
	var chunkSeen bool
	em := funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
		data, ok := payload.(map[string]any)
		if !ok {
			return
		}
		switch eventName {
		case "query:chunk":
			mu.Lock()
			already := chunkSeen
			chunkSeen = true
			mu.Unlock()
			if !already {
				a.CancelQuery("job-tab-cancel")
			}
		case "query:done":
			doneChan <- data
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
	a.ExecuteQuery("job-tab-cancel", query)

	select {
	case <-doneChan:
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	var jobs []*Job
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		jobs = a.ListJobs()
		if len(jobs) == 1 && jobs[0].Status != JobStatusRunning && jobs[0].Status != JobStatusCancelling {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	if len(jobs) != 1 {
		t.Fatalf("expected exactly 1 job, got %d: %+v", len(jobs), jobs)
	}
	if jobs[0].Status != JobStatusCancelled {
		t.Errorf("status = %q, want %q", jobs[0].Status, JobStatusCancelled)
	}

	// CancelQuery must have driven the job through "cancelling" at some
	// point, not jumped straight to a terminal status — that's what makes
	// the Activity panel's cancel button feel responsive.
	sawCancelling := false
	for _, j := range jobEmitter.updatedJobs() {
		if j.Status == JobStatusCancelling {
			sawCancelling = true
		}
	}
	if !sawCancelling {
		t.Error("expected the job to pass through JobStatusCancelling")
	}
}

func TestExecuteQuery_InternalMarkerNeverRegistersAJob(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	jobEmitter := &recordingJobEmitter{}
	a.svc.Jobs.emitter = jobEmitter

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

	// Schema-cache refresh and other Zentro-internal queries carry this
	// marker (see utils.IsInternalSQL) — they must never clutter the
	// Activity panel the way a user-run query does.
	a.ExecuteQuery("job-tab-internal", `SELECT 1 /* zentro:schema-rev:0 */`)

	select {
	case <-doneChan:
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for query:done")
	}

	if jobs := a.ListJobs(); len(jobs) != 0 {
		t.Errorf("expected no job for an internal query, got %d: %+v", len(jobs), jobs)
	}
}

func TestCancelQuery_OnUnknownTabDoesNotPanic(t *testing.T) {
	a := setupApp(t)
	defer a.db.Close()

	// No job/session was ever started for this tab — CancelQuery must be a
	// harmless no-op, matching CancelQuery_Idempotent's existing contract.
	a.CancelQuery("never-started-tab")

	if jobs := a.ListJobs(); len(jobs) != 0 {
		t.Errorf("expected no jobs, got %d", len(jobs))
	}
}
