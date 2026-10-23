// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"zentro/internal/constant"
	"zentro/internal/models"
)

type fakeCounter struct{ rx, tx uint64 }

func (f fakeCounter) Totals() (uint64, uint64) { return f.rx, f.tx }

func TestBuildSampleComputesRatesAndCPUShare(t *testing.T) {
	t0 := time.Unix(1000, 0)
	prev := reading{at: t0, rx: 1000, tx: 500, usage: processUsage{CPUTime: time.Second}}
	cur := reading{
		at: t0.Add(2 * time.Second), rx: 5000, tx: 1500,
		usage: processUsage{CPUTime: 2 * time.Second, MemBytes: 64 << 20},
	}

	s := buildSample(prev, cur)

	if s.RxBytesPerSec != 2000 || s.TxBytesPerSec != 500 {
		t.Errorf("rates = %v/%v, want 2000/500 bytes per second", s.RxBytesPerSec, s.TxBytesPerSec)
	}
	if s.MemBytes != 64<<20 {
		t.Errorf("MemBytes = %d", s.MemBytes)
	}
	// 1s of CPU over 2s wall = 50% of one core, divided across all cores.
	if s.CPUPercent <= 0 || s.CPUPercent > 50 {
		t.Errorf("CPUPercent = %v, want a share of the whole machine in (0, 50]", s.CPUPercent)
	}
	if s.LatencyState != LatencyNone || s.LatencyMs != nil {
		t.Errorf("latency is filled in separately; got %q / %v", s.LatencyState, s.LatencyMs)
	}
}

func TestBuildSampleIgnoresCountersThatWentBackwards(t *testing.T) {
	t0 := time.Unix(1000, 0)
	prev := reading{at: t0, rx: 9000, tx: 9000, usage: processUsage{CPUTime: 5 * time.Second}}
	cur := reading{at: t0.Add(time.Second), rx: 10, tx: 10, usage: processUsage{CPUTime: time.Second}}

	s := buildSample(prev, cur)
	if s.RxBytesPerSec != 0 || s.TxBytesPerSec != 0 || s.CPUPercent != 0 {
		t.Fatalf("backwards counters must read as zero, got %+v", s)
	}
}

func TestBuildSampleWithNoElapsedTimeIsZeroRate(t *testing.T) {
	now := time.Unix(1000, 0)
	s := buildSample(reading{at: now, rx: 1}, reading{at: now, rx: 999})
	if s.RxBytesPerSec != 0 {
		t.Fatalf("rate over zero elapsed time = %v, want 0", s.RxBytesPerSec)
	}
}

func newLatencyService(db *sql.DB, driverName string) *StatsService {
	profile := &models.ConnectionProfile{Driver: driverName}
	return NewStatsService(noopEventEmitter{},
		func() *sql.DB { return db },
		func() *models.ConnectionProfile { return profile },
		nil)
}

func TestMeasureLatencyReportsAMeasurement(t *testing.T) {
	db := setupTestDB(t)
	ms, state := newLatencyService(db, constant.DriverPostgres).measureLatency(context.Background())
	if state != LatencyOK || ms == nil || *ms < 0 {
		t.Fatalf("latency = %v / %q, want an ok measurement", ms, state)
	}
}

func TestMeasureLatencyIsNoneWhenNotConnectedOrSQLite(t *testing.T) {
	if _, state := newLatencyService(nil, constant.DriverPostgres).measureLatency(context.Background()); state != LatencyNone {
		t.Errorf("no db: state = %q, want none", state)
	}
	if _, state := newLatencyService(setupTestDB(t), constant.DriverSQLite).measureLatency(context.Background()); state != LatencyNone {
		t.Errorf("sqlite: state = %q, want none", state)
	}
}

func TestMeasureLatencyReportsBusyWhenEveryConnectionIsInUse(t *testing.T) {
	db := setupTestDB(t) // pinned to a single connection
	held, err := db.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()

	svc := newLatencyService(db, constant.DriverPostgres)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	start := time.Now()
	ms, state := svc.measureLatency(ctx)
	if state != LatencyBusy || ms != nil {
		t.Fatalf("latency = %v / %q, want busy (not a misleading slow number)", ms, state)
	}
	if time.Since(start) < pingTimeout/2 {
		t.Errorf("returned after %v; should have waited for the pool before giving up", time.Since(start))
	}
}

func TestMeasureLatencyReportsErrorWhenThePingFails(t *testing.T) {
	db := setupTestDB(t)
	_ = db.Close()
	_, state := newLatencyService(db, constant.DriverPostgres).measureLatency(context.Background())
	if state != LatencyError {
		t.Fatalf("state = %q, want error for a closed database", state)
	}
}

type sampleRecorder struct {
	mu      sync.Mutex
	samples []StatsSample
}

func (r *sampleRecorder) Emit(_ context.Context, name string, payload any) {
	if name != constant.EventStatsSample {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.samples = append(r.samples, payload.(StatsSample))
}

func (r *sampleRecorder) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.samples)
}

func TestStartEmitsSamplesAndStopEndsThem(t *testing.T) {
	rec := &sampleRecorder{}
	svc := NewStatsService(rec,
		func() *sql.DB { return nil },
		func() *models.ConnectionProfile { return nil },
		fakeCounter{rx: 1, tx: 1})
	svc.minInterval = 10 * time.Millisecond

	svc.Start(10 * time.Millisecond)
	deadline := time.Now().Add(3 * time.Second)
	for rec.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if rec.count() < 2 {
		t.Fatalf("got %d samples, want at least 2", rec.count())
	}

	svc.Stop()
	after := rec.count()
	time.Sleep(60 * time.Millisecond)
	if rec.count() != after {
		t.Fatalf("samples kept arriving after Stop: %d -> %d", after, rec.count())
	}
}

func TestStartTwiceRestartsWithoutLeakingTheOldLoop(t *testing.T) {
	rec := &sampleRecorder{}
	svc := NewStatsService(rec,
		func() *sql.DB { return nil },
		func() *models.ConnectionProfile { return nil },
		nil)
	svc.minInterval = 10 * time.Millisecond

	svc.Start(time.Hour) // clamped to the max, effectively idle
	svc.Start(10 * time.Millisecond)
	defer svc.Stop()

	deadline := time.Now().Add(3 * time.Second)
	for rec.count() < 1 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if rec.count() < 1 {
		t.Fatal("restarted sampler never emitted")
	}
}

func TestStopWhenIdleIsHarmless(t *testing.T) {
	svc := NewStatsService(noopEventEmitter{}, func() *sql.DB { return nil }, func() *models.ConnectionProfile { return nil }, nil)
	svc.Stop()
	svc.Shutdown()
}

func TestReadProcessUsageReturnsSomethingOnThisPlatform(t *testing.T) {
	u, err := readProcessUsage()
	if err != nil {
		t.Fatalf("readProcessUsage: %v", err)
	}
	if u.MemBytes == 0 {
		t.Error("expected a non-zero memory figure for the running test process")
	}
}
