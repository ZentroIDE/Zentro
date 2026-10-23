// SPDX-License-Identifier: GPL-3.0-only

package querystat

import (
	"context"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"zentro/internal/utils"
)

// Service implements ExtensionService.
// It maintains a fixed-capacity ring buffer of recent query executions
// and aggregates them on demand via GetReport.
type Service struct {
	mu    sync.RWMutex
	ring  []Entry // circular buffer, capacity = maxRingSize
	head  int     // next write position
	count int     // number of entries written (capped at maxRingSize)
}

// New returns an initialized Service ready for use.
func New() *Service {
	return &Service{ring: make([]Entry, maxRingSize)}
}

// --- ExtensionService ---

func (s *Service) Name() string                                    { return "querystat" }
func (s *Service) Startup(_ context.Context, _ *slog.Logger) error { return nil }
func (s *Service) Shutdown() error                                 { return nil }

// --- Ring buffer ---

// isInternalQuery reports whether a raw SQL statement is an internal Zentro
// instrumentation query that should not appear in user-facing statistics.
// Currently matches the schema-refresh marker appended by the TableInfo panel.
func isInternalQuery(sql string) bool { return utils.IsInternalSQL(sql) }

// Observe records one query execution. Called by the observer closure in app.go.
// Acquires write lock for ≤1 µs; normalization happens while lock is held
// (regex is fast, truncate on first call).
func (s *Service) Observe(ev ExecutionEvent) {
	if isInternalQuery(ev.StatementText) {
		return
	}
	entry := Entry{
		At:            time.Now(),
		Profile:       ev.Profile,
		Driver:        ev.Driver,
		IsSelect:      ev.IsSelect,
		DurationMs:    ev.DurationMs,
		RowCount:      ev.RowCount,
		IsError:       ev.IsError,
		RiskLevel:     ev.RiskLevel,
		NormalizedSQL: normalizeSQL(ev.StatementText),
	}

	s.mu.Lock()
	s.ring[s.head] = entry
	s.head = (s.head + 1) % maxRingSize
	if s.count < maxRingSize {
		s.count++
	}
	s.mu.Unlock()
}

// --- Aggregation ---

// GetReport aggregates the ring buffer according to filter.
func (s *Service) GetReport(filter StatFilter) StatReport {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}

	s.mu.RLock()
	entries := s.snapshot(filter)
	s.mu.RUnlock()

	if len(entries) == 0 {
		return StatReport{ProfileName: filter.Profile, WindowMins: filter.WindowMins}
	}

	// --- Global stats ---
	var totalMs int64
	var errCount int
	var durations []int64
	for _, e := range entries {
		totalMs += e.DurationMs
		durations = append(durations, e.DurationMs)
		if e.IsError {
			errCount++
		}
	}
	n := len(entries)
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	p95 := durations[int(float64(n)*0.95)]

	// --- Per-pattern aggregation ---
	type agg struct {
		ExecCount  int
		ErrorCount int
		TotalMs    int64
		MaxMs      int64
		LastMs     int64
		LastSeenAt time.Time
		durations  []int64
	}
	patterns := make(map[string]*agg)
	for _, e := range entries {
		a, ok := patterns[e.NormalizedSQL]
		if !ok {
			a = &agg{}
			patterns[e.NormalizedSQL] = a
		}
		a.ExecCount++
		a.TotalMs += e.DurationMs
		a.durations = append(a.durations, e.DurationMs)
		if e.DurationMs > a.MaxMs {
			a.MaxMs = e.DurationMs
		}
		if e.IsError {
			a.ErrorCount++
		}
		if e.At.After(a.LastSeenAt) {
			a.LastSeenAt = e.At
			a.LastMs = e.DurationMs
		}
	}

	all := make([]QueryPattern, 0, len(patterns))
	for nsql, a := range patterns {
		sort.Slice(a.durations, func(i, j int) bool { return a.durations[i] < a.durations[j] })
		p95pat := a.durations[int(float64(len(a.durations))*0.95)]
		all = append(all, QueryPattern{
			NormalizedSQL:  nsql,
			ExecCount:      a.ExecCount,
			ErrorCount:     a.ErrorCount,
			AvgMs:          float64(a.TotalMs) / float64(a.ExecCount),
			P95Ms:          p95pat,
			MaxMs:          a.MaxMs,
			TotalMs:        a.TotalMs,
			LastDurationMs: a.LastMs,
			LastSeenAt:     a.LastSeenAt.Format(time.RFC3339),
		})
	}

	// TopImpact: sort by TotalMs desc (ImpactScore = AvgMs × ExecCount)
	impact := make([]QueryPattern, len(all))
	copy(impact, all)
	sort.Slice(impact, func(i, j int) bool { return impact[i].TotalMs > impact[j].TotalMs })
	if len(impact) > limit {
		impact = impact[:limit]
	}

	// TopFrequent: sort by ExecCount desc
	frequent := make([]QueryPattern, len(all))
	copy(frequent, all)
	sort.Slice(frequent, func(i, j int) bool { return frequent[i].ExecCount > frequent[j].ExecCount })
	if len(frequent) > limit {
		frequent = frequent[:limit]
	}

	// HourlyBuckets: last 24 complete clock-hours
	buckets := buildHourlyBuckets(entries)

	avgMs := 0.0
	if n > 0 {
		avgMs = float64(totalMs) / float64(n)
	}
	errRate := 0.0
	if n > 0 {
		errRate = float64(errCount) / float64(n)
	}

	return StatReport{
		TotalExecs:    n,
		ErrorRate:     errRate,
		AvgDurationMs: avgMs,
		P95DurationMs: p95,
		TopImpact:     impact,
		TopFrequent:   frequent,
		HourlyBuckets: buckets,
		ProfileName:   filter.Profile,
		WindowMins:    filter.WindowMins,
	}
}

