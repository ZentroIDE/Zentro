// SPDX-License-Identifier: GPL-3.0-only

package app

import "time"

// processUsage is a point-in-time reading of what Zentro costs the machine.
type processUsage struct {
	// CPUTime is the cumulative CPU time (user + kernel) of the measured
	// processes; two readings give a utilisation figure.
	CPUTime time.Duration
	// MemBytes is resident memory (working set) of the measured processes.
	MemBytes uint64
}

// readProcessUsage is implemented per platform (stats_resource_*.go). On
// Windows it includes the WebView2 child processes the UI runs in, since the
// Go process alone is a small part of what Task Manager shows for Zentro; on
// macOS/Linux it measures the Go process.
//
// It is a variable so tests can substitute a deterministic reader.
var readProcessUsage = platformProcessUsage
