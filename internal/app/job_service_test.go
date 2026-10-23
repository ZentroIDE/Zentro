// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"zentro/internal/constant"
)

// recordingJobEmitter captures every event JobService emits, guarded by a
// mutex since JobService emits after releasing its own lock.
type recordingJobEmitter struct {
	mu     sync.Mutex
	events []recordedJobEvent
}

type recordedJobEvent struct {
	name    string
	payload any
}

func (e *recordingJobEmitter) Emit(_ context.Context, name string, payload any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, recordedJobEvent{name: name, payload: payload})
}

func (e *recordingJobEmitter) snapshot() []recordedJobEvent {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]recordedJobEvent, len(e.events))
	copy(out, e.events)
	return out
}

func (e *recordingJobEmitter) updatedJobs() []*Job {
	var out []*Job
	for _, ev := range e.snapshot() {
		if ev.name != constant.EventJobUpdated {
			continue
		}
		job, ok := ev.payload.(*Job)
		if !ok {
			continue
		}
		out = append(out, job)
	}
	return out
}

func newTestJobService() (*JobService, *recordingJobEmitter) {
	emitter := &recordingJobEmitter{}
	svc := NewJobService(emitter)
	svc.SetContext(context.Background())
	return svc, emitter
}

func TestJobService_StartEmitsRunningJob(t *testing.T) {
	svc, emitter := newTestJobService()

	_, handle := svc.Start(context.Background(), JobSpec{
		Kind:         JobKindQuery,
		Title:        "SELECT 1",
		ProfileName:  "local-pg",
		Database:     "sales",
		TabID:        "tab-1",
		Capabilities: JobCapabilities{Cancel: true},
	})

	jobs := svc.List()
	if len(jobs) != 1 {
		t.Fatalf("expected 1 job, got %d", len(jobs))
	}
	got := jobs[0]
	if got.ID != handle.ID() {
		t.Errorf("job id = %q, want %q", got.ID, handle.ID())
	}
	if got.Status != JobStatusRunning {
		t.Errorf("status = %q, want %q", got.Status, JobStatusRunning)
	}
	if got.Kind != JobKindQuery || got.Title != "SELECT 1" || got.ProfileName != "local-pg" || got.Database != "sales" || got.TabID != "tab-1" {
		t.Errorf("unexpected job fields: %+v", got)
	}
	if !got.Capabilities.Cancel || got.Capabilities.Kill {
		t.Errorf("unexpected capabilities: %+v", got.Capabilities)
	}

	updated := emitter.updatedJobs()
	if len(updated) != 1 {
		t.Fatalf("expected 1 job:updated event, got %d", len(updated))
	}
	if updated[0].ID != handle.ID() {
		t.Errorf("emitted job id = %q, want %q", updated[0].ID, handle.ID())
	}
}

func TestJobService_ReportThrottlesEmission(t *testing.T) {
	svc, emitter := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindImport, Title: "orders.csv", Capabilities: JobCapabilities{Cancel: true}})

	for i := int64(1); i <= 5; i++ {
		handle.Report(i, 100, JobProgressUnitRows, "")
	}

	// The Start event plus at most one throttled Report event — five rapid
	// Report calls inside jobProgressEmitInterval must not each emit.
	updated := emitter.updatedJobs()
	if len(updated) > 2 {
		t.Fatalf("expected reports to be throttled (<=2 job:updated events), got %d", len(updated))
	}

	jobs := svc.List()
	if len(jobs) != 1 {
		t.Fatalf("expected 1 job, got %d", len(jobs))
	}
	// The in-memory Job always reflects the latest Report, even when the
	// throttle skipped emitting that update.
	if jobs[0].Progress.Done != 5 || jobs[0].Progress.Total != 100 {
		t.Errorf("progress = %+v, want Done=5 Total=100", jobs[0].Progress)
	}

	time.Sleep(jobProgressEmitInterval + 10*time.Millisecond)
	handle.Report(6, 100, JobProgressUnitRows, "")
	afterWait := emitter.updatedJobs()
	if len(afterWait) != len(updated)+1 {
		t.Fatalf("expected exactly one more job:updated event after the throttle window elapsed, got %d (had %d)", len(afterWait), len(updated))
	}
}

