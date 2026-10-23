// SPDX-License-Identifier: GPL-3.0-only

package app

// JobService tracks every long-running, cancellable operation Zentro starts
// on the user's behalf — queries, exports, imports, and whatever else joins
// the Activity panel later. It owns no domain logic: a caller starts a Job,
// gets back a context (cancelled by JobService.Cancel or Shutdown) and a
// JobHandle, reports progress on the handle as work proceeds, and finishes
// it with the terminal error (nil on success). Pattern: Observer — every
// mutation emits a job:updated (or job:removed) event so the frontend's
// Activity panel stays in sync without polling.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"zentro/internal/constant"
)

// JobKind identifies what kind of long-running operation a Job tracks.
type JobKind string

const (
	JobKindQuery  JobKind = "query"
	JobKindExport JobKind = "export"
	JobKindImport JobKind = "import"
)

// JobStatus is a Job's lifecycle state, as shown in the Activity panel.
type JobStatus string

const (
	JobStatusQueued     JobStatus = "queued"
	JobStatusRunning    JobStatus = "running"
	JobStatusCancelling JobStatus = "cancelling"
	JobStatusSucceeded  JobStatus = "succeeded"
	JobStatusFailed     JobStatus = "failed"
	JobStatusCancelled  JobStatus = "cancelled"
)

func (s JobStatus) isTerminal() bool {
	switch s {
	case JobStatusSucceeded, JobStatusFailed, JobStatusCancelled:
		return true
	default:
		return false
	}
}

// Progress unit constants — informational only, the frontend renders
// whatever string is set here next to the row count/byte count.
const (
	JobProgressUnitRows       = "rows"
	JobProgressUnitBytes      = "bytes"
	JobProgressUnitStatements = "statements"
)