// snapshot copies ring entries matching filter while caller holds RLock.
func (s *Service) snapshot(filter StatFilter) []Entry {
	if s.count == 0 {
		return nil
	}
	cutoff := time.Time{}
	if filter.WindowMins > 0 {
		cutoff = time.Now().Add(-time.Duration(filter.WindowMins) * time.Minute)
	}

	out := make([]Entry, 0, s.count)
	// Iterate oldest→newest: start at head (next write pos) when buffer is full,
	// or at 0 when not yet full.
	start := 0
	if s.count == maxRingSize {
		start = s.head
	}
	for i := 0; i < s.count; i++ {
		e := s.ring[(start+i)%maxRingSize]
		if !cutoff.IsZero() && e.At.Before(cutoff) {
			continue
		}
		if filter.Profile != "" && e.Profile != filter.Profile {
			continue
		}
		if filter.Driver != "" && e.Driver != filter.Driver {
			continue
		}
		out = append(out, e)
	}
	return out
}

func buildHourlyBuckets(entries []Entry) []HourlyBucket {
	if len(entries) == 0 {
		return nil
	}
	type bucketAgg struct {
		count    int
		errCount int
		totalMs  int64
	}
	now := time.Now()
	buckets := make(map[string]*bucketAgg)
	order := make([]string, 0, 24)
	seen := make(map[string]bool)

	// Pre-populate last 24 hours (oldest first).
	for h := 23; h >= 0; h-- {
		t := now.Add(-time.Duration(h) * time.Hour)
		label := t.Format("15:00")
		if !seen[label] {
			seen[label] = true
			order = append(order, label)
			buckets[label] = &bucketAgg{}
		}
	}

	for _, e := range entries {
		label := e.At.Local().Format("15:00")
		b, ok := buckets[label]
		if !ok {
			continue // outside the 24-hour window
		}
		b.count++
		b.totalMs += e.DurationMs
		if e.IsError {
			b.errCount++
		}
	}

	result := make([]HourlyBucket, 0, len(order))
	for _, label := range order {
		b := buckets[label]
		avg := 0.0
		if b.count > 0 {
			avg = float64(b.totalMs) / float64(b.count)
		}
		result = append(result, HourlyBucket{
			HourLabel:  label,
			Count:      b.count,
			ErrorCount: b.errCount,
			AvgMs:      avg,
		})
	}
	return result
}

// --- SQL normalization ---

var (
	reStrings = regexp.MustCompile(`'[^']*'`)
	reNumbers = regexp.MustCompile(`\b\d+\b`)
	reSpaces  = regexp.MustCompile(`\s+`)
)

// normalizeSQL strips string literals and numeric literals, collapses whitespace,
// and uppercases the result. Two queries differing only in literal values will
// produce the same key. This is NOT a cryptographic fingerprint.
func normalizeSQL(sql string) string {
	s := strings.TrimSpace(sql)
	s = reStrings.ReplaceAllString(s, "?")
	s = reNumbers.ReplaceAllString(s, "?")
	s = strings.ToUpper(s)
	s = reSpaces.ReplaceAllString(s, " ")
	if len(s) > 120 {
		s = s[:117] + "..."
	}
	return s
}