func TestJobService_FinishSuccess(t *testing.T) {
	svc, _ := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindExport, Title: "export"})

	handle.Finish(nil)

	jobs := svc.List()
	if len(jobs) != 1 {
		t.Fatalf("expected 1 job, got %d", len(jobs))
	}
	if jobs[0].Status != JobStatusSucceeded {
		t.Errorf("status = %q, want %q", jobs[0].Status, JobStatusSucceeded)
	}
	if jobs[0].FinishedAt == nil {
		t.Error("expected FinishedAt to be set")
	}
	if jobs[0].Error != "" {
		t.Errorf("expected no error, got %q", jobs[0].Error)
	}
}

func TestJobService_FinishClassifiesCancellationVsFailure(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status JobStatus
	}{
		{"context canceled", context.Canceled, JobStatusCancelled},
		{"context deadline exceeded", context.DeadlineExceeded, JobStatusCancelled},
		{"wrapped context canceled", errWrap{context.Canceled}, JobStatusCancelled},
		{"real failure", errors.New("connection refused"), JobStatusFailed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, _ := newTestJobService()
			_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})
			handle.Finish(tt.err)

			jobs := svc.List()
			if len(jobs) != 1 {
				t.Fatalf("expected 1 job, got %d", len(jobs))
			}
			if jobs[0].Status != tt.status {
				t.Errorf("status = %q, want %q", jobs[0].Status, tt.status)
			}
			if tt.status == JobStatusFailed && jobs[0].Error == "" {
				t.Error("expected Error to be set on failure")
			}
		})
	}
}

type errWrap struct{ err error }

func (e errWrap) Error() string { return "wrapped: " + e.err.Error() }
func (e errWrap) Unwrap() error { return e.err }

func TestJobService_CancelIsIdempotentAndTerminalNoop(t *testing.T) {
	svc, _ := newTestJobService()
	ctx, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q", Capabilities: JobCapabilities{Cancel: true}})

	if err := svc.Cancel(handle.ID()); err != nil {
		t.Fatalf("first Cancel: %v", err)
	}
	if got := svc.List()[0].Status; got != JobStatusCancelling {
		t.Errorf("status after Cancel = %q, want %q", got, JobStatusCancelling)
	}
	if ctx.Err() == nil {
		t.Error("expected job context to be cancelled")
	}

	// Cancelling again is a no-op, not an error.
	if err := svc.Cancel(handle.ID()); err != nil {
		t.Fatalf("second Cancel: %v", err)
	}

	handle.Finish(ctx.Err())
	if err := svc.Cancel(handle.ID()); err != nil {
		t.Fatalf("Cancel on a terminal job should be a no-op, got error: %v", err)
	}
	if got := svc.List()[0].Status; got != JobStatusCancelled {
		t.Errorf("status after Finish = %q, want %q", got, JobStatusCancelled)
	}
}

func TestJobService_CancelRejectsUnsupportedOrUnknown(t *testing.T) {
	svc, _ := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindExport, Title: "e"}) // Capabilities.Cancel left false

	if err := svc.Cancel(handle.ID()); err == nil {
		t.Error("expected an error cancelling a job with Capabilities.Cancel=false")
	}
	if err := svc.Cancel("does-not-exist"); err == nil {
		t.Error("expected an error cancelling an unknown job id")
	}
}

func TestJobService_SetKillFuncTogglesCapability(t *testing.T) {
	svc, emitter := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})

	if svc.List()[0].Capabilities.Kill {
		t.Fatal("expected Capabilities.Kill to start false")
	}

	handle.SetKillFunc(func(context.Context) error { return nil })
	if !svc.List()[0].Capabilities.Kill {
		t.Fatal("expected Capabilities.Kill to become true once a kill func is set")
	}

	handle.SetKillFunc(nil)
	if svc.List()[0].Capabilities.Kill {
		t.Fatal("expected Capabilities.Kill to go back to false once withdrawn")
	}

	var sawKillTrue bool
	for _, j := range emitter.updatedJobs() {
		if j.Capabilities.Kill {
			sawKillTrue = true
		}
	}
	if !sawKillTrue {
		t.Error("expected a job:updated event while Capabilities.Kill was true")
	}
}

func TestJobService_KillInvokesKillFuncAndCancelsContext(t *testing.T) {
	svc, _ := newTestJobService()
	ctx, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})

	var gotCtx context.Context
	handle.SetKillFunc(func(killCtx context.Context) error {
		gotCtx = killCtx
		return nil
	})

	if err := svc.Kill(handle.ID()); err != nil {
		t.Fatalf("Kill: %v", err)
	}
	if gotCtx == nil {
		t.Fatal("expected the kill func to be invoked")
	}
	if ctx.Err() == nil {
		t.Error("expected Kill to cancel the job's own context, same as Cancel")
	}
	if got := svc.List()[0].Status; got != JobStatusCancelling {
		t.Errorf("status after Kill = %q, want %q", got, JobStatusCancelling)
	}
}