// JobProgress reports how far a Job has gotten. Total == 0 means the total
// is unknown, so the frontend renders an indeterminate bar instead of a
// percentage.
type JobProgress struct {
	Done   int64  `json:"done"`
	Total  int64  `json:"total,omitempty"`
	Unit   string `json:"unit,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// JobCapabilities tells the frontend which actions apply to this Job. Kill
// (server-side terminate) is wired in a later milestone — every Job reports
// it as false until then, regardless of Kind.
type JobCapabilities struct {
	Cancel bool `json:"cancel"`
	Kill   bool `json:"kill"`
}

// Job is a snapshot of one tracked operation, serialized straight to the
// frontend over job:updated/job:removed. Every field must be JSON-safe and
// free of secrets: no connection strings, no full query text or result
// rows — Title is a short, already-truncated display string, not raw SQL
// piped through untouched.
type Job struct {
	ID           string            `json:"id"`
	Kind         JobKind           `json:"kind"`
	Title        string            `json:"title"`
	ProfileName  string            `json:"profileName,omitempty"`
	Database     string            `json:"database,omitempty"`
	TabID        string            `json:"tabId,omitempty"`
	Status       JobStatus         `json:"status"`
	Progress     JobProgress       `json:"progress"`
	StartedAt    time.Time         `json:"startedAt"`
	FinishedAt   *time.Time        `json:"finishedAt,omitempty"`
	Error        string            `json:"error,omitempty"`
	Capabilities JobCapabilities   `json:"capabilities"`
	BackendID    string            `json:"backendId,omitempty"`
	Meta         map[string]string `json:"meta,omitempty"`
}

func (j *Job) clone() *Job {
	c := *j
	if j.FinishedAt != nil {
		finished := *j.FinishedAt
		c.FinishedAt = &finished
	}
	if j.Meta != nil {
		c.Meta = make(map[string]string, len(j.Meta))
		for k, v := range j.Meta {
			c.Meta[k] = v
		}
	}
	return &c
}

// JobSpec describes a Job to be started via JobService.Start.
type JobSpec struct {
	Kind         JobKind
	Title        string
	ProfileName  string
	Database     string
	TabID        string
	Capabilities JobCapabilities
}

// jobProgressEmitInterval throttles job:updated events during a Report()
// storm (e.g. once per row on a fast import), the same way
// progressEmitInterval throttles query started/done events in
// query_batch.go. The final Report before Finish is never dropped — Finish
// always emits.
const jobProgressEmitInterval = 250 * time.Millisecond

// maxJobHistory bounds how many *finished* jobs JobService keeps; the
// oldest finished job is evicted once the count is exceeded. Running jobs
// are never evicted, so a burst of long jobs can briefly exceed this.
const maxJobHistory = 200

// JobHandle is the write side of a Job, held by the goroutine doing the
// work. Report/SetBackendID/Finish are the only way to mutate a Job after
// Start returns.
type JobHandle struct {
	id      string
	service *JobService
}

// ID returns the Job's id, e.g. to correlate it with a QuerySession.
func (h *JobHandle) ID() string { return h.id }

// Report updates progress. Emissions are throttled to
// jobProgressEmitInterval, so callers may report as often as they like
// (once per row, once per statement, ...) without flooding the Wails IPC
// channel.
func (h *JobHandle) Report(done, total int64, unit, detail string) {
	h.service.report(h.id, done, total, unit, detail)
}

// SetBackendID records the server-side identifier (Postgres backend pid,
// MySQL connection id, SQL Server @@SPID) driver.BackendCanceller uses for
// CancelBackend/Kill (see query_batch.go's captureBackendID). Never
// throttled — it changes once, early, and the Activity panel's detail view
// wants it immediately.
func (h *JobHandle) SetBackendID(id string) {
	h.service.setBackendID(h.id, id)
}

// SetMeta records one key/value in the Job's Meta map — e.g. an export
// job's output file path, which the frontend uses to offer "Open file" /
// "Show in folder" once it succeeds. Never throttled.
func (h *JobHandle) SetMeta(key, value string) {
	h.service.setMeta(h.id, key, value)
}

// SetKillFunc registers the action JobService.Kill invokes for a
// force-kill (server-side terminate), and flips Capabilities.Kill to true
// so the frontend shows a Force kill control. A query job registers this
// once, at session start, with a closure that reads the *current* backend
// id lazily at call time (see beginQuerySession in query_batch.go) — so it
// always targets whichever statement is actually running, without needing
// to re-register between statements. Pass nil to withdraw it, e.g. once
// the job is done and its connection is back in the pool.
func (h *JobHandle) SetKillFunc(fn func(ctx context.Context) error) {
	h.service.setKillFunc(h.id, fn)
}

// Cancelled reports whether JobService.Cancel has already been called for
// this Job, letting a work loop check without threading its own context
// plumbing back to the caller.
func (h *JobHandle) Cancelled() bool {
	return h.service.isCancelling(h.id)
}

// Finish marks the Job terminal. A nil error means success; an error that
// unwraps to context.Canceled or context.DeadlineExceeded means the job was
// cancelled (soft cancel or timeout); any other error means it failed.
func (h *JobHandle) Finish(err error) {
	h.service.finish(h.id, err)
}

type jobEntry struct {
	job      *Job
	cancel   context.CancelFunc
	killFunc func(ctx context.Context) error
	lastEmit time.Time
}

// JobService is safe for concurrent use; every mutation is guarded by mu
// and emits its event after releasing it.
type JobService struct {
	mu      sync.Mutex
	jobs    map[string]*jobEntry
	order   []string // insertion order, oldest first
	ctx     context.Context
	logger  *slog.Logger
	emitter EventEmitter
}

func NewJobService(emitter EventEmitter) *JobService {
	return &JobService{
		jobs:    make(map[string]*jobEntry),
		emitter: emitter,
	}
}

// SetContext wires the Wails runtime context used to emit events. Set once
// from App.Startup, read without synchronization elsewhere — the same
// convention QueryService.ctx already follows, safe because it's set before
// any concurrent Job work begins.
func (s *JobService) SetContext(ctx context.Context) { s.ctx = ctx }

func (s *JobService) SetLogger(logger *slog.Logger) { s.logger = logger }

// Start registers a new running Job and returns a context derived from
// parent (also cancelled by Cancel or Shutdown) plus the JobHandle used to
// report progress and finish it. parent is typically context.Background();
// callers that also need a deadline wrap the returned context themselves
// (see beginQuerySession), which composes correctly since cancelling either
// the parent Job context or the wrapping deadline context cancels the leaf.
func (s *JobService) Start(parent context.Context, spec JobSpec) (context.Context, *JobHandle) {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	id := uuid.NewString()
	job := &Job{
		ID:           id,
		Kind:         spec.Kind,
		Title:        spec.Title,
		ProfileName:  spec.ProfileName,
		Database:     spec.Database,
		TabID:        spec.TabID,
		Status:       JobStatusRunning,
		Capabilities: spec.Capabilities,
		StartedAt:    time.Now(),
	}

	s.mu.Lock()
	s.jobs[id] = &jobEntry{job: job, cancel: cancel}
	s.order = append(s.order, id)
	snapshot := job.clone()
	s.mu.Unlock()

	s.emit(snapshot)
	return ctx, &JobHandle{id: id, service: s}
}

func (s *JobService) report(id string, done, total int64, unit, detail string) {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok || entry.job.Status.isTerminal() {
		s.mu.Unlock()
		return
	}
	entry.job.Progress = JobProgress{Done: done, Total: total, Unit: unit, Detail: detail}
	if time.Since(entry.lastEmit) < jobProgressEmitInterval {
		s.mu.Unlock()
		return
	}
	entry.lastEmit = time.Now()
	snapshot := entry.job.clone()
	s.mu.Unlock()

	s.emit(snapshot)
}

func (s *JobService) setBackendID(id, backendID string) {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	entry.job.BackendID = backendID
	snapshot := entry.job.clone()
	s.mu.Unlock()

	s.emit(snapshot)
}

func (s *JobService) setMeta(id, key, value string) {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	if entry.job.Meta == nil {
		entry.job.Meta = make(map[string]string, 1)
	}
	entry.job.Meta[key] = value
	snapshot := entry.job.clone()
	s.mu.Unlock()

	s.emit(snapshot)
}

func (s *JobService) setKillFunc(id string, fn func(ctx context.Context) error) {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	entry.killFunc = fn
	enableKill := fn != nil
	changed := entry.job.Capabilities.Kill != enableKill
	entry.job.Capabilities.Kill = enableKill
	var snapshot *Job
	if changed {
		snapshot = entry.job.clone()
	}
	s.mu.Unlock()

	if snapshot != nil {
		s.emit(snapshot)
	}
}

func (s *JobService) isCancelling(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.jobs[id]
	if !ok {
		return false
	}
	return entry.job.Status == JobStatusCancelling
}

func (s *JobService) finish(id string, err error) {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return
	}
	entry.cancel()
	now := time.Now()
	entry.job.FinishedAt = &now
	switch {
	case err == nil:
		entry.job.Status = JobStatusSucceeded
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		entry.job.Status = JobStatusCancelled
	default:
		entry.job.Status = JobStatusFailed
		entry.job.Error = err.Error()
	}
	snapshot := entry.job.clone()
	evicted := s.evictFinishedLocked()
	s.mu.Unlock()

	// Emit the terminal snapshot first, then job:removed for anything the
	// eviction bumped — including id itself, when history was already at
	// capacity: the frontend briefly sees the job as done before it's
	// dropped from the list, same as any other eviction.
	s.emit(snapshot)
	for _, evictedID := range evicted {
		s.emitRemoved(evictedID)
	}
}

// Cancel requests a soft stop: it flips the Job to "cancelling" and calls
// its context's cancel function. The goroutine doing the work is expected
// to notice ctx.Err() and call Finish, which is what actually marks the Job
// "cancelled" — Cancel itself never sets a terminal status. Cancelling an
// already-terminal or already-cancelling Job is a no-op.
func (s *JobService) Cancel(id string) error {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("job %s not found", id)
	}
	if entry.job.Status.isTerminal() || entry.job.Status == JobStatusCancelling {
		s.mu.Unlock()
		return nil
	}
	if !entry.job.Capabilities.Cancel {
		s.mu.Unlock()
		return fmt.Errorf("job %s cannot be cancelled", id)
	}
	entry.job.Status = JobStatusCancelling
	entry.cancel()
	snapshot := entry.job.clone()
	s.mu.Unlock()

	s.emit(snapshot)
	return nil
}

// Kill force-stops a Job that supports it (Capabilities.Kill): it flips the
// Job to "cancelling" (same visible state Cancel produces — the frontend
// doesn't need a separate status for "kill in flight"), cancels its
// context, and invokes the kill function registered via
// JobHandle.SetKillFunc. For a query Job that runs pg_terminate_backend/
// KILL on the server, ending the whole session — not just the current
// statement — and rolling back any open transaction. The kill function
// runs with its own 5s timeout, independent of the Job's own context
// (which this just cancelled). Killing an already-terminal Job is a no-op;
// killing one without Capabilities.Kill is an error.
func (s *JobService) Kill(id string) error {
	s.mu.Lock()
	entry, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("job %s not found", id)
	}
	if entry.job.Status.isTerminal() {
		s.mu.Unlock()
		return nil
	}
	if !entry.job.Capabilities.Kill || entry.killFunc == nil {
		s.mu.Unlock()
		return fmt.Errorf("job %s cannot be force-killed", id)
	}
	entry.job.Status = JobStatusCancelling
	entry.cancel()
	killFunc := entry.killFunc
	snapshot := entry.job.clone()
	s.mu.Unlock()

	s.emit(snapshot)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := killFunc(ctx); err != nil {
		return fmt.Errorf("force kill job %s: %w", id, err)
	}
	return nil
}

// List returns every tracked Job (running and finished, oldest first).
func (s *JobService) List() []*Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*Job, 0, len(s.order))
	for _, id := range s.order {
		if entry, ok := s.jobs[id]; ok {
			out = append(out, entry.job.clone())
		}
	}
	return out
}

// ClearFinished removes every terminal Job (running jobs are untouched) and
// returns the removed ids, having already emitted job:removed for each.
func (s *JobService) ClearFinished() []string {
	s.mu.Lock()
	var removed []string
	kept := make([]string, 0, len(s.order))
	for _, id := range s.order {
		entry, ok := s.jobs[id]
		if !ok {
			continue
		}
		if entry.job.Status.isTerminal() {
			delete(s.jobs, id)
			removed = append(removed, id)
			continue
		}
		kept = append(kept, id)
	}
	s.order = kept
	s.mu.Unlock()

	for _, id := range removed {
		s.emitRemoved(id)
	}
	return removed
}

// evictFinishedLocked trims the oldest finished jobs once the total count
// exceeds maxJobHistory, oldest-first among terminal jobs. Caller holds mu.
func (s *JobService) evictFinishedLocked() []string {
	if len(s.order) <= maxJobHistory {
		return nil
	}
	overflow := len(s.order) - maxJobHistory
	var evicted []string
	kept := make([]string, 0, len(s.order))
	for _, id := range s.order {
		entry, ok := s.jobs[id]
		if !ok {
			continue
		}
		if overflow > 0 && entry.job.Status.isTerminal() {
			delete(s.jobs, id)
			evicted = append(evicted, id)
			overflow--
			continue
		}
		kept = append(kept, id)
	}
	s.order = kept
	return evicted
}

// Shutdown cancels every non-terminal Job's context, so a query/export/
// import goroutine doesn't outlive the app. Called from App.Shutdown.
func (s *JobService) Shutdown() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, entry := range s.jobs {
		if !entry.job.Status.isTerminal() {
			entry.cancel()
		}
	}
}

func (s *JobService) emit(job *Job) {
	if s.emitter == nil {
		return
	}
	s.emitter.Emit(s.ctx, constant.EventJobUpdated, job)
}

func (s *JobService) emitRemoved(id string) {
	if s.emitter == nil {
		return
	}
	s.emitter.Emit(s.ctx, constant.EventJobRemoved, JobRemovedEvent{ID: id})
}
