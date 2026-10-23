// SPDX-License-Identifier: GPL-3.0-only

package app

// StatsService samples the live numbers shown in the status bar: round-trip
// latency to the connected database, Zentro's own database traffic, and its CPU
// and memory use. Pattern: Observer - each sample is pushed to the frontend as
// a stats:sample event. It owns no goroutine until Start is called, so a user
// who turns the stats off pays nothing.

import (
	"context"
	"database/sql"
	goruntime "runtime"
	"sync"
	"time"

	"zentro/internal/constant"
	"zentro/internal/models"
)

// Latency states reported in StatsSample.LatencyState.
const (
	LatencyOK    = "ok"    // LatencyMs holds a measurement
	LatencyBusy  = "busy"  // every pooled connection was in use; skipped, not slow
	LatencyError = "error" // the ping failed
	LatencyNone  = "none"  // nothing to measure (not connected, or SQLite)
)

const (
	minStatsInterval     = time.Second
	maxStatsInterval     = time.Minute
	defaultStatsInterval = 2 * time.Second
	pingTimeout          = 2 * time.Second
)

// StatsSample is one reading, emitted as constant.EventStatsSample.
type StatsSample struct {
	// At is the sample time in unix milliseconds.
	At int64 `json:"at"`
	// LatencyMs is the database round trip; nil unless LatencyState is "ok".
	LatencyMs    *float64 `json:"latency_ms"`
	LatencyState string   `json:"latency_state"`
	// RxBytesPerSec / TxBytesPerSec are Zentro's database traffic only.
	RxBytesPerSec float64 `json:"rx_bytes_per_sec"`
	TxBytesPerSec float64 `json:"tx_bytes_per_sec"`
	// CPUPercent is the share of the whole machine's CPU capacity (0-100).
	CPUPercent float64 `json:"cpu_percent"`
	MemBytes   uint64  `json:"mem_bytes"`
}

// byteCounter is what StatsService needs from a traffic meter.
type byteCounter interface {
	Totals() (rx, tx uint64)
}

type StatsService struct {
	emitter    EventEmitter
	getDB      func() *sql.DB
	getProfile func() *models.ConnectionProfile
	meter      byteCounter

	now         func() time.Time
	minInterval time.Duration

	mu     sync.Mutex
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

// NewStatsService wires the sampler. meter may be nil (traffic reads as zero).
func NewStatsService(
	emitter EventEmitter,
	getDB func() *sql.DB,
	getProfile func() *models.ConnectionProfile,
	meter byteCounter,
) *StatsService {
	return &StatsService{
		emitter:     emitter,
		getDB:       getDB,
		getProfile:  getProfile,
		meter:       meter,
		now:         time.Now,
		minInterval: minStatsInterval,
	}
}

// SetContext sets the Wails runtime context events are emitted on.
func (s *StatsService) SetContext(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ctx = ctx
}

// Start begins sampling every interval (clamped to 1s-60s; 0 means the 2s
// default). Calling it again restarts the loop with the new interval.
func (s *StatsService) Start(interval time.Duration) {
	s.Stop()

	if interval <= 0 {
		interval = defaultStatsInterval
	}
	if interval < s.minInterval {
		interval = s.minInterval
	}
	if interval > maxStatsInterval {
		interval = maxStatsInterval
	}

	s.mu.Lock()
	parent := s.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	s.cancel, s.done = cancel, done
	s.mu.Unlock()

	go func() {
		defer close(done)
		s.run(ctx, interval)
	}()
}

// Stop ends sampling and waits for the loop to exit. Safe to call when idle.
func (s *StatsService) Stop() {
	s.mu.Lock()
	cancel, done := s.cancel, s.done
	s.cancel, s.done = nil, nil
	s.mu.Unlock()
	if cancel == nil {
		return
	}
	cancel()
	<-done
}

// Shutdown stops sampling for good.
func (s *StatsService) Shutdown() { s.Stop() }

// reading is the cumulative state one sample is differenced against.
type reading struct {
	at    time.Time
	rx    uint64
	tx    uint64
	usage processUsage
}

func (s *StatsService) read() reading {
	r := reading{at: s.now()}
	if s.meter != nil {
		r.rx, r.tx = s.meter.Totals()
	}
	if u, err := readProcessUsage(); err == nil {
		r.usage = u
	}
	return r
}

func (s *StatsService) run(ctx context.Context, interval time.Duration) {
	prev := s.read()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cur := s.read()
			sample := buildSample(prev, cur)
			prev = cur
			sample.LatencyMs, sample.LatencyState = s.measureLatency(ctx)
			if ctx.Err() != nil {
				return
			}
			s.mu.Lock()
			emitCtx := s.ctx
			s.mu.Unlock()
			s.emitter.Emit(emitCtx, constant.EventStatsSample, sample)
		}
	}
}

// buildSample turns two cumulative readings into rates. A counter that went
// backwards (process restarted its meter) reads as zero rather than negative.
func buildSample(prev, cur reading) StatsSample {
	sample := StatsSample{
		At:           cur.at.UnixMilli(),
		LatencyState: LatencyNone,
		MemBytes:     cur.usage.MemBytes,
	}
	dt := cur.at.Sub(prev.at).Seconds()
	if dt <= 0 {
		return sample
	}
	sample.RxBytesPerSec = rate(prev.rx, cur.rx, dt)
	sample.TxBytesPerSec = rate(prev.tx, cur.tx, dt)
	if cpu := cur.usage.CPUTime - prev.usage.CPUTime; cpu > 0 {
		percent := cpu.Seconds() / dt / float64(goruntime.NumCPU()) * 100
		if percent > 100 {
			percent = 100
		}
		sample.CPUPercent = percent
	}
	return sample
}

func rate(prev, cur uint64, seconds float64) float64 {
	if cur < prev {
		return 0
	}
	return float64(cur-prev) / seconds
}

// measureLatency times a ping on a connection borrowed from the pool and
// returned straight away, so the sampler never holds one of the (few) pooled
// connections. When every connection is busy the sample is reported as such
// instead of as a misleadingly high latency.
func (s *StatsService) measureLatency(ctx context.Context) (*float64, string) {
	db := s.getDB()
	profile := s.getProfile()
	if db == nil || profile == nil || profile.Driver == constant.DriverSQLite {
		return nil, LatencyNone
	}

	pctx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()

	conn, err := db.Conn(pctx)
	if err != nil {
		if pctx.Err() != nil && ctx.Err() == nil {
			return nil, LatencyBusy
		}
		return nil, LatencyError
	}
	defer conn.Close()

	start := time.Now()
	if err := conn.PingContext(pctx); err != nil {
		return nil, LatencyError
	}
	ms := float64(time.Since(start).Microseconds()) / 1000
	return &ms, LatencyOK
}