func TestJobService_KillPropagatesKillFuncError(t *testing.T) {
	svc, _ := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})
	handle.SetKillFunc(func(context.Context) error { return errors.New("terminate failed") })

	err := svc.Kill(handle.ID())
	if err == nil {
		t.Fatal("expected Kill to propagate the kill func's error")
	}
}

func TestJobService_KillRejectsUnsupportedTerminalOrUnknown(t *testing.T) {
	svc, _ := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"}) // no kill func

	if err := svc.Kill(handle.ID()); err == nil {
		t.Error("expected an error killing a job with no kill func registered")
	}
	if err := svc.Kill("does-not-exist"); err == nil {
		t.Error("expected an error killing an unknown job id")
	}

	killed := false
	_, terminalHandle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q2"})
	terminalHandle.SetKillFunc(func(context.Context) error { killed = true; return nil })
	terminalHandle.Finish(nil)
	if err := svc.Kill(terminalHandle.ID()); err != nil {
		t.Fatalf("Kill on a terminal job should be a no-op, got error: %v", err)
	}
	if killed {
		t.Error("expected the kill func not to run once the job is already terminal")
	}
}

func TestJobService_ClearFinishedKeepsRunningJobs(t *testing.T) {
	svc, emitter := newTestJobService()
	_, running := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "running"})
	_, done := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "done"})
	done.Finish(nil)

	removed := svc.ClearFinished()
	if len(removed) != 1 || removed[0] != done.ID() {
		t.Fatalf("removed = %v, want [%s]", removed, done.ID())
	}

	jobs := svc.List()
	if len(jobs) != 1 || jobs[0].ID != running.ID() {
		t.Fatalf("expected only the running job to remain, got %+v", jobs)
	}

	var sawRemoved bool
	for _, ev := range emitter.snapshot() {
		if ev.name != constant.EventJobRemoved {
			continue
		}
		payload, ok := ev.payload.(JobRemovedEvent)
		if ok && payload.ID == done.ID() {
			sawRemoved = true
		}
	}
	if !sawRemoved {
		t.Error("expected a job:removed event for the cleared job")
	}
}

func TestJobService_HistoryRingBufferEvictsOldestFinished(t *testing.T) {
	svc, _ := newTestJobService()

	var firstID string
	for i := 0; i < maxJobHistory+5; i++ {
		_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})
		if i == 0 {
			firstID = handle.ID()
		}
		handle.Finish(nil)
	}

	jobs := svc.List()
	if len(jobs) != maxJobHistory {
		t.Fatalf("expected history capped at %d, got %d", maxJobHistory, len(jobs))
	}
	for _, j := range jobs {
		if j.ID == firstID {
			t.Fatalf("expected the oldest finished job %q to be evicted", firstID)
		}
	}
}

func TestJobService_HistoryRingBufferNeverEvictsRunningJobs(t *testing.T) {
	svc, _ := newTestJobService()

	_, stillRunning := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "long-running"})
	for i := 0; i < maxJobHistory+20; i++ {
		_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})
		handle.Finish(nil)
	}

	found := false
	for _, j := range svc.List() {
		if j.ID == stillRunning.ID() {
			found = true
			if j.Status != JobStatusRunning {
				t.Errorf("expected still-running job to stay running, got %q", j.Status)
			}
		}
	}
	if !found {
		t.Fatal("expected the still-running job to never be evicted")
	}
}

func TestJobService_ShutdownCancelsRunningJobs(t *testing.T) {
	svc, _ := newTestJobService()
	ctx, _ := svc.Start(context.Background(), JobSpec{Kind: JobKindQuery, Title: "q"})

	svc.Shutdown()

	select {
	case <-ctx.Done():
	default:
		t.Fatal("expected job context to be cancelled by Shutdown")
	}
}

func TestJobService_CloneIsIndependent(t *testing.T) {
	svc, _ := newTestJobService()
	_, handle := svc.Start(context.Background(), JobSpec{Kind: JobKindImport, Title: "q"})

	first := svc.List()[0]
	first.Title = "mutated"
	first.Progress.Done = 999

	second := svc.List()[0]
	if second.Title == "mutated" || second.Progress.Done == 999 {
		t.Error("mutating a List() snapshot must not affect JobService's internal state")
	}
	_ = handle
}
