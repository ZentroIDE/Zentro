// SPDX-License-Identifier: GPL-3.0-only

package querystat

import "time"

// maxRingSize is the default capacity of the in-memory ring buffer.
// Using a slice (not array) keeps this changeable without a refactor.
const maxRingSize = 5000 // ~1 MB at ~200 bytes/entry

// ExecutionEvent is the raw event delivered by the observer closure in app.go.
// Profile and Driver are resolved at call site to avoid importing the app package.
type ExecutionEvent struct {
	Profile       string
	Driver        string
	IsSelect      bool
	DurationMs    int64
	RowCount      int64
	IsError       bool
	RiskLevel     string
	StatementText string // raw SQL; NormalizedSQL is derived inside Observe
}

// Entry is one query execution recorded in the ring buffer.
type Entry struct {
	At            time.Time
	Profile       string
	Driver        string
	IsSelect      bool
	DurationMs    int64
	RowCount      int64
	IsError       bool
	RiskLevel     string
	NormalizedSQL string // literals replaced with ?, whitespace collapsed
}

// StatFilter controls which entries GetReport aggregates.
type StatFilter struct {
	Profile    string `json:"profile"`     // "" = all profiles
	Driver     string `json:"driver"`      // "" = all drivers
	WindowMins int    `json:"window_mins"` // 0 = all time in buffer
	Limit      int    `json:"limit"`       // top-N rows per list (default 20)
}

// QueryPattern groups executions that share the same NormalizedSQL.
type QueryPattern struct {
	NormalizedSQL  string  `json:"normalized_sql"`
	ExecCount      int     `json:"exec_count"`
	ErrorCount     int     `json:"error_count"`
	AvgMs          float64 `json:"avg_ms"`
	P95Ms          int64   `json:"p95_ms"`
	MaxMs          int64   `json:"max_ms"`
	TotalMs        int64   `json:"total_ms"`         // impact score — sort key for TopImpact
	LastDurationMs int64   `json:"last_duration_ms"` // latest run, regression signal
	LastSeenAt     string  `json:"last_seen_at"`
}

// HourlyBucket holds aggregated stats for one clock-hour.
type HourlyBucket struct {
	HourLabel  string  `json:"hour"` // "14:00" (local time)
	Count      int     `json:"count"`
	ErrorCount int     `json:"error_count"`
	AvgMs      float64 `json:"avg_ms"`
}

// StatReport is returned by GetReport and serialized directly to the FE.
type StatReport struct {
	TotalExecs    int            `json:"total_execs"`
	ErrorRate     float64        `json:"error_rate"` // 0.0–1.0
	AvgDurationMs float64        `json:"avg_duration_ms"`
	P95DurationMs int64          `json:"p95_duration_ms"`
	TopImpact     []QueryPattern `json:"top_impact"`     // sorted by TotalMs desc
	TopFrequent   []QueryPattern `json:"top_frequent"`   // sorted by ExecCount desc
	HourlyBuckets []HourlyBucket `json:"hourly_buckets"` // last 24 clock-hours
	ProfileName   string         `json:"profile_name"`
	WindowMins    int            `json:"window_mins"`
}
